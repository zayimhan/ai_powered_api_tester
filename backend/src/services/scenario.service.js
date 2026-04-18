// ── Scenario & Step CRUD Service ──

function safeJsonParse(str) {
    if (!str || typeof str !== 'string') return str;
    try { return JSON.parse(str); } catch { return str; }
}

// ─── Scenarios ───

function getAllScenarios(db, userId) {
    const stmt = db.prepare(
        'SELECT * FROM scenarios WHERE user_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(Number(userId)).map(s => {
        s.generated_plan = safeJsonParse(s.generated_plan);
        return s;
    });
}

function getScenarioById(db, id, userId) {
    const stmt = db.prepare(
        'SELECT * FROM scenarios WHERE id = ? AND user_id = ?'
    );
    const scenario = stmt.get(Number(id), Number(userId));
    if (scenario) {
        scenario.generated_plan = safeJsonParse(scenario.generated_plan);
    }
    return scenario;
}

function createScenario(db, data, userId) {
    const { collection_id, name, natural_language_command } = data;
    const stmt = db.prepare(`
        INSERT INTO scenarios (collection_id, name, natural_language_command, status, user_id)
        VALUES (?, ?, ?, 'pending', ?)
    `);
    const info = stmt.run(
        collection_id ? Number(collection_id) : null,
        name || 'Untitled Scenario',
        natural_language_command || '',
        Number(userId)
    );
    return getScenarioById(db, Number(info.lastInsertRowid), userId);
}

function updateScenario(db, id, data, userId) {
    const { name, natural_language_command, generated_plan, status, langgraph_thread_id, engine } = data;
    const stmt = db.prepare(`
        UPDATE scenarios
        SET name = COALESCE(?, name),
            natural_language_command = COALESCE(?, natural_language_command),
            generated_plan = COALESCE(?, generated_plan),
            status = COALESCE(?, status),
            langgraph_thread_id = COALESCE(?, langgraph_thread_id),
            engine = COALESCE(?, engine),
            updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
    `);
    stmt.run(
        name || null,
        natural_language_command || null,
        data.generated_plan !== undefined ? JSON.stringify(generated_plan) : null,
        status || null,
        langgraph_thread_id || null,
        engine || null,
        Number(id),
        Number(userId)
    );
    return getScenarioById(db, id, userId);
}

function removeScenario(db, id, userId) {
    const stmt = db.prepare('DELETE FROM scenarios WHERE id = ? AND user_id = ?');
    stmt.run(Number(id), Number(userId));
    return { success: true };
}

function getScenariosByCollection(db, collectionId, userId) {
    const stmt = db.prepare(
        'SELECT * FROM scenarios WHERE collection_id = ? AND user_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(Number(collectionId), Number(userId)).map(s => {
        s.generated_plan = safeJsonParse(s.generated_plan);
        return s;
    });
}

// ─── Steps ───

function getStepsByScenario(db, scenarioId, userId) {
    const scenario = getScenarioById(db, scenarioId, userId);
    if (!scenario) return null;

    const stmt = db.prepare(`
        SELECT ss.*,
               sr.name  AS request_name,
               sr.method AS request_method,
               sr.url   AS request_url
        FROM scenario_steps ss
        LEFT JOIN saved_requests sr ON ss.request_id = sr.id
        WHERE ss.scenario_id = ?
        ORDER BY ss.step_order ASC
    `);
    return stmt.all(Number(scenarioId)).map(step => {
        step.resolved_inputs = safeJsonParse(step.resolved_inputs);
        step.assertions = safeJsonParse(step.assertions);
        step.result_snapshot = safeJsonParse(step.result_snapshot);
        return step;
    });
}

function createStep(db, scenarioId, data) {
    const { step_order, request_id, actor_name, resolved_inputs, assertions, description } = data;
    const stmt = db.prepare(`
        INSERT INTO scenario_steps (scenario_id, step_order, request_id, actor_name, resolved_inputs, assertions, description, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    const info = stmt.run(
        Number(scenarioId),
        step_order ?? 0,
        request_id ? Number(request_id) : null,
        actor_name || null,
        JSON.stringify(resolved_inputs || {}),
        JSON.stringify(assertions || []),
        description || null
    );
    return { id: Number(info.lastInsertRowid), scenario_id: scenarioId, ...data };
}

function updateStep(db, stepId, data) {
    const { status, result_snapshot, resolved_inputs, assertions, heal_attempts, heal_log, evaluator_feedback } = data;
    const stmt = db.prepare(`
        UPDATE scenario_steps
        SET status = COALESCE(?, status),
            result_snapshot = COALESCE(?, result_snapshot),
            resolved_inputs = COALESCE(?, resolved_inputs),
            assertions = COALESCE(?, assertions),
            heal_attempts = COALESCE(?, heal_attempts),
            heal_log = COALESCE(?, heal_log),
            evaluator_feedback = COALESCE(?, evaluator_feedback),
            executed_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE executed_at END
        WHERE id = ?
    `);
    stmt.run(
        status || null,
        data.result_snapshot !== undefined ? JSON.stringify(result_snapshot) : null,
        data.resolved_inputs !== undefined ? JSON.stringify(resolved_inputs) : null,
        data.assertions !== undefined ? JSON.stringify(assertions) : null,
        data.heal_attempts !== undefined ? Number(heal_attempts) : null,
        heal_log || null,
        evaluator_feedback || null,
        status || null,
        Number(stepId)
    );
}

function clearSteps(db, scenarioId) {
    const stmt = db.prepare('DELETE FROM scenario_steps WHERE scenario_id = ?');
    stmt.run(Number(scenarioId));
}

module.exports = {
    getAllScenarios,
    getScenarioById,
    createScenario,
    updateScenario,
    removeScenario,
    getScenariosByCollection,
    getStepsByScenario,
    createStep,
    updateStep,
    clearSteps,
};
