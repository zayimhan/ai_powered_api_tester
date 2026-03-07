// LOCKED FEATURE — Scenario and ScenarioStep models

// scenarios table
const scenarioTable = `
  CREATE TABLE IF NOT EXISTS scenarios (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id             INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    name                      TEXT,
    natural_language_command  TEXT,
    generated_plan            TEXT,
    status                    TEXT DEFAULT 'pending',
    created_at                TEXT DEFAULT (datetime('now')),
    updated_at                TEXT DEFAULT (datetime('now'))
  );
`;

// scenario_steps table
const scenarioStepTable = `
  CREATE TABLE IF NOT EXISTS scenario_steps (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id      INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
    step_order       INTEGER,
    request_id       INTEGER REFERENCES saved_requests(id) ON DELETE SET NULL,
    actor_name       TEXT,
    resolved_inputs  TEXT,
    assertions       TEXT,
    status           TEXT DEFAULT 'pending',
    result_snapshot  TEXT,
    executed_at      TEXT
  );
`;

module.exports = { scenarioTable, scenarioStepTable };
