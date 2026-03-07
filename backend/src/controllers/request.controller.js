const db = require('../database/db');
const requestService = require('../services/request.service');

// GET /api/requests
function getAll(req, res) {
    try {
        const userId = req.user.id;
        const requests = requestService.getAll(db, userId);
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// POST /api/requests
function create(req, res) {
    try {
        const userId = req.user.id;
        const request = requestService.create(db, req.body, userId);
        res.status(201).json(request);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/requests/:id
function getById(req, res) {
    try {
        const userId = req.user.id;
        const request = requestService.getById(db, req.params.id, userId);
        if (request) {
            res.json(request);
        } else {
            res.status(404).json({ error: 'Request not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// PUT /api/requests/:id
function update(req, res) {
    try {
        const userId = req.user.id;
        const request = requestService.update(db, req.params.id, req.body, userId);
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// DELETE /api/requests/:id
function remove(req, res) {
    try {
        const userId = req.user.id;
        const result = requestService.remove(db, req.params.id, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/collections/:id/requests
function getByCollection(req, res) {
    try {
        const userId = req.user.id;
        const requests = requestService.getByCollection(db, req.params.id, userId);
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getAll, create, getById, update, remove, getByCollection };
