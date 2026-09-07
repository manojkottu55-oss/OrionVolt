// ── Supabase Data Access Layer ──
// Drop-in replacement for the old Mongoose models directory.
// Each module wraps Supabase queries for one Postgres table.

const kiosks = require('./kiosks');
const guestSessions = require('./guestSessions');
const signinSessions = require('./signinSessions');
const chargingSessions = require('./chargingSessions');
const payments = require('./payments');
const refunds = require('./refunds');
const sensorReadings = require('./sensorReadings');
const vehicleMaster = require('./vehicleMaster');
const profiles = require('./profiles');
const tariffConfig = require('./tariffConfig');
const gridTariffConfig = require('./gridTariffConfig');
const alerts = require('./alerts');
const bookings = require('./bookings');
const userVehicles = require('./userVehicles');
const supportTickets = require('./supportTickets');
const slotAccessCodes = require('./slotAccessCodes');

module.exports = {
  kiosks,
  guestSessions,
  signinSessions,
  chargingSessions,
  payments,
  refunds,
  sensorReadings,
  vehicleMaster,
  profiles,
  tariffConfig,
  gridTariffConfig,
  alerts,
  bookings,
  userVehicles,
  supportTickets,
  slotAccessCodes
};
