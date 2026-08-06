const express = require('express');
const router = express.Router();
const { requiredFields } = require('../middleware/validate');
const authController = require('../controllers/authController');

router.post('/mobile-otp/request', requiredFields(['mobileNumber']), authController.requestOtp);
router.post('/mobile-otp/verify', requiredFields(['mobileNumber', 'otp']), authController.verifyOtp);
router.post('/google', requiredFields(['googleId', 'name']), authController.googleLogin);

module.exports = router;
