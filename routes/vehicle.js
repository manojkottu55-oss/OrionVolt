const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');

// No auth middleware on any of these — needed by kiosk display (guest flow) with no logged-in user
router.get('/',          vehicleController.getVehicles);   // GET /api/vehicles
router.get('/lite',      vehicleController.getLite);       // GET /api/vehicles/lite  (ESP32 minimal payload)
router.get('/types',     vehicleController.getTypes);      // GET /api/vehicles/types
router.get('/companies', vehicleController.getCompanies);  // GET /api/vehicles/companies?type=X
router.get('/models',    vehicleController.getModels);     // GET /api/vehicles/models?type=X&company=Y

module.exports = router;
