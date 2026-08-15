const { getTariffConfig } = require('../db/tariffConfig');
const { findById } = require('../db/vehicleMaster');

const calculateEstimate = async (req, res) => {
    try {
        const { vehicleId, chargingMode, amount, currentBatteryPct, targetBatteryPct } = req.body;

        if (!vehicleId) {
            return res.status(400).json({ error: 'Vehicle ID is required' });
        }

        // Validate UUID format before hitting the DB (prevents Postgres 22P02 crash)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(vehicleId)) {
            return res.status(400).json({ error: 'Invalid vehicle ID format' });
        }

        // Fetch active tariff configuration
        const tariff = await getTariffConfig();
        const energyRate = tariff.energy_rate_per_kwh || 12; // fallback just in case

        // Fetch vehicle details
        const vehicle = await findById(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        let targetEnergyKwh = 0;
        let estimatedAmount = 0;
        let breakdown = '';

        if (chargingMode === 'amount') {
            const reqAmount = parseFloat(amount);
            if (isNaN(reqAmount) || reqAmount <= 0) {
                return res.status(400).json({ error: 'Valid amount is required' });
            }
            
            targetEnergyKwh = reqAmount / energyRate;
            estimatedAmount = reqAmount;
            breakdown = `Amount (₹${reqAmount}) / Rate (₹${energyRate}/kWh) = ${targetEnergyKwh.toFixed(3)} kWh`;

        } else if (chargingMode === 'percentage' || chargingMode === 'full_charge') {
            const currentPct = parseFloat(currentBatteryPct);
            let targetPct = parseFloat(targetBatteryPct);
            
            if (chargingMode === 'full_charge') {
                targetPct = 100;
            }

            if (isNaN(currentPct) || isNaN(targetPct) || currentPct < 0 || targetPct > 100 || currentPct >= targetPct) {
                return res.status(400).json({ error: 'Valid current and target percentages are required, and target must be greater than current.' });
            }

            const batteryCapacity = vehicle.battery_capacity_kwh;
            targetEnergyKwh = batteryCapacity * ((targetPct - currentPct) / 100);
            estimatedAmount = targetEnergyKwh * energyRate;
            
            breakdown = `Capacity (${batteryCapacity} kWh) × ${(targetPct - currentPct)}% = ${targetEnergyKwh.toFixed(3)} kWh. 
Cost: ${targetEnergyKwh.toFixed(3)} kWh × ₹${energyRate}/kWh = ₹${estimatedAmount.toFixed(2)}`;
        } else {
            return res.status(400).json({ error: 'Invalid charging mode' });
        }

        const CHARGING_POWER_KW = 3.3; // Assuming standard 3.3 kW AC charger
        const estimatedTimeHours = targetEnergyKwh / CHARGING_POWER_KW;
        let estimatedTimeMinutes = Math.ceil(estimatedTimeHours * 60);
        
        // Ensure at least 1 minute if there's any energy
        if (targetEnergyKwh > 0 && estimatedTimeMinutes < 1) {
            estimatedTimeMinutes = 1;
        }

        breakdown += `\nTime: ~${estimatedTimeMinutes} mins (@ ${CHARGING_POWER_KW}kW speed)`;

        res.json({
            targetEnergyKwh: parseFloat(targetEnergyKwh.toFixed(3)),
            estimatedAmount: parseFloat(estimatedAmount.toFixed(2)),
            estimatedTimeMinutes: estimatedTimeMinutes,
            energyRateUsed: energyRate,
            breakdown,
            vehicle: {
                make: vehicle.make,
                model: vehicle.model,
                capacity: vehicle.battery_capacity_kwh
            }
        });

    } catch (error) {
        console.error('Error calculating estimate:', error);
        res.status(500).json({ error: 'Internal server error while calculating estimate' });
    }
};

module.exports = {
    calculateEstimate
};
