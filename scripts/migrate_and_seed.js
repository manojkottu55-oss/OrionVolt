require('dotenv').config({ path: __dirname + '/../.env' });
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const rawVehicles = `Ola Electric, S1 X, 2/3/4 kWh, 48V, 10A
Ola Electric, S1 Pro, 4 kWh, 72V, 15A
Ola Electric, Gig, 1.5 kWh, 48V, 10A
Ola Electric, Gig+, 1.5/3 kWh, 48V, 10A
Ather, 450S, 2.9 kWh, 60V, 12A
Ather, 450X, 2.9/3.7 kWh, 60V, 12A
Ather, 450 Apex, 3.7 kWh, 72V, 15A
Ather, Rizta, 2.9/3.7 kWh, 60V, 12A
TVS, iQube, 2.2/3.5/5.1 kWh, 60V, 12A
TVS, X, 4.44 kWh, 72V, 15A
Bajaj, Chetak 3001, 3.0 kWh, 60V, 12A
Bajaj, Chetak 3503, 3.5 kWh, 60V, 12A
Bajaj, Chetak 3502, 3.5 kWh, 60V, 12A
Bajaj, Chetak 3501, 3.5 kWh, 60V, 12A
Honda, Activa e, 3.0 kWh, 60V, 12A
Honda, QC1, 1.5 kWh, 48V, 10A
Suzuki, e-Access, 3.07 kWh, 60V, 12A
River, Indie, 4.0 kWh, 72V, 15A
Simple Energy, One, 5.0 kWh, 72V, 15A
Simple Energy, OneS, 3.7 kWh, 72V, 15A
Ultraviolette, F77, 10.3 kWh, 72V, 15A
Ultraviolette, F77 SuperStreet, 10.3 kWh, 72V, 15A
Revolt, RV1, 2.2 kWh, 60V, 12A
Revolt, RV1+, 3.24 kWh, 60V, 12A
Revolt, RV400, 3.24 kWh, 60V, 12A
Revolt, BlazeX, 3.24 kWh, 60V, 12A
Oben, Rorr, 4.4 kWh, 72V, 15A
Oben, Rorr EZ, 2.6/3.4/4.4 kWh, 60V, 12A
Matter, Aera, 5.0 kWh, 72V, 15A
Tork, Kratos, 4.0 kWh, 72V, 15A
Tork, Kratos R, 4.0 kWh, 72V, 15A
Hop, OXO, 3.75 kWh, 72V, 15A
Hop, LEO, 2.1 kWh, 60V, 12A
Hop, LYF, 1.4 kWh, 48V, 10A
Ampere, Reo, 1.44 kWh, 48V, 10A
Ampere, Magnus Neo, 2.3 kWh, 60V, 12A
Ampere, Magnus EX, 2.3 kWh, 60V, 12A
Ampere, Primus, 3.0 kWh, 60V, 12A
Ampere, Nexus, 3.0 kWh, 60V, 12A
BGauss, C12, 2.9 kWh, 60V, 12A
BGauss, D15, 3.2 kWh, 60V, 12A
BGauss, RUV350, 3.0/3.5 kWh, 60V, 12A
Bounce, Infinity E1+, 2.0 kWh, 48V, 10A
Kinetic Green, E-Luna, 2.3 kWh, 60V, 12A
PURE EV, EPluto 7G, 2.4 kWh, 60V, 12A
PURE EV, EcoDryft, 3.0 kWh, 60V, 12A
PURE EV, ETryst X, 3.5 kWh, 60V, 12A
Hero Electric, Optima CX, 2.0 kWh, 48V, 10A
Hero Electric, Photon, 1.87 kWh, 48V, 10A
Hero Electric, NYX, 1.5/2.5 kWh, 48V, 10A
Okinawa, Lite, 1.25 kWh, 48V, 10A
Okinawa, Ridge+, 1.7 kWh, 48V, 10A
Okinawa, PraisePro, 2.08 kWh, 60V, 12A
Okinawa, iPraise+, 3.3 kWh, 60V, 12A
Joy e-bike, Wolf+, 2.12 kWh, 60V, 12A
Joy e-bike, GenNxt, 2.18 kWh, 60V, 12A
Joy e-bike, Mihos, 2.96 kWh, 60V, 12A
Yulu, Wynn, 0.98 kWh, 48V, 10A
Avore, EX1, 5.0 kWh, 72V, 15A
Avore, EX2, 5.0 kWh, 72V, 15A
Avore, EX2S, 5.0 kWh, 72V, 15A`;

function parseVehicles() {
  const lines = rawVehicles.split('\n').map(l => l.trim()).filter(l => l);
  const vehicles = [];
  
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    const make = parts[0];
    const modelBase = parts[1];
    const capacityRaw = parts[2].replace(' kWh', '');
    const capacities = capacityRaw.split('/');
    const voltage = parseFloat(parts[3].replace('V', ''));
    const current = parseFloat(parts[4].replace('A', ''));

    for (const cap of capacities) {
      let model = modelBase;
      if (capacities.length > 1) {
        model = `${modelBase} (${cap} kWh)`;
      }
      
      vehicles.push({
        make,
        model,
        type: 'two_wheeler',
        battery_capacity_kwh: parseFloat(cap),
        nominal_voltage: voltage,
        max_charging_current: current,
        connector_type: 'IEC 60309 / Proprietary',
        safety_limits: 'OV,UV,OC,SC,OT Protection'
      });
    }
  }
  return vehicles;
}

async function seed() {
  try {
    logger.info('Starting Vehicle Seed...');

    const parsedVehicles = parseVehicles();
    logger.info(`Parsed ${parsedVehicles.length} vehicle models/variants.`);

    // Check if safety_limits column exists
    const { data: testData, error: testError } = await supabase.from('vehicle_master').select('safety_limits').limit(1);
    
    if (testError && testError.message.includes('safety_limits')) {
      logger.error('CRITICAL: The safety_limits column does not exist in vehicle_master.');
      logger.error('Please run the updated backend/supabase_schema.sql in your Supabase SQL Editor first!');
      process.exit(1);
    }

    // Since deleting vehicles that might be referenced by guest_sessions/signin_sessions might cause foreign key violations,
    // we should just upsert instead of deleting all.
    for (const v of parsedVehicles) {
      const { data: existing } = await supabase.from('vehicle_master').select('id').eq('make', v.make).eq('model', v.model).maybeSingle();
      if (existing) {
        await supabase.from('vehicle_master').update(v).eq('id', existing.id);
      } else {
        await supabase.from('vehicle_master').insert(v);
      }
    }

    logger.info('Successfully seeded vehicle_master!');
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding vehicle_master: ' + error.message);
    process.exit(1);
  }
}

seed();
