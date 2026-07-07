const { appLogger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  appLogger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: isProd ? 'An unexpected error occurred.' : err.message,
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found.' });
}

module.exports = { errorHandler, notFoundHandler };
