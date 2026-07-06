const { appLogger } = require('../utils/logger');

// Centralised error handler: never leaks stack traces or internal error
// messages to the client in production (prevents information disclosure
// that could aid an attacker), while still logging full detail server-side.
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
