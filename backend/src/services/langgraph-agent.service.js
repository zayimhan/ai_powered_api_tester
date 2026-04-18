"use strict";
const scenarioService = require("./scenario.service");
const requestService = require("./request.service");

const LANGGRAPH_BASE_URL = process.env.LANGGRAPH_URL || "http://localhost:8001";

async function runWithLangGraph(db, scenario, steps, userId) {
  // Build plan steps — inline saved_request so LangGraph doesn't call back
  const planSteps = steps.map((s) => {
    const savedRequest = s.request_id
      ? requestService.getById(db, s.request_id, userId)
      : null;

    console.log(`[LangGraph] step ${s.step_order}: request_id=${s.request_id}, found=${!!savedRequest}, url=${savedRequest?.url || 'NULL'}`);

    return {
      order: s.step_order,
      request_id: s.request_id,
      actor: s.actor_name || null,
      description: s.description || null,
      inputs: s.resolved_inputs || {},
      assertions: s.assertions || [],
      saved_request: savedRequest
        ? {
            id: savedRequest.id,
            name: savedRequest.name,
            method: savedRequest.method,
            url: savedRequest.url,
            headers:
              typeof savedRequest.headers === "string"
                ? JSON.parse(savedRequest.headers || "{}")
                : savedRequest.headers || {},
            body: savedRequest.body || null,
            body_type: savedRequest.body_type || "none",
            query_params:
              typeof savedRequest.query_params === "string"
                ? JSON.parse(savedRequest.query_params || "{}")
                : savedRequest.query_params || {},
          }
        : null,
    };
  });

  scenarioService.updateScenario(db, scenario.id, { status: "running", engine: "langgraph" }, userId);

  const resp = await fetch(`${LANGGRAPH_BASE_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario_id: scenario.id,
      plan_steps: planSteps,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LangGraph run failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();

  // Persist thread_id on scenario for resume capability
  if (data.thread_id) {
    try {
      scenarioService.updateScenario(
        db,
        scenario.id,
        { langgraph_thread_id: data.thread_id },
        userId,
      );
    } catch (_) {}
  }

  // Write step results back to DB
  for (let i = 0; i < steps.length; i++) {
    const stepResult = (data.step_results || [])[i];
    if (!stepResult) continue;
    scenarioService.updateStep(db, steps[i].id, {
      status: stepResult.passed ? "passed" : "failed",
      heal_attempts: stepResult.heal_attempts || 0,
      heal_log: stepResult.evaluator_feedback || null,
      evaluator_feedback: stepResult.evaluator_feedback || null,
      result_snapshot: {
        status_code: stepResult.status_code,
        response_time_ms: stepResult.response_time_ms,
        assertions: stepResult.assertions,
        extracted_variables: stepResult.extracted_variables,
        used_credentials: stepResult.used_credentials,
        evaluator_feedback: stepResult.evaluator_feedback,
        heal_attempts: stepResult.heal_attempts,
      },
    });
  }

  scenarioService.updateScenario(
    db,
    scenario.id,
    { status: data.final_status },
    userId,
  );

  return data;
}

module.exports = { runWithLangGraph };
