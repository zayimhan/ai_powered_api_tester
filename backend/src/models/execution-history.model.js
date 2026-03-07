// Schema for execution_history table
module.exports = `
  CREATE TABLE IF NOT EXISTS execution_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id        INTEGER REFERENCES saved_requests(id) ON DELETE SET NULL,
    collection_id     INTEGER REFERENCES collections(id)    ON DELETE SET NULL,
    status_code       INTEGER,
    response_time_ms  INTEGER,
    response_headers  TEXT,
    response_body     TEXT,
    success           INTEGER DEFAULT 0,
    error_message     TEXT,
    executed_at       TEXT DEFAULT (datetime('now'))
  );
`;
