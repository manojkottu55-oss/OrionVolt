const express = require('express');
const router = express.Router();
const chargeController = require('../controllers/chargeController');

router.post('/calculate', chargeController.calculateEstimate);

module.exports = router;
