const db = require('../db');

exports.getVehicles = async (req, res) => {
  try {
    const vehicles = await db.vehicleMaster.findAll();
    return res.status(200).json({ success: true, vehicles });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
