const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

router.post('/verify', authMiddleware, paymentController.verifyPayment);
router.post('/demo-verify', authMiddleware, paymentController.demoVerifyPayment);
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
