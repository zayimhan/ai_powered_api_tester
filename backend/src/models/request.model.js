// Schema definition for the saved_requests table
module.exports = `
  CREATE TABLE IF NOT EXISTS saved_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    method        TEXT NOT NULL,
    url           TEXT NOT NULL,
    query_params  TEXT DEFAULT '{}',
    headers       TEXT DEFAULT '{}',
    body          TEXT,
    body_type     TEXT DEFAULT 'none',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
`;
