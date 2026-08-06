const { createClient } = require('@supabase/supabase-js');
const config = require('./index');
const logger = require('../utils/logger');

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  logger.error(
    'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env — ' +
    'database operations will fail. Add them to backend/.env'
  );
}

const supabase = createClient(
  config.SUPABASE_URL || '',
  config.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Quick connectivity check — call on startup
 */
async function checkConnection() {
  try {
    const { data, error } = await supabase.from('kiosks').select('kiosk_id').limit(1);
    if (error) throw error;
    logger.db('Successfully connected to Supabase (Postgres)');
    return true;
  } catch (err) {
    logger.error(`Supabase connection check failed: ${err.message}`);
    return false;
  }
}

module.exports = { supabase, checkConnection };
