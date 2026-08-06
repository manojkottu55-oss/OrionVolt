const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

let razorpay;

try {
    if (config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET) {
        razorpay = new Razorpay({
            key_id: config.RAZORPAY_KEY_ID,
            key_secret: config.RAZORPAY_KEY_SECRET
        });
        logger.info('Razorpay SDK initialized successfully.');
    } else {
        logger.error(
            'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing from .env — ' +
            'payment operations will fail. Add them to backend/.env'
        );
    }
} catch (err) {
    logger.error('Failed to initialize Razorpay: ' + err.message);
}

/**
 * Create a new payment order
 * @param {number} amount 
 * @param {string} sessionId 
 * @returns {object} Order details containing orderId, gatewayOrderId, and amount
 */
async function createOrder(amount, sessionId) {
    if (!razorpay) throw new Error('Payment gateway not initialized');
    
    try {
        const options = {
            amount: Math.round(amount * 100), // amount in paise
            currency: 'INR',
            receipt: sessionId,
            notes: { sessionId }
        };
        
        const order = await razorpay.orders.create(options);
        logger.payment(`Order created: ${order.id} for session ${sessionId}, amount ₹${amount}`);
        
        return {
            orderId: uuidv4(),
            gatewayOrderId: order.id,
            amount
        };
    } catch (err) {
        logger.error(`Error creating order for session ${sessionId}: ${err.message}`);
        throw err;
    }
}

/**
 * Verify webhook signature from Razorpay
 * @param {object} body 
 * @param {string} signature 
 * @returns {boolean} True if signature is valid
 */
function verifyWebhook(body, signature) {
    try {
        const expectedSignature = crypto
            .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
            .update(JSON.stringify(body))
            .digest('hex');
            
        return expectedSignature === signature;
    } catch (err) {
        logger.error('Error verifying webhook signature: ' + err.message);
        return false;
    }
}

/**
 * Process a refund for a given payment
 * @param {string} gatewayPaymentId 
 * @param {number} amount 
 * @returns {object} Refund response from Razorpay
 */
async function refund(gatewayPaymentId, amount) {
    if (!razorpay) throw new Error('Payment gateway not initialized');
    
    try {
        const refundResponse = await razorpay.payments.refund(gatewayPaymentId, {
            amount: Math.round(amount * 100)
        });
        
        logger.payment(`Refund processed: ${refundResponse.id}, amount ₹${amount}`);
        return refundResponse;
    } catch (err) {
        logger.error(`Error processing refund for payment ${gatewayPaymentId}: ${err.message}`);
        throw err;
    }
}

module.exports = {
    createOrder,
    verifyWebhook,
    refund
};
