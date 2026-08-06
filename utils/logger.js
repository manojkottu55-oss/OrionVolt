const logger = {
  mqtt: (msg) => console.log(`\x1b[36m[MQTT]\x1b[0m ${new Date().toISOString()} ${msg}`),
  rest: (msg) => console.log(`\x1b[32m[REST]\x1b[0m ${new Date().toISOString()} ${msg}`),
  db: (msg) => console.log(`\x1b[35m[DB]\x1b[0m ${new Date().toISOString()} ${msg}`),
  payment: (msg) => console.log(`\x1b[33m[PAYMENT]\x1b[0m ${new Date().toISOString()} ${msg}`),
  refund: (msg) => console.log(`\x1b[34m[REFUND]\x1b[0m ${new Date().toISOString()} ${msg}`),
  info: (msg) => console.log(`\x1b[37m[INFO]\x1b[0m ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${new Date().toISOString()} ${msg}`)
};

module.exports = logger;
