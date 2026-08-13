const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Tariff config routes used by the admin dashboard
// Maps /api/tariff-config -> adminController methods
router.get('/', adminController.getTariffConfig);
router.patch('/', adminController.updateTariffConfig);

module.exports = router;
