const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/collection.controller');
const authenticateToken = require('../middleware/auth.middleware');

router.use(authenticateToken);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

// GET /api/collections/:id/requests  — delegated to request controller
const requestCtrl = require('../controllers/request.controller');
router.get('/:id/requests', requestCtrl.getByCollection);

module.exports = router;
