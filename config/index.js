require('dotenv').config();
const logger = require('../utils/logger');

const config = {
  PORT: process.env.PORT || 5000,
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID
};

// ── Startup validation — fail fast with clear messages ──
function validateEnv() {
  const required = [
    ['SUPABASE_URL', config.SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', config.SUPABASE_SERVICE_ROLE_KEY],
    ['RAZORPAY_KEY_ID', config.RAZORPAY_KEY_ID],
    ['RAZORPAY_KEY_SECRET', config.RAZORPAY_KEY_SECRET],
  ];

  const recommended = [
    ['MQTT_BROKER_URL', config.MQTT_BROKER_URL],
    ['GOOGLE_CLIENT_ID', config.GOOGLE_CLIENT_ID],
  ];

  const missingRequired = required.filter(([, v]) => !v);
  const missingRecommended = recommended.filter(([, v]) => !v);

  if (missingRecommended.length > 0) {
    logger.info('');
    logger.info('⚠  Missing recommended env vars (features may be limited):');
    missingRecommended.forEach(([name]) => logger.info(`   • ${name}`));
    logger.info('');
  }

  if (missingRequired.length > 0) {
    logger.error('');
    logger.error('✖  Missing REQUIRED env vars — the server cannot start:');
    missingRequired.forEach(([name]) => logger.error(`   • ${name}`));
    logger.error('');
    logger.error('Copy .env.example to .env and fill in the values.');
    logger.error('');
    process.exit(1);
  }
}

module.exports = config;
module.exports.validateEnv = validateEnv;
