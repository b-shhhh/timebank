/**
 * Real-Time Alerting Module (Requirement 2.5)
 *
 * Sends security alerts via email when suspicious activity thresholds
 * are exceeded. In production, this can be extended to send webhooks,
 * SMS alerts, or push notifications.
 *
 * Uses nodemailer for email delivery. Configure via environment variables:
 *   ALERT_EMAIL_ENABLED=true
 *   ALERT_EMAIL_TO=admin@example.com
 *   ALERT_EMAIL_FROM=alerts@timebank.com
 *   SMTP_HOST=smtp.example.com
 *   SMTP_PORT=587
 *   SMTP_USER=...
 *   SMTP_PASS=...
 */

const nodemailer = require('nodemailer');
const { appLogger } = require('./logger');

const ENABLED = process.env.ALERT_EMAIL_ENABLED === 'true';
const ALERT_TO = process.env.ALERT_EMAIL_TO || '';
const ALERT_FROM = process.env.ALERT_EMAIL_FROM || 'alerts@timebank.local';

let transporter = null;

if (ENABLED && ALERT_TO) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

/**
 * Send a security alert to the configured admin address.
 *
 * @param {string} subject - Short alert title
 * @param {string} body - Detailed description (plain text)
 * @param {Object} [metadata] - Additional context to include
 */
async function sendAlert(subject, body, metadata = {}) {
  if (!ENABLED || !transporter) {
    appLogger.warn('Alert not sent (alerting disabled or not configured)', {
      subject,
      body: body.slice(0, 200),
    });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `[TimeBank Security Alert] ${subject}`,
      text: `${body}\n\nMetadata:\n${JSON.stringify(metadata, null, 2)}\n\nTimestamp: ${new Date().toISOString()}`,
    });

    appLogger.info('Security alert sent', {
      subject,
      messageId: info.messageId,
    });
  } catch (err) {
    appLogger.error('Failed to send security alert', {
      subject,
      error: err.message,
    });
  }
}

/**
 * Alert categories mapped to security events.
 */
const AlertCategory = {
  BRUTE_FORCE: 'Brute Force Attack Detected',
  SUSPICIOUS_LOGIN: 'Suspicious Login Activity',
  SESSION_HIJACK: 'Possible Session Hijacking',
  RATE_LIMIT_EXCEEDED: 'Rate Limit Exceeded',
  UNAUTHORIZED_ACCESS: 'Unauthorized Access Attempt',
  INTEGRITY_FAILURE: 'Data Integrity Failure',
};

module.exports = { sendAlert, AlertCategory };

