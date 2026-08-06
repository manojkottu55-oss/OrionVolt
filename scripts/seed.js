require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const kiosksData = [
  { kiosk_id: 'KSK001', location: 'Orion Mall, Main Entrance', status: 'online' },
  { kiosk_id: 'KSK002', location: 'Tech Park, Building B', status: 'online' },
  { kiosk_id: 'KSK003', location: 'Highway Rest Stop 45', status: 'offline' },
  { kiosk_id: 'KSK004', location: 'City Center Parking', status: 'charging' }
];

const vehiclesData = [
  { make: 'Ather', model: '450X', type: 'two_wheeler', battery_capacity_kwh: 2.9, nominal_voltage: 51, max_charging_current: 15 },
  { make: 'Ola', model: 'S1 Pro', type: 'two_wheeler', battery_capacity_kwh: 4.0, nominal_voltage: 58, max_charging_current: 18 },
  { make: 'TVS', model: 'iQube', type: 'two_wheeler', battery_capacity_kwh: 3.0, nominal_voltage: 52, max_charging_current: 12 },
  { make: 'Tata', model: 'Nexon EV', type: 'four_wheeler', battery_capacity_kwh: 30.2, nominal_voltage: 320, max_charging_current: 32 },
  { make: 'MG', model: 'ZS EV', type: 'four_wheeler', battery_capacity_kwh: 50.3, nominal_voltage: 400, max_charging_current: 40 },
  { make: 'Mahindra', model: 'Treo', type: 'three_wheeler', battery_capacity_kwh: 7.37, nominal_voltage: 48, max_charging_current: 25 }
];

async function seed() {
  try {
    logger.info('Starting Supabase Seed...');

    // 1. Kiosks
    logger.info('Seeding kiosks...');
    for (const kiosk of kiosksData) {
      await supabase.from('kiosks').upsert(kiosk, { onConflict: 'kiosk_id' });
    }

    // 2. Vehicles
    logger.info('Seeding vehicles...');
    // Fetch existing to avoid duplicates on unique constraint
    const { data: existingVehicles } = await supabase.from('vehicle_master').select('make, model');
    const existingSet = new Set((existingVehicles || []).map(v => `${v.make}-${v.model}`));
    
    for (const vehicle of vehiclesData) {
      if (!existingSet.has(`${vehicle.make}-${vehicle.model}`)) {
        await supabase.from('vehicle_master').insert(vehicle);
      }
    }

    // 3. Dummy Session Data (Optional, for dashboard)
    const { data: firstVehicle } = await supabase.from('vehicle_master').select('id').limit(1).single();
    
    if (firstVehicle) {
      const sessionId = uuidv4();
      const now = new Date();
      
      // Guest Session
      await supabase.from('guest_sessions').upsert({
        session_id: sessionId,
        mobile_number: '9876543210',
        kiosk_id: 'KSK004',
        vehicle_type: 'four_wheeler',
        vehicle_id: firstVehicle.id,
        target_type: 'amount',
        target_value: 500,
        estimated_amount: 500,
        status: 'charging',
        created_at: new Date(now.getTime() - 30 * 60000).toISOString() // 30 mins ago
      }, { onConflict: 'session_id' });

      // Charging Session
      await supabase.from('charging_sessions').upsert({
        session_id: sessionId,
        session_type: 'guest',
        kiosk_id: 'KSK004',
        start_time: new Date(now.getTime() - 25 * 60000).toISOString(),
        energy_used_kwh: 12.5,
        avg_voltage: 232.5,
        avg_current: 15.2,
        status: 'active'
      }, { onConflict: 'session_id' });

      // Payment
      const orderId = `order_${uuidv4().replace(/-/g, '').substring(0, 14)}`;
      await supabase.from('payments').upsert({
        session_id: sessionId,
        order_id: orderId,
        amount: 500,
        gateway_order_id: `gateway_${orderId}`,
        gateway_payment_id: `pay_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        status: 'paid',
        paid_at: new Date(now.getTime() - 28 * 60000).toISOString()
      }, { onConflict: 'order_id' });

      // Sensor Readings
      const readings = [];
      for (let i = 0; i < 10; i++) {
        readings.push({
          kiosk_id: 'KSK004',
          session_id: sessionId,
          voltage: 230 + Math.random() * 5,
          current: 15 + Math.random() * 2,
          power: 3.5 + Math.random(),
          timestamp: new Date(now.getTime() - (10 - i) * 60000).toISOString()
        });
      }
      await supabase.from('sensor_readings').insert(readings);
    }

    logger.info('Database Seed Completed Successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding database:');
    console.error(error);
    process.exit(1);
  }
}

seed();
