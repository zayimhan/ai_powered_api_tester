const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/execution.controller');
const authenticateToken = require('../middleware/auth.middleware');

router.use(authenticateToken);

router.post('/run', ctrl.run);
router.get('/history', ctrl.getHistory);
router.get('/history/:id', ctrl.getHistoryById);
router.delete('/history/:id', ctrl.removeHistory);

module.exports = router;
