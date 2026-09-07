require('dotenv').config();
const { supabase } = require('./config/supabaseClient');

async function main() {
  console.log("Checking for old junk bookings...");
  const { data, error } = await supabase
    .from('slot_bookings')
    .select('id, kiosk_id, status, created_at, vehicle_model, vehicle_id');

  if (error) {
    console.error("Error querying:", error);
    process.exit(1);
  }

  const junk = data.filter(r => {
    const isUnknownVehicle = !r.vehicle_model || r.vehicle_model === 'Unknown' || r.vehicle_model === 'Vehicle';
    const isCancelled = r.status === 'cancelled';
    const isMissingVehicleId = !r.vehicle_id;
    return isCancelled || (isUnknownVehicle && isMissingVehicleId);
  });

  console.log(`Found ${junk.length} junk bookings out of ${data.length} total.`);
  for (const j of junk) {
    console.log(`ID: ${j.id} | Kiosk: ${j.kiosk_id} | Status: ${j.status} | Vehicle: ${j.vehicle_model || 'NULL'} | Created: ${j.created_at}`);
  }
}

main().catch(console.error);
