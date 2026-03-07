const userService = require('../services/user.service');
const db = require('../database/db');

function register(req, res) {
    try {
        const user = userService.register(db, req.body);
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

function login(req, res) {
    try {
        const result = userService.login(db, req.body);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
}

module.exports = { register, login };
