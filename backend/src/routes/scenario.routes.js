const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/scenario.controller');
const authenticateToken = require('../middleware/auth.middleware');

router.use(authenticateToken);

// ─── Static paths FIRST (before /:id) ───
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.post('/analyze', ctrl.analyze);
router.get('/collection/:collectionId', ctrl.getByCollection);

// ─── Parameterized paths ───
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.get('/:id/steps', ctrl.getSteps);
router.post('/:id/run', ctrl.run);
router.post('/:id/run-graph', ctrl.runGraph);
router.post('/:id/resume-graph', ctrl.resumeGraph);
router.post('/:id/replan', ctrl.replan);

module.exports = router;
