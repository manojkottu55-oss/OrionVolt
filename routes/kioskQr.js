const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { requiredFields } = require('../middleware/validate');
const kioskQrController = require('../controllers/kioskQrController');

router.post('/generate/:kioskId', kioskQrController.generateQr);
router.post('/redeem', authMiddleware, requiredFields(['qrToken']), kioskQrController.redeemQr);

module.exports = router;
