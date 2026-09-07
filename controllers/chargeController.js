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
        let percentGainedRes = null;
        let resultingBatteryPctRes = null;

        if (chargingMode === 'amount') {
            const reqAmount = parseFloat(amount);
            if (isNaN(reqAmount) || reqAmount <= 0) {
                return res.status(400).json({ error: 'Valid amount is required' });
            }

            targetEnergyKwh = reqAmount / energyRate;
            estimatedAmount = reqAmount;
            breakdown = `Amount (₹${reqAmount}) / Rate (₹${energyRate}/kWh) = ${targetEnergyKwh.toFixed(3)} kWh`;

            const batteryCapacity = vehicle.battery_capacity_kwh;
            const percentGained = (targetEnergyKwh / batteryCapacity) * 100;
            percentGainedRes = parseFloat(percentGained.toFixed(1));

            if (currentBatteryPct) {
                const currentPct = parseFloat(currentBatteryPct);
                if (!isNaN(currentPct) && currentPct >= 0 && currentPct <= 100) {
                    const resultingBatteryPct = Math.min(100, currentPct + percentGained);
                    resultingBatteryPctRes = parseFloat(resultingBatteryPct.toFixed(1));
                    breakdown += `\nThis adds ~${percentGained.toFixed(1)}% to your battery (from ${currentPct}% → ${resultingBatteryPct.toFixed(1)}%)`;
                } else {
                    breakdown += `\nThis adds ~${percentGained.toFixed(1)}% battery charge`;
                }
            } else {
                breakdown += `\nThis adds ~${percentGained.toFixed(1)}% battery charge`;
            }

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
            percentGained: percentGainedRes,
            resultingBatteryPct: resultingBatteryPctRes,
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

/**
 * POST /api/charge/booking-calculate
 * Booking-specific calculation. Key differences from calculateEstimate:
 *  - percentage mode: user enters percentageGain (the GAIN, not current→target)
 *  - adds 10-minute grace period to estimatedTimeMinutes
 *  - returns bookingFee (pro-rated by slot duration) and totalPayable
 */
const calculateBookingEstimate = async (req, res) => {
    try {
        const { vehicleId, chargingMode, amount, percentageGain } = req.body;

        if (!vehicleId) {
            return res.status(400).json({ error: 'Vehicle ID is required' });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(vehicleId)) {
            return res.status(400).json({ error: 'Invalid vehicle ID format' });
        }

        const tariff = await getTariffConfig();
        const energyRate = parseFloat(tariff.energy_rate_per_kwh || 12);
        const bookingRatePerHour = parseFloat(tariff.slot_booking_rate_per_hour || 20);

        const vehicle = await findById(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        const batteryCapacity = parseFloat(vehicle.battery_capacity_kwh);

        let targetEnergyKwh = 0;
        let estimatedAmount = 0;
        let estimatedSocGainPercent = 0;
        let breakdown = '';

        if (chargingMode === 'amount') {
            const reqAmount = parseFloat(amount);
            if (isNaN(reqAmount) || reqAmount <= 0) {
                return res.status(400).json({ error: 'Valid amount is required for amount mode' });
            }
            targetEnergyKwh = reqAmount / energyRate;
            estimatedAmount = reqAmount;
            estimatedSocGainPercent = parseFloat(((targetEnergyKwh / batteryCapacity) * 100).toFixed(1));
            breakdown = `₹${reqAmount} ÷ ₹${energyRate}/kWh = ${targetEnergyKwh.toFixed(3)} kWh (~${estimatedSocGainPercent}% battery gain)`;

        } else if (chargingMode === 'percentage') {
            const pct = parseFloat(percentageGain);
            if (isNaN(pct) || pct <= 0 || pct > 100) {
                return res.status(400).json({ error: 'Percentage gain must be between 1 and 100' });
            }
            targetEnergyKwh = batteryCapacity * (pct / 100);
            estimatedAmount = parseFloat((targetEnergyKwh * energyRate).toFixed(2));
            estimatedSocGainPercent = pct;
            breakdown = `${pct}% of ${batteryCapacity} kWh = ${targetEnergyKwh.toFixed(3)} kWh × ₹${energyRate}/kWh = ₹${estimatedAmount}`;

        } else {
            return res.status(400).json({ error: 'Invalid charging mode. Use "amount" or "percentage".' });
        }

        // Charging time estimate (3.3 kW AC charger)
        const CHARGING_POWER_KW = 3.3;
        let estimatedTimeMinutes = Math.ceil((targetEnergyKwh / CHARGING_POWER_KW) * 60);
        if (targetEnergyKwh > 0 && estimatedTimeMinutes < 1) estimatedTimeMinutes = 1;

        // Slot duration = charging time + 10-minute grace period
        const slotDurationMinutes = estimatedTimeMinutes + 10;

        // Booking fee (pro-rated by minute)
        const bookingFee = parseFloat(((slotDurationMinutes / 60) * bookingRatePerHour).toFixed(2));
        const totalPayable = parseFloat((estimatedAmount + bookingFee).toFixed(2));

        breakdown += `\nCharging time: ~${estimatedTimeMinutes} min (@ ${CHARGING_POWER_KW} kW)`;
        breakdown += `\nGrace period: +10 min`;
        breakdown += `\nTotal slot: ${slotDurationMinutes} min`;
        breakdown += `\nBooking fee: (${slotDurationMinutes} min ÷ 60) × ₹${bookingRatePerHour}/hr = ₹${bookingFee}`;
        breakdown += `\nTotal payable: ₹${estimatedAmount} + ₹${bookingFee} = ₹${totalPayable}`;

        return res.json({
            targetEnergyKwh:        parseFloat(targetEnergyKwh.toFixed(3)),
            estimatedAmount:        parseFloat(estimatedAmount.toFixed(2)),
            estimatedSocGainPercent,
            estimatedTimeMinutes,
            slotDurationMinutes,
            bookingFee,
            totalPayable,
            energyRateUsed:         energyRate,
            bookingRatePerHour,
            vehicle: {
                make:     vehicle.make,
                model:    vehicle.model,
                capacity: batteryCapacity
            },
            breakdown
        });

    } catch (error) {
        console.error('Error calculating booking estimate:', error);
        res.status(500).json({ error: 'Internal server error while calculating booking estimate' });
    }
};

module.exports = {
    calculateEstimate,
    calculateBookingEstimate
};
