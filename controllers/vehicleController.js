const db = require('../db');

/**
 * GET /api/vehicles
 * Returns ALL vehicles in vehicle_master.
 * No auth required — used by both user-app dropdowns and kiosk display.
 */
exports.getVehicles = async (req, res) => {
  try {
    const vehicles = await db.vehicleMaster.findAll();
    return res.status(200).json({ success: true, vehicles });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * GET /api/vehicles/types
 * Returns distinct vehicle types (two_wheeler, three_wheeler, four_wheeler).
 * No auth required — first dropdown on kiosk display.
 */
exports.getTypes = async (req, res) => {
  try {
    const vehicles = await db.vehicleMaster.findAll();
    const types = [...new Set(vehicles.map(v => v.type))].sort();
    return res.status(200).json({ success: true, types });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * GET /api/vehicles/companies?type=two_wheeler
 * Returns distinct makes/companies for a given vehicle type.
 * No auth required — second dropdown on kiosk display.
 */
exports.getCompanies = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({ error: 'Missing required query param: type' });
    }
    const vehicles = await db.vehicleMaster.findAll();
    const companies = [...new Set(
      vehicles.filter(v => v.type === type).map(v => v.make)
    )].sort();
    return res.status(200).json({ success: true, companies });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * GET /api/vehicles/models?type=two_wheeler&company=Ather
 * Returns full model objects (id, make, model, battery_capacity_kwh, etc.)
 * for a given type + company. No auth required — third dropdown on kiosk display.
 * The ESP32 needs the vehicle `id` to pass as vehicleId in PATCH /api/guest/session/:id
 */
/**
 * GET /api/vehicles/lite
 * Returns stripped-down vehicle list for ESP32 kiosks with limited RAM.
 * Only includes: id, make, model, type, battery_capacity_kwh, nominal_voltage, max_charging_current.
 */
exports.getLite = async (req, res) => {
  try {
    const vehicles = await db.vehicleMaster.findAll();
    const lite = vehicles.map(({ id, make, model, type, battery_capacity_kwh, nominal_voltage, max_charging_current }) => ({
      id, make, model, type, battery_capacity_kwh, nominal_voltage, max_charging_current
    }));
    return res.status(200).json({ success: true, vehicles: lite });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.getModels = async (req, res) => {
  try {
    const { type, company } = req.query;
    if (!type || !company) {
      return res.status(400).json({ error: 'Missing required query params: type, company' });
    }
    const vehicles = await db.vehicleMaster.findAll();
    const models = vehicles.filter(v => v.type === type && v.make === company);
    return res.status(200).json({ success: true, models });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
