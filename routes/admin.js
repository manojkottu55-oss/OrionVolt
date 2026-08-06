const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/kiosks', adminController.getKiosks);
router.get('/sessions', adminController.getSessions);
router.get('/payments', adminController.getPayments);
router.get('/refunds', adminController.getRefunds);
router.get('/analytics/summary', adminController.getAnalytics);
router.get('/alerts', adminController.getAlerts);
router.get('/kiosk/:id/live', adminController.getKioskLiveData);
router.get('/tariff-config', adminController.getTariffConfig);
router.patch('/tariff-config', adminController.updateTariffConfig);

module.exports = router;
