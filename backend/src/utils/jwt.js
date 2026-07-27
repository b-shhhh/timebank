const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, mfa: user.mfaEnabled },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m', algorithm: 'HS256' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

// Pending-MFA tokens are signed with a separate secret so they can never be
// mistaken for a real access token by requireAuth (which only trusts
// JWT_ACCESS_SECRET). This closes the MFA-bypass vulnerability where the
// pendingToken issued before MFA verification was previously accepted as a
// full session token by any endpoint using requireAuth.
function signMfaPendingToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'mfa_pending' },
    process.env.JWT_MFA_PENDING_SECRET,
    { expiresIn: '5m', algorithm: 'HS256' }
  );
}

function verifyMfaPendingToken(token) {
  return jwt.verify(token, process.env.JWT_MFA_PENDING_SECRET, { algorithms: ['HS256'] });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
  generateRefreshToken,
  hashToken,
};