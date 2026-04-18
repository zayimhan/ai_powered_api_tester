import json
import os
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .state import ScenarioState, StepEvaluation, HealProposal
from .template_resolver import resolve, has_unresolved
from .http_executor import execute as http_execute


# ─── Terminal logging helpers ──────────────────────────────────────────────────

def _log(text: str):
    print(text, flush=True)

def _divider():
    _log("─" * 60)

def _log_step_start(idx: int, total: int, description: str, actor: str, method: str, url: str):
    _divider()
    actor_tag = f" [{actor}]" if actor else ""
    _log(f"## Step {idx + 1}/{total}{actor_tag}: {description}")
    _log(f"   {method.upper()} {url}")

def _log_step_result(status_code: int, elapsed_ms: int, passed: bool, assertions: list):
    icon = "✅" if passed else "❌"
    _log(f"   {icon}  HTTP {status_code}  ({elapsed_ms}ms)")
    for a in assertions:
        a_icon = "  ✓" if a.get("passed") else "  ✗"
        a_type = a.get("type", "")
        expected = a.get("expected", "")
        actual = a.get("actual", "")
        if a.get("passed"):
            _log(f"   {a_icon} {a_type}" + (f" = {expected}" if expected else ""))
        else:
            _log(f"   {a_icon} {a_type}  expected: {expected}  got: {actual}")

def _log_evaluator(feedback: str):
    _log(f"\n   🤖 **Evaluator:** {feedback}")

def _log_healer(explanation: str, attempt: int):
    _log(f"\n   🔧 **Healer (attempt {attempt}):** {explanation}")

def _log_scenario_end(final_status: str, passed: int, total: int):
    _divider()
    icon = "🎉" if final_status == "passed" else "💥"
    _log(f"\n{icon} **Scenario {final_status.upper()}** — {passed}/{total} steps passed\n")

# ─── LLM clients ──────────────────────────────────────────────────────────────

def _make_evaluator_llm():
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
        api_key=os.environ.get("OPENAI_API_KEY"),
    ).with_structured_output(StepEvaluation)


def _make_healer_llm():
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
        api_key=os.environ.get("OPENAI_API_KEY"),
    ).with_structured_output(HealProposal)


# Lazy singletons — initialized once on first use
_evaluator_llm = None
_healer_llm = None


def get_evaluator_llm():
    global _evaluator_llm
    if _evaluator_llm is None:
        _evaluator_llm = _make_evaluator_llm()
    return _evaluator_llm


def get_healer_llm():
    global _healer_llm
    if _healer_llm is None:
        _healer_llm = _make_healer_llm()
    return _healer_llm


# ─── Node 1: prepare_step ─────────────────────────────────────────────────────

