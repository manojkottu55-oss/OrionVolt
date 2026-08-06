const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');

// POST /api/feedback
router.post('/', async (req, res) => {
    try {
        const { rating, text, user } = req.body;
        
        const newAlert = await db.alerts.addAlert({
            type: 'feedback',
            title: `User Feedback: ${rating} Stars`,
            message: text || 'No additional comments provided.',
            user: user || 'Anonymous',
            severity: rating <= 2 ? 'high' : (rating == 3 ? 'medium' : 'info')
        });

        logger.info(`New feedback received and alert created: ${newAlert.id}`);
        return res.status(200).json({ success: true, alert: newAlert });
    } catch (error) {
        logger.error('Error submitting feedback: ' + error.message);
        return res.status(500).json({ error: 'Failed to process feedback' });
    }
});

module.exports = router;
