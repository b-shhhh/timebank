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

// Suspicious activity detection
const SUSPICIOUS_ACTIONS = [
  'LOGIN_FAILED',
  'LOGIN_BLOCKED_LOCKED',
  'MFA_VERIFY_FAILED',
  'LOGIN_PASSWORD_EXPIRED',
];

async function checkSuspiciousActivity(userId, action, req) {
  if (!req || !SUSPICIOUS_ACTIONS.includes(action)) return;
  
  const recentFailures = await prisma.activityLog.count({
    where: {
      userId,
      action: { in: SUSPICIOUS_ACTIONS },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
  });
  
  if (recentFailures >= 5) {
    appLogger.warn('Suspicious activity detected: multiple failed attempts', {
      userId,
      action,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      recentFailures,
    });
    // In production, this could trigger an email alert or admin notification
  }
}

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
    
    // Check for suspicious activity
    if (userId) {
      await checkSuspiciousActivity(userId, action, req);
    }
  } catch (err) {
    appLogger.error('Failed to write activity log', { error: err.message, action });
  }
}

module.exports = { appLogger, recordActivity, redact, checkSuspiciousActivity };