def prepare_step(state: ScenarioState) -> Dict[str, Any]:
    idx = state["current_step_index"]
    step = state["plan_steps"][idx]
    context = dict(state["context"])  # kopya al — in-place mutasyon state'i bozmasın
    run_id = state["run_id"]
    actor = step.get("actor") or ""

    saved_request = step.get("saved_request") or {}

    # Build base config from saved request
    saved_headers = saved_request.get("headers") or {}
    if isinstance(saved_headers, str):
        try:
            saved_headers = json.loads(saved_headers)
        except Exception:
            saved_headers = {}

    # Strip hardcoded Authorization so dynamic token takes over
    if context.get("token"):
        saved_headers = {k: v for k, v in saved_headers.items()
                        if k.lower() != "authorization"}

    base_config = {
        "method": saved_request.get("method", "GET"),
        "url": saved_request.get("url", ""),
        "headers": dict(saved_headers),
        "query_params": saved_request.get("query_params") or {},
        "body": saved_request.get("body"),
        "body_type": saved_request.get("body_type", "none"),
    }

    # Resolve {{variables}} in base config
    resolved_config = resolve(base_config, context)

    # Apply step-level input overrides (only if template was actually resolved)
    step_inputs = step.get("inputs") or {}
    if step_inputs:
        override = resolve(step_inputs, context)

        if override.get("headers") and isinstance(override["headers"], dict):
            resolved_config["headers"] = {
                **resolved_config.get("headers", {}),
                **override["headers"],
            }

        if override.get("body") and isinstance(override["body"], dict):
            original_body = step_inputs.get("body") or {}
            resolved_fields = {}
            for key, value in override["body"].items():
                original_value = str(original_body.get(key, ""))
                resolved_value = str(value)
                had_template = "{{" in original_value and "}}" in original_value
                was_resolved = had_template and "{{" not in resolved_value
                if was_resolved:
                    resolved_fields[key] = value
            if resolved_fields:
                try:
                    existing = json.loads(resolved_config["body"]) if resolved_config.get("body") else {}
                    resolved_config["body"] = json.dumps({**existing, **resolved_fields})
                except Exception:
                    resolved_config["body"] = json.dumps(resolved_fields)

    # Email/username uniquification — birebir JS port
    # (scenario-agent.service.js satır 269-346)
    if resolved_config.get("body") and isinstance(resolved_config["body"], str):
        try:
            body_obj = json.loads(resolved_config["body"])
            modified = False
            actor_slug = f"_{actor.lower().replace(chr(32), '')}" if actor else ""

            def exists_in_context(val):
                return any(v == val for v in context.values())

            if "username" in body_obj:
                ctx_key = f"{actor}_username" if actor else "_username"
                if context.get(ctx_key) and run_id in str(body_obj["username"]):
                    pass  # already processed
                elif context.get(ctx_key):
                    body_obj["username"] = context[ctx_key]
                    modified = True
                elif run_id not in str(body_obj["username"]):
                    generated = body_obj["username"] + actor_slug + "_" + run_id
                    if exists_in_context(generated):
                        generated = body_obj["username"] + actor_slug + "_s" + str(idx) + "_" + run_id
                    body_obj["username"] = generated
                    context[ctx_key] = generated
                    modified = True

            if "email" in body_obj:
                ctx_key = f"{actor}_email" if actor else "_email"
                if context.get(ctx_key) and run_id in str(body_obj["email"]):
                    pass
                elif context.get(ctx_key):
                    body_obj["email"] = context[ctx_key]
                    modified = True
                elif run_id not in str(body_obj["email"]):
                    parts = body_obj["email"].split("@")
                    domain = parts[1] if len(parts) > 1 else "test.com"
                    generated = parts[0] + actor_slug + "_" + run_id + "@" + domain
                    if exists_in_context(generated):
                        generated = parts[0] + actor_slug + "_s" + str(idx) + "_" + run_id + "@" + domain
                    body_obj["email"] = generated
                    context[ctx_key] = generated
                    modified = True

            if "password" in body_obj:
                ctx_key = f"{actor}_password" if actor else "_password"
                if not context.get(ctx_key):
                    context[ctx_key] = body_obj["password"]
                else:
                    body_obj["password"] = context[ctx_key]
                    modified = True

            if modified:
                resolved_config["body"] = json.dumps(body_obj)
        except Exception:
            pass

    # Token injection (actor-specific preferred, falls back to generic)
    if resolved_config.get("headers") is not None:
        actor_token = context.get(f"{actor}_token") if actor else None
        token_to_use = actor_token or context.get("token")
        if token_to_use:
            resolved_config["headers"]["Authorization"] = f"Bearer {token_to_use}"

    total = len(state["plan_steps"])
    _log_step_start(
        idx, total,
        step.get("description", ""),
        actor,
        resolved_config.get("method", "GET"),
        resolved_config.get("url", ""),
    )

    return {
        "messages": [AIMessage(content=f"Preparing step {idx + 1}: {step.get('description', '')}")],
        "context": context,
        "_prepared_request_json": json.dumps(resolved_config),
    }


# ─── Node 2: executor_node ────────────────────────────────────────────────────

async def executor_node(state: ScenarioState) -> Dict[str, Any]:
    idx = state["current_step_index"]
    # Read prepared request from context
    prepared_json = state.get("_prepared_request_json") or "{}"
    req = json.loads(prepared_json)

    result = await http_execute(req)

    if result.get("error_message"):
        _log(f"   ⚠️  Connection error: {result['error_message']}")

    return {
        "last_step_result": result,
        "messages": [AIMessage(
            content=f"Step {idx + 1} executed: HTTP {result.get('status_code')}"
        )],
    }


