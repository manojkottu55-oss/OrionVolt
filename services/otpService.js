const logger = require('../utils/logger');

const otpStore = new Map();

/**
 * Generate a 6-digit OTP for a given mobile number
 * @param {string} mobileNumber 
 * @returns {string} The generated OTP
 */
function generateOtp(mobileNumber) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    
    // Store OTP with a 5 minute expiration
    otpStore.set(mobileNumber, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000
    });
    
    logger.info(`[OTP] Generated OTP ${otp} for ${mobileNumber} (valid 5 min)`); // Log for dev testing
    
    return otp;
}

/**
 * Verify if the provided OTP matches the stored one and is not expired
 * @param {string} mobileNumber 
 * @param {string} otp 
 * @returns {boolean} True if valid, false otherwise
 */
function verifyOtp(mobileNumber, otp) {
    const stored = otpStore.get(mobileNumber);
    
    if (!stored) {
        return false;
    }
    
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(mobileNumber);
        return false;
    }
    
    if (stored.otp !== otp) {
        return false;
    }
    
    // Delete after successful one-time use
    otpStore.delete(mobileNumber);
    return true;
}

module.exports = {
    generateOtp,
    verifyOtp
};
