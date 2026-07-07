const winston = require('winston');
const prisma = require('../config/db');

const SENSITIVE_KEYS = new Set([
  'password', 'newPassword', 'oldPassword', 'confirmPassword',
  'token', 'accessToken', 'refreshToken', 'mfaSecret', 'mfaToken',
  'backupCode', 'authorization', 'cookie', 'otp',
]);

function redact(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      clean[key] = redact(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const appLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' }),
  ],
});

async function recordActivity({ userId = null, action, targetType = null, targetId = null, req = null, metadata = {} }) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        ipAddress: req ? req.ip : null,
        userAgent: req ? req.get('user-agent') : null,
        metadata: JSON.stringify(redact(metadata)),
      },
    });
  } catch (err) {
    appLogger.error('Failed to write activity log', { error: err.message, action });
  }
}

module.exports = { appLogger, recordActivity, redact };