# ─── Node 3: evaluator_node ───────────────────────────────────────────────────

def evaluator_node(state: ScenarioState) -> Dict[str, Any]:
    idx = state["current_step_index"]
    step = state["plan_steps"][idx]
    result = state["last_step_result"] or {}
    context = dict(state["context"])  # kopya al

    assertions = step.get("assertions") or []
    assertion_results = _evaluate_assertions(assertions, result, context)
    det_passed = all(a["passed"] for a in assertion_results)

    # Capture body fields used (for result_snapshot parity with JS service)
    used_credentials: Dict[str, str] = {}
    body = result.get("response_body") or {}
    if isinstance(body, dict):
        for k in ["email", "username", "name", "password", "phone"]:
            if k in body:
                used_credentials[k] = str(body[k])

    # Extract variables from response and merge into context
    new_vars = _extract_variables(result, step, context)
    merged_context = {**context, **new_vars}

    step_result_entry = {
        "step_index": idx,
        "step_order": step.get("order", idx + 1),
        "description": step.get("description", ""),
        "actor": step.get("actor", ""),
        "passed": det_passed,
        "status_code": result.get("status_code"),
        "response_time_ms": result.get("response_time_ms"),
        "assertions": assertion_results,
        "extracted_variables": new_vars,
        "used_credentials": used_credentials or None,
        "evaluator_feedback": None,
        "heal_attempts": state.get("heal_attempts", 0),
        "error_message": result.get("error_message"),
    }

    if det_passed:
        _log_step_result(
            result.get("status_code", 0),
            result.get("response_time_ms", 0),
            True,
            assertion_results,
        )
        existing = list(state.get("step_results") or [])
        existing.append(step_result_entry)
        return {
            "last_step_passed": True,
            "should_heal": False,
            "evaluator_feedback": None,
            "context": merged_context,
            "step_results": existing,
            "messages": [AIMessage(content=f"Step {idx + 1} PASSED")],
        }

    # Deterministic check failed — ask LLM if self-heal is possible
    _log_step_result(
        result.get("status_code", 0),
        result.get("response_time_ms", 0),
        False,
        assertion_results,
    )

    heal_attempts = state.get("heal_attempts", 0)
    if heal_attempts >= 2:
        _log_evaluator("Max heal attempts reached — marking as failed.")
        step_result_entry["passed"] = False
        existing = list(state.get("step_results") or [])
        existing.append(step_result_entry)
        return {
            "last_step_passed": False,
            "should_heal": False,
            "evaluator_feedback": "Max heal attempts reached",
            "context": merged_context,
            "step_results": existing,
            "messages": [AIMessage(content=f"Step {idx + 1} FAILED (max heals reached)")],
        }

    try:
        system_msg = (
            "You are an API test evaluator. Analyze the failed step and determine "
            "if the failure is recoverable by modifying the request."
        )
        user_msg = (
            f"Step description: {step.get('description', '')}\n"
            f"Expected assertions: {json.dumps(assertions)}\n"
            f"Actual status code: {result.get('status_code')}\n"
            f"Actual body (preview): {json.dumps(result.get('response_body'))[:500]}\n"
            f"Error message: {result.get('error_message') or 'none'}\n"
            "Can this failure be fixed by modifying the request "
            "(e.g. missing header, wrong body field, stale token)?"
        )
        eval_result: StepEvaluation = get_evaluator_llm().invoke([
            SystemMessage(content=system_msg),
            HumanMessage(content=user_msg),
        ])
        step_result_entry["evaluator_feedback"] = eval_result.feedback
        _log_evaluator(eval_result.feedback)
        existing = list(state.get("step_results") or [])
        if eval_result.passed:
            existing.append({**step_result_entry, "passed": True})
        # Don't append yet if should_heal — healer may fix it

        if eval_result.should_heal:
            return {
                "last_step_passed": False,
                "should_heal": True,
                "evaluator_feedback": eval_result.feedback,
                "context": merged_context,
                "step_results": existing if not eval_result.should_heal else list(state.get("step_results") or []),
                "messages": [AIMessage(content=f"Evaluator: {eval_result.feedback} — healing")],
            }
        else:
            existing.append(step_result_entry)
            return {
                "last_step_passed": False,
                "should_heal": False,
                "evaluator_feedback": eval_result.feedback,
                "context": merged_context,
                "step_results": existing,
                "messages": [AIMessage(content=f"Step {idx + 1} FAILED: {eval_result.feedback}")],
            }
    except Exception as exc:
        step_result_entry["evaluator_feedback"] = str(exc)
        existing = list(state.get("step_results") or [])
        existing.append(step_result_entry)
        return {
            "last_step_passed": False,
            "should_heal": False,
            "evaluator_feedback": f"Evaluator error: {exc}",
            "context": merged_context,
            "step_results": existing,
            "messages": [AIMessage(content=f"Step {idx + 1} FAILED (evaluator error)")],
        }


