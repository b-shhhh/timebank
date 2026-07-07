const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12; // cost factor: tuned for ~200-300ms per hash on
const HISTORY_DEPTH = 5; // block reuse of the last 5 passwords
const MAX_PASSWORD_AGE_DAYS = 90;

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'qwerty123', 'letmein123',
  '123456789', 'admin1234', 'welcome123', 'iloveyou1', 'sunshine1',
]);

function scorePasswordStrength(password) {
  let score = 0;
  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (/(.)\1{2,}/.test(password)) score -= 1; // repeated chars
  const labels = ['very weak', 'weak', 'fair', 'good', 'strong', 'very strong'];
  const idx = Math.max(0, Math.min(labels.length - 1, score));
  return { score, label: labels[idx] };
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
  if (password && COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This password is too common. Choose something more unique.');
  }
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
