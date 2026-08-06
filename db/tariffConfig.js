const { supabase } = require('../config/supabaseClient');

const getTariffConfig = async () => {
  const { data, error } = await supabase
    .from('tariff_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  
  if (!data) {
    // Return default if not initialized
    return {
      energy_rate_per_kwh: 12,
      time_rate_per_minute: 2,
      time_billing_enabled: true
    };
  }

  return data;
};

const updateTariffConfig = async (updates) => {
  const { data, error } = await supabase
    .from('tariff_config')
    .upsert({ id: 1, ...updates })
    .select()
    .single();

  if (error) throw error;
  return data;
};

module.exports = {
  getTariffConfig,
  updateTariffConfig
};