# ─── Node 4: healer_node ──────────────────────────────────────────────────────

def healer_node(state: ScenarioState) -> Dict[str, Any]:
    idx = state["current_step_index"]
    step = state["plan_steps"][idx]
    feedback = state.get("evaluator_feedback", "")
    result = state["last_step_result"] or {}

    try:
        prompt = (
            f"This API test step failed.\n"
            f"Feedback: {feedback}\n"
            f"Original step: {json.dumps(step)}\n"
            f"Response: status={result.get('status_code')}, "
            f"body={json.dumps(result.get('response_body'))[:400]}\n"
            "Propose MINIMAL changes to fix this step. Only change what is necessary."
        )
        proposal: HealProposal = get_healer_llm().invoke([
            SystemMessage(content="You are an API test self-healing agent. Propose minimal request changes."),
            HumanMessage(content=prompt),
        ])
    except Exception as exc:
        return {
            "heal_attempts": state.get("heal_attempts", 0) + 1,
            "messages": [AIMessage(content=f"Healer error: {exc}")],
        }

    _log_healer(proposal.explanation, state.get("heal_attempts", 0) + 1)

    # Mutate only this step's inputs — never touch other steps
    plan_steps = list(state["plan_steps"])
    new_step = dict(plan_steps[idx])
    new_inputs = dict(new_step.get("inputs") or {})

    if proposal.new_headers:
        existing_headers = dict(new_inputs.get("headers") or {})
        existing_headers.update(proposal.new_headers)
        new_inputs["headers"] = existing_headers

    if proposal.new_body_fields:
        existing_body = dict(new_inputs.get("body") or {})
        existing_body.update(proposal.new_body_fields)
        new_inputs["body"] = existing_body

    new_step["inputs"] = new_inputs
    plan_steps[idx] = new_step

    return {
        "plan_steps": plan_steps,
        "heal_attempts": state.get("heal_attempts", 0) + 1,
        "messages": [AIMessage(content=f"Healer: {proposal.explanation}")],
    }


# ─── Node 5: finalizer_node ───────────────────────────────────────────────────

