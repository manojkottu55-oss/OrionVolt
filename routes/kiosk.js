const express = require('express');
const router = express.Router();
const db = require('../db');
const mqttService = require('../services/mqttService');
const logger = require('../utils/logger');

/**
 * POST /api/kiosk/:kioskId/connected
 *
 * Called by the User Website Charge page on mount when a ?kiosk= param is present.
 * No auth required — the kiosk itself has no logged-in user.
 *
 * Publishes an update_screen MQTT message to the kiosk so its physical display
 * shows "User Connected - Completing Charge on Phone" while the user fills out
 * the charge form on their phone.
 */
router.post('/:kioskId/connected', async (req, res) => {
  const { kioskId } = req.params;

  try {
    // Validate kiosk exists
    const kiosk = await db.kiosks.findOne(kioskId);
    if (!kiosk) {
      return res.status(404).json({ error: `Kiosk '${kioskId}' not found` });
    }

    // Publish display update to ESP32
    mqttService.publishCommand(kioskId, 'update_screen', {
      message: 'User Connected - Completing Charge on Phone'
    });

    logger.mqtt(`Kiosk ${kioskId}: user connected ping sent`);

    return res.status(200).json({
      success: true,
      message: `Screen update sent to kiosk ${kioskId}`
    });
  } catch (err) {
    logger.error(`Kiosk connected endpoint error for ${kioskId}: ${err.message}`);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;
