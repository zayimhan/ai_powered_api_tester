// ── Scenario Agent Service ──
// Handles CrewAI microservice communication and scenario execution orchestration.

const scenarioService = require("./scenario.service");
const requestService = require("./request.service");
const executionService = require("./execution.service");
const templateResolver = require("../utils/template-resolver");

const CREWAI_BASE_URL = process.env.CREWAI_URL || "http://localhost:8000";

// ─── CrewAI Microservice Communication ───

async function analyzeWithCrewAI(
  naturalLanguageCommand,
  savedRequests,
  collectionName,
) {
  const payload = {
    command: naturalLanguageCommand,
    saved_requests: savedRequests.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
      method: r.method,
      url: r.url,
      headers:
        typeof r.headers === "string" ? safeJsonParse(r.headers) : r.headers,
      body: r.body,
      body_type: r.body_type,
    })),
    collection_name: collectionName || "",
  };

  const response = await fetch(`${CREWAI_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`CrewAI analyze failed (${response.status}): ${errBody}`);
  }

  return response.json();
}

async function generateAssertionsWithCrewAI(plan, savedRequests) {
  const response = await fetch(`${CREWAI_BASE_URL}/generate-assertions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, saved_requests: savedRequests }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `CrewAI assertions failed (${response.status}): ${errBody}`,
    );
  }

  return response.json();
}

// ─── Orchestration ───

async function analyzeAndCreate(
  db,
  { collection_id, natural_language_command, collection, savedRequests },
  userId,
) {
  const crewResult = await analyzeWithCrewAI(
    natural_language_command,
    savedRequests,
    collection.name,
  );

  const scenario = scenarioService.createScenario(
    db,
    {
      collection_id,
      name:
        crewResult.scenario_name || `Scenario - ${new Date().toLocaleString()}`,
      natural_language_command,
    },
    userId,
  );

  scenarioService.updateScenario(
    db,
    scenario.id,
    {
      generated_plan: crewResult.plan,
      status: "planned",
    },
    userId,
  );

  if (crewResult.plan && Array.isArray(crewResult.plan.steps)) {
    for (const step of crewResult.plan.steps) {
      scenarioService.createStep(db, scenario.id, {
        step_order: step.order,
        request_id: step.request_id,
        actor_name: step.actor || null,
        description: step.description || null,
        resolved_inputs: step.inputs || {},
        assertions: step.assertions || [],
      });
    }
  }

  const fullScenario = scenarioService.getScenarioById(db, scenario.id, userId);
  const steps = scenarioService.getStepsByScenario(db, scenario.id, userId);
  return { scenario: fullScenario, steps };
}

async function replanScenario(db, scenario, collection, savedRequests, userId) {
  const crewResult = await analyzeWithCrewAI(
    scenario.natural_language_command,
    savedRequests,
    collection.name,
  );

  scenarioService.clearSteps(db, scenario.id);
  scenarioService.updateScenario(
    db,
    scenario.id,
    {
      generated_plan: crewResult.plan,
      status: "planned",
    },
    userId,
  );

  if (crewResult.plan && Array.isArray(crewResult.plan.steps)) {
    for (const step of crewResult.plan.steps) {
      scenarioService.createStep(db, scenario.id, {
        step_order: step.order,
        request_id: step.request_id,
        actor_name: step.actor || null,
        description: step.description || null,
        resolved_inputs: step.inputs || {},
        assertions: step.assertions || [],
      });
    }
  }

  const fullScenario = scenarioService.getScenarioById(db, scenario.id, userId);
  const steps = scenarioService.getStepsByScenario(db, scenario.id, userId);
  return { scenario: fullScenario, steps };
}

// ─── Scenario Execution ───

