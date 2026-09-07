const express = require('express');
const router = express.Router();
const chargeController = require('../controllers/chargeController');
const authMiddleware = require('../middleware/auth');

// Existing: used by Charge page (guest + signed-in)
router.post('/calculate', chargeController.calculateEstimate);

// New: used by Slot Booking wizard — requires auth
router.post('/booking-calculate', authMiddleware, chargeController.calculateBookingEstimate);

module.exports = router;
