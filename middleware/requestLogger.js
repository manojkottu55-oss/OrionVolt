const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  logger.rest(`${req.method} ${req.originalUrl}`);
  next();
};

module.exports = requestLogger;