async function executeScenarioPlan(db, scenario, steps, userId) {
  const context = {};
  const results = [];

  const runId =
    Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  context._runId = runId;

  scenarioService.updateScenario(
    db,
    scenario.id,
    { status: "running" },
    userId,
  );

  for (const step of steps) {
    try {
      // 1. Get the saved request for this step
      if (!step.request_id) {
        // AI sometimes generates meta/summary steps with no endpoint — skip silently
        scenarioService.updateStep(db, step.id, { status: "skipped" });
        results.push({ step_id: step.id, step_order: step.step_order, status: "skipped" });
        continue;
      }

      const savedRequest = requestService.getById(db, step.request_id, userId);
      if (!savedRequest) {
        scenarioService.updateStep(db, step.id, {
          status: "failed",
          result_snapshot: {
            error: `Saved request #${step.request_id} not found`,
          },
        });
        results.push({
          step_id: step.id,
          status: "failed",
          error: "Request not found",
        });
        continue;
      }

      // 2. Build headers: strip hardcoded Authorization from saved request headers
      // so that the dynamic context token (step 5) takes over cleanly.
      let savedHeaders =
        typeof savedRequest.headers === "string"
          ? safeJsonParse(savedRequest.headers)
          : savedRequest.headers || {};

      if (context.token && savedHeaders && typeof savedHeaders === "object") {
        savedHeaders = Object.fromEntries(
          Object.entries(savedHeaders).filter(
            ([k]) => k.toLowerCase() !== "authorization",
          ),
        );
      }

      // Resolve variables ({{token}}, {{userId}}, etc.)
      const resolvedConfig = templateResolver.resolve(
        {
          method: savedRequest.method,
          url: savedRequest.url,
          headers: savedHeaders,
          query_params:
            typeof savedRequest.query_params === "string"
              ? safeJsonParse(savedRequest.query_params)
              : savedRequest.query_params,
          body: savedRequest.body,
          body_type: savedRequest.body_type,
        },
        context,
      );

      // 3. Apply step-specific input overrides (headers + body) BEFORE email uniquification
      // so that step 3's dynamic email/password generation always takes precedence.
      if (step.resolved_inputs && typeof step.resolved_inputs === "object") {
        const overrides = templateResolver.resolve(step.resolved_inputs, context);

        if (overrides.headers && typeof overrides.headers === "object") {
          resolvedConfig.headers = {
            ...(typeof resolvedConfig.headers === "object" ? resolvedConfig.headers : {}),
            ...overrides.headers,
          };
        }

        if (overrides.body && typeof overrides.body === "object" && Object.keys(overrides.body).length > 0) {
          // Only apply fields whose value was actually resolved from context (i.e. the template
          // variable was replaced). Fields that still contain a literal {{...}} string or that
          // look like AI-generated placeholders are skipped to protect the saved request body.
          const resolvedFields = {};
          const originalInputsBody = step.resolved_inputs.body || {};
          for (const [key, value] of Object.entries(overrides.body)) {
            const originalValue = String(originalInputsBody[key] ?? "");
            const resolvedValue = String(value);
            // Accept the override only if the original had a template var that got replaced
            const isResolved = !resolvedValue.includes("{{");
            if (isResolved) {
              resolvedFields[key] = value;
            }
          }
          if (Object.keys(resolvedFields).length > 0) {
            // Merge resolved fields into the existing body (preserve all other fields)
            try {
              const existingBody = resolvedConfig.body ? JSON.parse(resolvedConfig.body) : {};
              resolvedConfig.body = JSON.stringify({ ...existingBody, ...resolvedFields });
            } catch {
              resolvedConfig.body = JSON.stringify(resolvedFields);
            }
          }
        }
      }

      // 4. Make usernames/emails unique per run and store in context for later steps
      if (resolvedConfig.body && typeof resolvedConfig.body === "string") {
        try {
          const bodyObj = JSON.parse(resolvedConfig.body);
          let modified = false;
          const actor = step.actor_name || "";

          // actorSlug ensures different actors get different values even with same template
          const actorSlug = actor
            ? `_${actor.toLowerCase().replace(/\W+/g, "")}`
            : "";

          // Returns true if this exact value already exists for any context key
          const existsInContext = (val) =>
            Object.values(context).some((v) => v === val);

          if (bodyObj.username) {
            const ctxKey = actor ? `${actor}_username` : "_username";
            if (context[ctxKey] && bodyObj.username.includes(runId)) {
              // Already processed (idempotent), keep as-is
            } else if (context[ctxKey]) {
              // Same actor seen before → reuse (e.g. login after register)
              bodyObj.username = context[ctxKey];
              modified = true;
            } else if (!bodyObj.username.includes(runId)) {
              let generated =
                bodyObj.username + actorSlug + "_" + runId;
              // Safety net: if this value already exists (same actor name collision),
              // add step order to guarantee uniqueness
              if (existsInContext(generated)) {
                generated =
                  bodyObj.username + actorSlug + "_s" + step.step_order + "_" + runId;
              }
              bodyObj.username = generated;
              context[ctxKey] = generated;
              modified = true;
            }
          }

          if (bodyObj.email) {
            const ctxKey = actor ? `${actor}_email` : "_email";
            if (context[ctxKey] && bodyObj.email.includes(runId)) {
              // Already processed (idempotent), keep as-is
            } else if (context[ctxKey]) {
              // Same actor seen before → reuse (e.g. login after register)
              bodyObj.email = context[ctxKey];
              modified = true;
            } else if (!bodyObj.email.includes(runId)) {
              const parts = bodyObj.email.split("@");
              let generated =
                parts[0] + actorSlug + "_" + runId + "@" + (parts[1] || "test.com");
              // Safety net: if this email already exists in context (actor name collision),
              // add step order to guarantee uniqueness
              if (existsInContext(generated)) {
                generated =
                  parts[0] + actorSlug + "_s" + step.step_order + "_" + runId + "@" + (parts[1] || "test.com");
              }
              bodyObj.email = generated;
              context[ctxKey] = generated;
              modified = true;
            }
          }

          if (bodyObj.password) {
            const ctxKey = actor ? `${actor}_password` : "_password";
            if (!context[ctxKey]) {
              context[ctxKey] = bodyObj.password;
            } else {
              bodyObj.password = context[ctxKey];
              modified = true;
            }
          }

          if (modified) {
            resolvedConfig.body = JSON.stringify(bodyObj);
          }
        } catch (e) {
          /* not JSON, skip */
        }
      }

      // 3b. Capture body fields used in this step (email, username, password, etc.)
      // so the frontend can display them as "kayıt bilgileri".
      const usedBodyFields = {};
      if (resolvedConfig.body && typeof resolvedConfig.body === "string") {
        try {
          const bodyObj = JSON.parse(resolvedConfig.body);
          const captureKeys = ["email", "username", "name", "password", "phone"];
          for (const key of captureKeys) {
            if (bodyObj[key] !== undefined) {
              usedBodyFields[key] = String(bodyObj[key]);
            }
          }
        } catch (e) {
          /* not JSON, skip */
        }
      }

      // 5. Auto-inject Authorization header.
      // For multi-actor scenarios prefer the actor-specific token (e.g. UserA_token
      // for actor "UserA") so each actor uses their own credentials. Fall back to
      // the generic context.token only when no actor-specific token is available.
      if (resolvedConfig.headers) {
        const actorToken = step.actor_name
          ? context[`${step.actor_name}_token`]
          : null;
        const tokenToUse = actorToken || context.token;
        if (tokenToUse) {
          resolvedConfig.headers["Authorization"] = `Bearer ${tokenToUse}`;
        }
      }

      // 6. Execute the HTTP request
      const result = await executionService.execute(resolvedConfig);

      // 7. Save to execution history
      const historyConfig = {
        method: resolvedConfig.method,
        url: resolvedConfig.url,
        headers:
          typeof resolvedConfig.headers === "object"
            ? resolvedConfig.headers
            : {},
        body:
          typeof resolvedConfig.body === "object"
            ? JSON.stringify(resolvedConfig.body)
            : resolvedConfig.body || null,
        body_type: resolvedConfig.body_type || "none",
        query_params:
          typeof resolvedConfig.query_params === "object"
            ? resolvedConfig.query_params
            : {},
      };
      executionService.saveHistory(db, result, userId, historyConfig);

      // 8. Extract variables from response for next steps
      const extractedVars = extractVariablesFromResponse(result, step, context);
      Object.assign(context, extractedVars);

      // 9. Evaluate assertions
      const assertionResults = evaluateAssertions(step.assertions, result, context);
      const allPassed = assertionResults.every((a) => a.passed);

      const usedCredentials =
        Object.keys(usedBodyFields).length > 0 ? usedBodyFields : undefined;

      // 10. Update step with results
      scenarioService.updateStep(db, step.id, {
        status: allPassed ? "passed" : "failed",
        result_snapshot: {
          status_code: result.status_code,
          response_time_ms: result.response_time_ms,
          response_body: result.response_body,
          response_headers: result.response_headers || {},
          success: result.success,
          assertions: assertionResults,
          extracted_variables: extractedVars,
          used_credentials: usedCredentials,
          request_method: resolvedConfig.method || null,
          request_url: resolvedConfig.url || null,
          request_headers: resolvedConfig.headers || {},
          request_body: resolvedConfig.body || null,
        },
      });

      results.push({
        step_id: step.id,
        step_order: step.step_order,
        status: allPassed ? "passed" : "failed",
        status_code: result.status_code,
        response_time_ms: result.response_time_ms,
        assertions: assertionResults,
        extracted_variables: extractedVars,
        used_credentials: usedCredentials,
        request_name: savedRequest.name || null,
        request_method: resolvedConfig.method || null,
        request_url: resolvedConfig.url || null,
        actor: step.actor_name || null,
        request_headers: resolvedConfig.headers || null,
        request_body: resolvedConfig.body || null,
        response_headers: result.response_headers || null,
        response_body: result.response_body ?? null,
      });
    } catch (err) {
      scenarioService.updateStep(db, step.id, {
        status: "error",
        result_snapshot: { error: err.message },
      });
      results.push({ step_id: step.id, status: "error", error: err.message });
    }
  }

  const hasFailures = results.some(
    (r) => r.status === "failed" || r.status === "error",
  );
  scenarioService.updateScenario(
    db,
    scenario.id,
    {
      status: hasFailures ? "failed" : "passed",
    },
    userId,
  );

  return {
    scenario_id: scenario.id,
    status: hasFailures ? "failed" : "passed",
    steps: results,
  };
}

