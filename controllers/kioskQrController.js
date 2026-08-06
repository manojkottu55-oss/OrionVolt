const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const logger = require('../utils/logger');

const qrTokenStore = new Map();

exports.generateQr = async (req, res) => {
  try {
    const { kioskId } = req.params;
    const kiosk = await db.kiosks.findOne(kioskId);

    if (!kiosk) {
      return res.status(404).json({ error: 'Kiosk not found' });
    }

    const qrToken = uuidv4();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    qrTokenStore.set(qrToken, { kioskId, createdAt: Date.now(), expiresAt });
    logger.info(`QR token generated for kiosk ${kioskId}: ${qrToken}`);

    return res.status(200).json({ success: true, qrToken, kioskId, expiresIn: 300 });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.redeemQr = async (req, res) => {
  try {
    const { qrToken } = req.body;
    const tokenData = qrTokenStore.get(qrToken);

    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid QR token' });
    }

    if (Date.now() > tokenData.expiresAt) {
      qrTokenStore.delete(qrToken);
      return res.status(400).json({ error: 'QR token expired' });
    }

    qrTokenStore.delete(qrToken); // one-time use

    return res.status(200).json({
      success: true,
      kioskId: tokenData.kioskId,
      userId: req.user.userId,
      message: 'Kiosk linked successfully'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
