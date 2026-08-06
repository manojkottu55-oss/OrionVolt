let alerts = [];

const addAlert = async (alert) => {
  const newAlert = {
    id: `ALT-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...alert
  };
  alerts.unshift(newAlert); // Add to beginning (newest first)
  return newAlert;
};

const getAllAlerts = async () => {
  return alerts;
};

module.exports = {
  addAlert,
  getAllAlerts
};