// ─── Helpers ───

function extractVariablesFromResponse(result, step, context = {}) {
  const vars = {};
  if (!result.response_body || typeof result.response_body !== "object")
    return vars;

  const body = result.response_body;
  const actor = step.actor_name || "";
  const autoKeys = [
    "token",
    "access_token",
    "accessToken",
    "id",
    "userId",
    "user_id",
    "sessionId",
  ];

  // Search top-level and common nested wrappers (data, result, user, account, payload)
  const candidates = [
    body,
    body.data,
    body.result,
    body.user,
    body.account,
    body.payload,
  ];

  // Also include any top-level object values (e.g. body.profile, body.session)
  for (const val of Object.values(body)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      candidates.push(val);
    }
  }

  for (const key of autoKeys) {
    for (const src of candidates) {
      if (src && src[key] !== undefined && !vars[key]) {
        if (actor) {
          const actorKey = `${actor}_${key}`;
          // If this actor already has this key in context (e.g. UserA_id = userID from register),
          // save the new value as {actor}_created_{key} to avoid overwriting the user ID.
          // This lets steps like "accept friend request" reference {{UserA_created_id}}.
          if (context[actorKey] !== undefined && context[actorKey] !== String(src[key])) {
            vars[`${actor}_created_${key}`] = String(src[key]);
            vars[`created_${key}`] = String(src[key]);
          } else {
            vars[actorKey] = String(src[key]);
          }
        }
        vars[key] = String(src[key]);
      }
    }
  }

  return vars;
}

