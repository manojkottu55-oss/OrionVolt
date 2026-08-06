const { supabase } = require('../config/supabaseClient');
const otpService = require('../services/otpService');
const db = require('../db');
const { isValidMobile } = require('../middleware/validate');
const logger = require('../utils/logger');

/**
 * Demo OTP: Step 1 — Generate and return OTP (displayed in UI)
 */
exports.requestOtp = async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (!isValidMobile(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }
    const otp = otpService.generateOtp(mobileNumber);
    // Return OTP in response for demo mode (UI will display it as a toast)
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      mobileNumber,
      demoOtp: otp  // Only for demo — remove in production
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Demo OTP: Step 2 — Verify OTP, then create/sign-in Supabase Auth user
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;
    const isValid = otpService.verifyOtp(mobileNumber, otp);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // Use Supabase Admin Auth to create or find the user by phone
    const phone = `+91${mobileNumber}`;

    // Try to find existing user by phone
    const { data: { users } } = await supabase.auth.admin.listUsers();
    let existingUser = users.find(u => u.phone === phone);

    if (!existingUser) {
      // Create a new user in Supabase Auth
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { mobile_number: mobileNumber }
      });
      if (createErr) throw createErr;
      existingUser = newUser.user;

      // Create profile record
      await db.profiles.findOrCreate(existingUser.id, { mobileNumber });
    }

    // Generate a session token for this user
    // Use admin.generateLink — but for simplicity, we sign them in directly
    // by generating a magic link token or using a custom approach
    // Since this is demo mode, we'll return user info and let the frontend
    // set the session via Supabase's signInWithPassword or a custom token

    // For demo: create a temporary session by updating user and generating link
    const { data: sessionData, error: sessionErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: `${mobileNumber}@orionvolt.demo`,
      options: {
        data: { mobile_number: mobileNumber, phone }
      }
    });

    // Return user info — the frontend will handle session establishment
    return res.status(200).json({
      success: true,
      user: {
        id: existingUser.id,
        phone: existingUser.phone,
        mobileNumber
      },
      // Include the hashed token for frontend to verify
      actionLink: sessionData?.properties?.action_link || null
    });
  } catch (error) {
    logger.error(`OTP verify error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Google OAuth — handled entirely by Supabase Auth on the frontend.
 * This endpoint is kept for any post-login profile sync if needed.
 */
exports.googleLogin = async (req, res) => {
  try {
    // When the frontend completes Google OAuth via Supabase,
    // the user is already authenticated. This endpoint can be called
    // to sync profile data if needed.
    const { googleId, name, email } = req.body;

    if (req.user) {
      await db.profiles.findOrCreate(req.user.userId, { googleId, name, email });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile synced'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
