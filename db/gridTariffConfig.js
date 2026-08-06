const { supabase } = require('../config/supabaseClient');

const getGridTariffConfig = async () => {
  const { data, error } = await supabase
    .from('grid_tariff_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  
  if (!data) {
    // Return default if not initialized
    return {
      buying_price_per_kwh: 5.0,
      system_loss_percentage: 4.2
    };
  }

  return data;
};

const updateGridTariffConfig = async (updates) => {
  const { data, error } = await supabase
    .from('grid_tariff_config')
    .upsert({ id: 1, ...updates })
    .select()
    .single();

  if (error) throw error;
  return data;
};

module.exports = {
  getGridTariffConfig,
  updateGridTariffConfig
};
