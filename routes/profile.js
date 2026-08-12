const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/auth');
const { requiredFields } = require('../middleware/validate');

// All profile routes require authentication
router.use(authMiddleware);

// Profile
router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);

// Vehicles
router.post('/vehicles', requiredFields(['vehicleType', 'company', 'vehicleId']), profileController.addVehicle);
router.patch('/vehicles/:id/default', profileController.setDefaultVehicle);
router.delete('/vehicles/:id', profileController.removeVehicle);

module.exports = router;
