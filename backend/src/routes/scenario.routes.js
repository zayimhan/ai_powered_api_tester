// LOCKED FEATURE — scenario routes
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/scenario.controller');

router.post('/analyze', ctrl.analyze);
router.post('/plan', ctrl.plan);
router.post('/run', ctrl.run);

module.exports = router;
