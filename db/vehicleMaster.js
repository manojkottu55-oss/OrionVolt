const { supabase } = require('../config/supabaseClient');

async function findAll() {
  const { data, error } = await supabase
    .from('vehicle_master')
    .select('*')
    .order('type')
    .order('make')
    .order('model');
  if (error) throw error;
  return data || [];
}

async function findById(id) {
  const { data, error } = await supabase
    .from('vehicle_master')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertMany(vehicles) {
  const rows = vehicles.map(v => ({
    make: v.make,
    model: v.model,
    type: v.type,
    battery_capacity_kwh: v.batteryCapacityKwh,
    nominal_voltage: v.nominalVoltage,
    max_charging_current: v.maxChargingCurrent,
    connector_type: v.connectorType || 'Type 2'
  }));
  const { data, error } = await supabase
    .from('vehicle_master')
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

module.exports = { findAll, findById, insertMany };
