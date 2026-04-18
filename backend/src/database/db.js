"use strict";
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const userSchema = require("../models/user.model");
const collectionSchema = require("../models/collection.model");
const requestSchema = require("../models/request.model");
const executionSchema = require("../models/execution-history.model");
const {
  scenarioTable,
  scenarioStepTable,
} = require("../models/scenario.model");

const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(__dirname, "../../data");
const DB_PATH = path.join(DB_DIR, "apiflow.db");

// Ensure the data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Create tables
db.exec(userSchema);
db.exec(collectionSchema);
db.exec(requestSchema);
db.exec(executionSchema);
db.exec(scenarioTable);
db.exec(scenarioStepTable);

// Migration: Add user_id column to existing tables if not present
try {
  db.exec(
    "ALTER TABLE collections ADD COLUMN user_id INTEGER REFERENCES users(id)",
  );
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE saved_requests ADD COLUMN user_id INTEGER REFERENCES users(id)",
  );
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE execution_history ADD COLUMN user_id INTEGER REFERENCES users(id)",
  );
} catch (e) {}

// Migration: Add request details to execution_history for history re-run
try {
  db.exec("ALTER TABLE execution_history ADD COLUMN method TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE execution_history ADD COLUMN url TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE execution_history ADD COLUMN request_headers TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE execution_history ADD COLUMN request_body TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE execution_history ADD COLUMN body_type TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE execution_history ADD COLUMN request_query_params TEXT");
} catch (e) {}

// Migration: Add user_id to scenarios table if not present
try {
  db.exec(
    "ALTER TABLE scenarios ADD COLUMN user_id INTEGER REFERENCES users(id)",
  );
} catch (e) {}

// Migration: Add description to scenario_steps
try {
  db.exec("ALTER TABLE scenario_steps ADD COLUMN description TEXT");
} catch (e) {}

// Migration: LangGraph columns
try { db.exec("ALTER TABLE scenarios ADD COLUMN langgraph_thread_id TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE scenarios ADD COLUMN engine TEXT DEFAULT 'deterministic'"); } catch (e) {}
try { db.exec("ALTER TABLE scenario_steps ADD COLUMN heal_attempts INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE scenario_steps ADD COLUMN heal_log TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE scenario_steps ADD COLUMN evaluator_feedback TEXT"); } catch (e) {}

module.exports = db;