function evaluateAssertions(assertions, result, context = {}) {
  if (!assertions || !Array.isArray(assertions)) return [];

  // Resolve template variables (e.g. {{UserA_id}}) in assertion expected values
  function resolveExpected(expected) {
    if (typeof expected !== "string") return expected;
    return expected.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      context[key] !== undefined ? String(context[key]) : `{{${key}}}`
    );
  }

  return assertions.map((assertion) => {
    try {
      const expected = resolveExpected(assertion.expected);
      const bodyStr = JSON.stringify(result.response_body);
      const bodyPreview = bodyStr.substring(0, 200);

      switch (assertion.type) {
        case "status_code":
          return { ...assertion, passed: result.status_code === Number(expected), actual: result.status_code };
        case "status_success":
          return { ...assertion, passed: result.status_code >= 200 && result.status_code < 300, actual: result.status_code };
        case "status_failure":
          return { ...assertion, passed: result.status_code >= 400, actual: result.status_code };
        case "body_contains":
          return { ...assertion, expected, passed: bodyStr.includes(String(expected)), actual: bodyPreview };
        case "body_not_contains":
          return { ...assertion, expected, passed: !bodyStr.includes(String(expected)), actual: bodyPreview };
        case "body_empty": {
          const isEmpty =
            bodyStr === "[]" ||
            bodyStr === "{}" ||
            bodyStr === "null" ||
            bodyStr === '""' ||
            bodyStr === "" ||
            (Array.isArray(result.response_body) && result.response_body.length === 0) ||
            (result.response_body && typeof result.response_body === "object" && !Array.isArray(result.response_body) && Object.keys(result.response_body).length === 0);
          return { ...assertion, passed: !!isEmpty, actual: bodyPreview };
        }
        case "body_not_empty": {
          const body = result.response_body;
          const notEmpty =
            (Array.isArray(body) && body.length > 0) ||
            (body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length > 0) ||
            (typeof body === "string" && body.length > 0);
          return { ...assertion, passed: !!notEmpty, actual: bodyPreview };
        }
        case "body_field_equals": {
          const actual = getNestedValue(result.response_body, assertion.field);
          return { ...assertion, expected, passed: String(actual) === String(expected), actual };
        }
        case "body_field_exists": {
          const val = getNestedValue(result.response_body, assertion.field);
          return { ...assertion, passed: val !== undefined && val !== null, actual: val };
        }
        case "body_field_not_exists": {
          const val = getNestedValue(result.response_body, assertion.field);
          return { ...assertion, passed: val === undefined || val === null, actual: val };
        }
        case "response_time_below":
          return { ...assertion, passed: result.response_time_ms < Number(expected), actual: result.response_time_ms };
        default:
          return { ...assertion, passed: false, error: "Unknown assertion type" };
      }
    } catch (e) {
      return { ...assertion, passed: false, error: e.message };
    }
  });
}

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

function safeJsonParse(str) {
  if (!str || typeof str !== "string") return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = {
  analyzeWithCrewAI,
  generateAssertionsWithCrewAI,
  analyzeAndCreate,
  replanScenario,
  executeScenarioPlan,
  extractVariablesFromResponse,
  evaluateAssertions,
};
