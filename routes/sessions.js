const express = require('express');
const router = express.Router();
const sessionsController = require('../controllers/sessionsController');
const authMiddleware = require('../middleware/auth');

router.get('/:sessionId/status', authMiddleware, sessionsController.getSessionStatus);
router.post('/:sessionId/stop', authMiddleware, sessionsController.stopSession);
router.post('/:sessionId/resume', authMiddleware, sessionsController.resumeSession);

module.exports = router;
