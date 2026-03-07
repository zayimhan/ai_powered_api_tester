const executionService = require('../services/execution.service');
const db = require('../database/db');

// POST /api/executions/run
async function run(req, res) {
    try {
        const userId = req.user.id;
        const result = await executionService.execute(req.body);
        const history = executionService.saveHistory(db, result, userId, req.body);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/executions/history
function getHistory(req, res) {
    try {
        const userId = req.user.id;
        const history = executionService.getHistory(db, userId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/executions/history/:id
function getHistoryById(req, res) {
    try {
        const userId = req.user.id;
        const item = executionService.getHistoryById(db, req.params.id, userId);
        if (item) {
            res.json(item);
        } else {
            res.status(404).json({ error: 'History item not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// DELETE /api/executions/history/:id
function removeHistory(req, res) {
    try {
        const userId = req.user.id;
        const result = executionService.removeHistory(db, req.params.id, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = { run, getHistory, getHistoryById, removeHistory };
