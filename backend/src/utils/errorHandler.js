const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  const status = err.status || 500;
  const message = status >= 500
    ? 'Internal Server Error'
    : (err.message || 'Request failed');

  res.status(status).json({
    error: message
  });
};

module.exports = errorHandler;
