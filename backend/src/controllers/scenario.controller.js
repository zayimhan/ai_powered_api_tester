const db = require('../database/db');
const scenarioService = require('../services/scenario.service');
const scenarioAgentService = require('../services/scenario-agent.service');
const requestService = require('../services/request.service');
const collectionService = require('../services/collection.service');

// ─── Scenario CRUD ───

function getAll(req, res) {
    try {
        const scenarios = scenarioService.getAllScenarios(db, req.user.id);
        res.json(scenarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

function create(req, res) {
    try {
        const scenario = scenarioService.createScenario(db, req.body, req.user.id);
        res.status(201).json(scenario);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

function getById(req, res) {
    try {
        const scenario = scenarioService.getScenarioById(db, req.params.id, req.user.id);
        if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
        res.json(scenario);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

function update(req, res) {
    try {
        const scenario = scenarioService.updateScenario(db, req.params.id, req.body, req.user.id);
        if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
        res.json(scenario);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

function remove(req, res) {
    try {
        scenarioService.removeScenario(db, req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

function getByCollection(req, res) {
    try {
        const scenarios = scenarioService.getScenariosByCollection(db, req.params.collectionId, req.user.id);
        res.json(scenarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// ─── Steps ───

function getSteps(req, res) {
    try {
        const steps = scenarioService.getStepsByScenario(db, req.params.id, req.user.id);
        if (steps === null) return res.status(404).json({ error: 'Scenario not found' });
        res.json(steps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// ─── AI Agent Endpoints ───

async function analyze(req, res) {
    try {
        const { collection_id, natural_language_command } = req.body;

        if (!collection_id || !natural_language_command) {
            return res.status(400).json({ error: 'collection_id and natural_language_command are required' });
        }

        const collection = collectionService.getById(db, collection_id, req.user.id);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });

        const savedRequests = requestService.getByCollection(db, collection_id, req.user.id);
        if (!savedRequests.length) {
            return res.status(400).json({ error: 'Collection has no saved requests' });
        }

        const result = await scenarioAgentService.analyzeAndCreate(db, {
            collection_id,
            natural_language_command,
            collection,
            savedRequests
        }, req.user.id);

        res.status(201).json(result);

    } catch (error) {
        console.error('Scenario analyze error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function run(req, res) {
    try {
        const scenario = scenarioService.getScenarioById(db, req.params.id, req.user.id);
        if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

        const steps = scenarioService.getStepsByScenario(db, req.params.id, req.user.id);
        if (!steps || steps.length === 0) {
            return res.status(400).json({ error: 'Scenario has no steps to execute' });
        }

        const result = await scenarioAgentService.executeScenarioPlan(db, scenario, steps, req.user.id);
        res.json(result);

    } catch (error) {
        console.error('Scenario run error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function replan(req, res) {
    try {
        const scenario = scenarioService.getScenarioById(db, req.params.id, req.user.id);
        if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

        const collection = collectionService.getById(db, scenario.collection_id, req.user.id);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });

        const savedRequests = requestService.getByCollection(db, scenario.collection_id, req.user.id);

        const result = await scenarioAgentService.replanScenario(db, scenario, collection, savedRequests, req.user.id);
        res.json(result);

    } catch (error) {
        console.error('Scenario replan error:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getAll, create, getById, update, remove, getByCollection, getSteps, analyze, run, replan };
