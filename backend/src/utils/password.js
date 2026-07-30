const bcrypt = require('bcryptjs');
const zxcvbn = require('zxcvbn');

const SALT_ROUNDS = 12;
const HISTORY_DEPTH = 5;
const MAX_PASSWORD_AGE_DAYS = 90;

/**
 * Score password strength using zxcvbn (real-time assessment).
 * Returns a 0–4 score, along with feedback and optional crack times.
 */
function scorePasswordStrength(password) {
  if (!password) return { score: 0, label: 'very weak', feedback: [] };
  const result = zxcvbn(password);
  const labels = ['very weak', 'weak', 'fair', 'strong', 'very strong'];
  const label = labels[result.score] || 'very weak';
  const feedback = [
    ...(result.feedback?.suggestions || []),
    ...(result.feedback?.warning ? [result.feedback.warning] : []),
  ];
  return {
    score: result.score,
    label,
    feedback,
    crackTimeSeconds: result.crack_times_seconds?.offline_slow_hashing_1e4_per_second || 0,
  };
}

function validatePasswordPolicy(password, email = '') {
  const errors = [];
  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters long.');
  }
  if (password && password.length > 128) {
    errors.push('Password must be no more than 128 characters long.');
  }
  if (!/[a-z]/.test(password)) errors.push('Include at least one lowercase letter.');
  if (!/[A-Z]/.test(password)) errors.push('Include at least one uppercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Include at least one number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Include at least one special character.');
  const localPart = (email.split('@')[0] || '').toLowerCase();
  if (localPart && password && password.toLowerCase().includes(localPart) && localPart.length >= 4) {
    errors.push('Password must not contain your email address.');
  }
  return { valid: errors.length === 0, errors, strength: scorePasswordStrength(password || '') };
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function isPasswordReused(userId, currentHash, newPassword) {
  const prisma = require('../config/db');
  const matchesCurrent = await bcrypt.compare(newPassword, currentHash);
  if (matchesCurrent) return true;

  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_DEPTH,
  });
  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.hash)) return true;
  }
  return false;
}

async function recordPasswordHistory(userId, oldHash) {
  const prisma = require('../config/db');
  await prisma.passwordHistory.create({ data: { userId, hash: oldHash } });
  const all = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const toDelete = all.slice(HISTORY_DEPTH);
  if (toDelete.length) {
    await prisma.passwordHistory.deleteMany({
      where: { id: { in: toDelete.map((r) => r.id) } },
    });
  }
}

function isPasswordExpired(passwordChangedAt) {
  const ageMs = Date.now() - new Date(passwordChangedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > MAX_PASSWORD_AGE_DAYS;
}

module.exports = {
  validatePasswordPolicy,
  scorePasswordStrength,
  hashPassword,
  verifyPassword,
  isPasswordReused,
  recordPasswordHistory,
  isPasswordExpired,
  MAX_PASSWORD_AGE_DAYS,
};
