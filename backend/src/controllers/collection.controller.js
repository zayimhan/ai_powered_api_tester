const db = require('../database/db');
const collectionService = require('../services/collection.service');

// GET /api/collections
function getAll(req, res) {
    try {
        const userId = req.user.id;
        const collections = collectionService.getAll(db, userId);
        res.json(collections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// POST /api/collections
function create(req, res) {
    try {
        const userId = req.user.id;
        const collection = collectionService.create(db, req.body, userId);
        res.status(201).json(collection);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/collections/:id
function getById(req, res) {
    try {
        const userId = req.user.id;
        const collection = collectionService.getById(db, req.params.id, userId);
        if (collection) {
            res.json(collection);
        } else {
            res.status(404).json({ error: 'Collection not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// PUT /api/collections/:id
function update(req, res) {
    try {
        const userId = req.user.id;
        const collection = collectionService.update(db, req.params.id, req.body, userId);
        res.json(collection);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// DELETE /api/collections/:id
function remove(req, res) {
    try {
        const userId = req.user.id;
        const result = collectionService.remove(db, req.params.id, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getAll, create, getById, update, remove };
