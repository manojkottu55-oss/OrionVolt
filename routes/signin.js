const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { requiredFields } = require('../middleware/validate');
const signinController = require('../controllers/signinController');

router.post('/session', authMiddleware, requiredFields(['kioskId', 'vehicleType']), signinController.createSession);
router.post('/session/:id/pay', authMiddleware, signinController.createPayment);
router.get('/session/:id', authMiddleware, signinController.getSession);
router.get('/history', authMiddleware, signinController.getHistory);

module.exports = router;
