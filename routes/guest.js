const express = require('express');
const router = express.Router();
const { requiredFields } = require('../middleware/validate');
const guestController = require('../controllers/guestController');

router.post('/session', requiredFields(['mobileNumber', 'kioskId', 'vehicleType']), guestController.createSession);
router.post('/session/:id/pay', guestController.createPayment);
router.get('/session/:id', guestController.getSession);

module.exports = router;
