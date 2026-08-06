const db = require('../db');

const VEHICLE_TYPES = ['two_wheeler', 'three_wheeler', 'four_wheeler'];

/**
 * Calculates the estimated cost for charging.
 * User pays whichever is higher between the time-based cost and energy-based cost
 * (if time billing is enabled).
 */
const calculateEstimate = async (vehicleType, durationMinutes = 0, energyKwh = 0, targetType = 'energy', targetValue = 0, vehicleObj = null) => {
  // Fetch live tariff config from DB
  const config = await db.tariffConfig.getTariffConfig();
  const costPerKwh = config.energy_rate_per_kwh;
  const costPerMinute = config.time_rate_per_minute;
  const timeBillingEnabled = config.time_billing_enabled;

  if (targetType === 'amount') {
    return parseFloat(targetValue) || 0;
  }

  if (targetType === 'percentage' || targetType === 'full_charge') {
    let percentToCharge = targetType === 'full_charge' ? 100 : parseFloat(targetValue) || 0;
    let calculatedEnergy = 0;
    if (vehicleObj && vehicleObj.batteryCapacityKwh) {
      calculatedEnergy = vehicleObj.batteryCapacityKwh * (percentToCharge / 100);
    } else {
      // fallback if vehicle doesn't exist
      calculatedEnergy = percentToCharge === 100 ? 5 : 2; 
    }
    return Math.max(calculatedEnergy * costPerKwh, 0);
  }

  // Fallback to original duration/energy calculation
  const energyCost = energyKwh * costPerKwh;
  const timeCost = timeBillingEnabled ? (durationMinutes * costPerMinute) : 0;
  
  return Math.max(energyCost, timeCost);
};

module.exports = {
  VEHICLE_TYPES,
  calculateEstimate
};
