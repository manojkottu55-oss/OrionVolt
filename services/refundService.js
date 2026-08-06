const db = require('../db');
const paymentService = require('./paymentService');
const tariff = require('../config/tariff');
const logger = require('../utils/logger');

/**
 * Calculate the unused balance to be refunded
 * @param {object} session 
 * @param {object} chargingSession 
 * @returns {number} The unused balance
 */
function calculateUnusedBalance(session, chargingSession) {
    // Energy cost calculation
    const actualEnergyCost = (chargingSession.energy_used_kwh || 0) * tariff.COST_PER_KWH;
    
    // Remaining balance is what was paid (estimated) minus what was actually used
    const unusedBalance = (session.estimated_amount || 0) - actualEnergyCost;
    
    // Ensure we never return a negative balance, and round to 2 decimal places
    return Math.max(0, Math.round(unusedBalance * 100) / 100);
}

/**
 * Process auto refund for an interrupted or completed session
 * @param {string} sessionId 
 * @returns {object|null} The refund document if successful, or null
 */
async function processAutoRefund(sessionId) {
    try {
        const payment = await db.payments.findBySessionId(sessionId, 'paid');
        if (!payment) {
            logger.error(`No paid payment found for session ${sessionId}`);
            return null;
        }

        let session = await db.guestSessions.findBySessionId(sessionId);
        if (!session) {
            session = await db.signinSessions.findBySessionId(sessionId);
        }
        
        const chargingSession = await db.chargingSessions.findBySessionId(sessionId);

        if (!session || !chargingSession) {
            logger.error(`Session or ChargingSession not found for id: ${sessionId}`);
            return null;
        }

        const unusedBalance = calculateUnusedBalance(session, chargingSession);

        if (unusedBalance <= 0) {
            logger.refund(`No refund needed for session ${sessionId} - full amount used`);
            return null;
        }

        try {
            await paymentService.refund(payment.gateway_payment_id, unusedBalance);
            
            const refundDoc = await db.refunds.create({
                sessionId,
                paymentId: payment.id,
                amountRefunded: unusedBalance,
                reason: `Auto-refund: ${chargingSession.interrupted_reason || 'session ended early'}`,
                status: 'processed',
                processedAt: new Date().toISOString()
            });

            // Update parent session status
            const guestSession = await db.guestSessions.findBySessionId(sessionId);
            if (guestSession) {
                await db.guestSessions.updateStatus(sessionId, 'refunded');
            } else {
                await db.signinSessions.updateStatus(sessionId, 'refunded');
            }

            logger.refund(`Auto-refund of ₹${unusedBalance} processed for session ${sessionId}`);
            return refundDoc;
        } catch (refundErr) {
            const refundDoc = await db.refunds.create({
                sessionId,
                paymentId: payment.id,
                amountRefunded: unusedBalance,
                reason: `Auto-refund: ${chargingSession.interrupted_reason || 'session ended early'}`,
                status: 'failed'
            });
            
            logger.error(`Refund failed for session ${sessionId}: ${refundErr.message}`);
            return refundDoc;
        }
    } catch (err) {
        logger.error(`Error in processAutoRefund for ${sessionId}: ${err.message}`);
        return null;
    }
}

module.exports = {
    calculateUnusedBalance,
    processAutoRefund
};
