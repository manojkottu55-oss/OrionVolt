require('dotenv').config();
const { supabase } = require('./config/supabaseClient');

async function main() {
  const idsToDelete = [
    'f23f6796-9e2d-4f44-819b-f71bc92f222d',
    'c8186d7d-a9b0-4aeb-9fa2-9b1b94806d5d',
    'e69241dd-8d11-4d5f-b283-24006e11c81c',
    '1062a8fc-d29a-4ee3-a14b-52c560244574',
    'abb571b1-d295-4dc8-8620-24ce4bff9c39',
    'dae27311-5d1b-4818-9766-9c49b12c3649'
  ];

  console.log(`Deleting ${idsToDelete.length} junk bookings...`);
  
  const { error } = await supabase
    .from('slot_bookings')
    .delete()
    .in('id', idsToDelete);

  if (error) {
    console.error("Error deleting:", error);
    process.exit(1);
  }

  console.log("Successfully deleted junk bookings.");
}

main().catch(console.error);