def finalizer_node(state: ScenarioState) -> Dict[str, Any]:
    step_results = state.get("step_results") or []
    has_failures = any(not r.get("passed") for r in step_results)
    final_status = "failed" if has_failures else "passed"

    passed_count = sum(1 for r in step_results if r.get("passed"))
    _log_scenario_end(final_status, passed_count, len(step_results))

    return {
        "final_status": final_status,
        "success_criteria_met": not has_failures,
        "messages": [AIMessage(
            content=f"Scenario complete. Status: {final_status}. "
                    f"Steps: {len(step_results)}, "
                    f"Passed: {passed_count}"
        )],
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _evaluate_assertions(
    assertions: List[Dict[str, Any]],
    result: Dict[str, Any],
    context: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """scenario-agent.service.js evaluateAssertions'ın birebir Python portu."""
    if not assertions:
        return []

    def resolve_expected(expected):
        if not isinstance(expected, str):
            return expected
        import re
        return re.sub(
            r"\{\{(\w+)\}\}",
            lambda m: str(context[m.group(1)]) if m.group(1) in context else m.group(0),
            expected,
        )

    body_str = json.dumps(result.get("response_body"))
    body_preview = body_str[:200]

    out = []
    for assertion in assertions:
        try:
            expected = resolve_expected(assertion.get("expected"))
            a_type = assertion.get("type", "")

            if a_type == "status_code":
                out.append({**assertion, "passed": result.get("status_code") == int(expected), "actual": result.get("status_code")})
            elif a_type == "status_success":
                out.append({**assertion, "passed": 200 <= (result.get("status_code") or 0) < 300, "actual": result.get("status_code")})
            elif a_type == "status_failure":
                out.append({**assertion, "passed": (result.get("status_code") or 0) >= 400, "actual": result.get("status_code")})
            elif a_type == "body_contains":
                out.append({**assertion, "expected": expected, "passed": str(expected) in body_str, "actual": body_preview})
            elif a_type == "body_not_contains":
                out.append({**assertion, "expected": expected, "passed": str(expected) not in body_str, "actual": body_preview})
            elif a_type == "body_empty":
                rb = result.get("response_body")
                is_empty = rb in [[], {}, None, "", "[]", "{}"] or (isinstance(rb, (list, dict)) and len(rb) == 0)
                out.append({**assertion, "passed": bool(is_empty), "actual": body_preview})
            elif a_type == "body_not_empty":
                rb = result.get("response_body")
                not_empty = (isinstance(rb, list) and len(rb) > 0) or \
                            (isinstance(rb, dict) and len(rb) > 0) or \
                            (isinstance(rb, str) and len(rb) > 0)
                out.append({**assertion, "passed": bool(not_empty), "actual": body_preview})
            elif a_type == "body_field_equals":
                actual = _get_nested(result.get("response_body"), assertion.get("field"))
                out.append({**assertion, "expected": expected, "passed": str(actual) == str(expected), "actual": actual})
            elif a_type == "body_field_exists":
                val = _get_nested(result.get("response_body"), assertion.get("field"))
                out.append({**assertion, "passed": val is not None, "actual": val})
            elif a_type == "body_field_not_exists":
                val = _get_nested(result.get("response_body"), assertion.get("field"))
                out.append({**assertion, "passed": val is None, "actual": val})
            elif a_type == "response_time_below":
                out.append({**assertion, "passed": (result.get("response_time_ms") or 0) < int(expected), "actual": result.get("response_time_ms")})
            else:
                out.append({**assertion, "passed": False, "error": "Unknown assertion type"})
        except Exception as exc:
            out.append({**assertion, "passed": False, "error": str(exc)})
    return out


def _extract_variables(
    result: Dict[str, Any],
    step: Dict[str, Any],
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """scenario-agent.service.js extractVariablesFromResponse'ın Python portu."""
    vars_out: Dict[str, str] = {}
    body = result.get("response_body")
    if not body or not isinstance(body, dict):
        return vars_out

    actor = step.get("actor") or ""
    auto_keys = ["token", "access_token", "accessToken", "id", "userId", "user_id", "sessionId"]

    candidates = [body, body.get("data"), body.get("result"), body.get("user"),
                  body.get("account"), body.get("payload")]
    # top-level object values da dahil et
    for val in body.values():
        if isinstance(val, dict):
            candidates.append(val)

    candidates = [c for c in candidates if c and isinstance(c, dict)]

    for key in auto_keys:
        for src in candidates:
            if key in src and key not in vars_out:
                str_val = str(src[key])
                if actor:
                    actor_key = f"{actor}_{key}"
                    if actor_key in context and context[actor_key] != str_val:
                        vars_out[f"{actor}_created_{key}"] = str_val
                        vars_out[f"created_{key}"] = str_val
                    else:
                        vars_out[actor_key] = str_val
                vars_out[key] = str_val

    return vars_out


def _get_nested(obj: Any, path: Optional[str]) -> Any:
    if not obj or not path:
        return None
    for key in path.split("."):
        if isinstance(obj, dict):
            obj = obj.get(key)
        else:
            return None
    return obj
