const express = require('express');
const router = express.Router();
const { requiredFields } = require('../middleware/validate');
const guestController = require('../controllers/guestController');

// No JWT/auth on any guest route — kiosk operates without a logged-in user session.
// Mobile number match in verify-stop is the only security gate.

// Step 1 — create session (mobile + kiosk only; vehicleType is optional here)
router.post('/session',                                   requiredFields(['mobileNumber', 'kioskId']), guestController.createSession);

// Step 2 — update session with vehicle selection + charging mode, returns estimate
router.patch('/session/:sessionId',                       guestController.updateSession);

// Step 3 — create Razorpay order, returns paymentLink for QR display
router.post('/session/:id/create-payment',                guestController.createPayment);

// Step 4 — ESP32 polls this to detect payment completion
router.get('/session/:sessionId/payment-status',          guestController.getPaymentStatus);

// Step 5 — mobile number verified stop (guest auth gate)
router.post('/session/:sessionId/verify-stop',            requiredFields(['mobileNumber']), guestController.verifyStop);

// Existing — get session + live charging data
router.get('/session/:id',                                guestController.getSession);

// Legacy (kept for backward compat — same as create-payment above)
router.post('/session/:id/pay',                           guestController.createPayment);

module.exports = router;
