const refundService = require('../services/refundService');

exports.processRefund = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await refundService.processAutoRefund(sessionId);

    if (!result) {
      return res.status(200).json({ success: true, message: 'No refund needed or session not found' });
    }

    return res.status(200).json({ success: true, refund: result });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
