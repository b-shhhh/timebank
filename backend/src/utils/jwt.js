const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function signAccessToken(user) {
  // Minimal claims - never put sensitive data (email, secrets) in a JWT
  // payload since it is only base64-encoded, not encrypted.
  return jwt.sign(
    { sub: user.id, role: user.role, mfa: user.mfaEnabled },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m', algorithm: 'HS256' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

// Refresh tokens are opaque random strings, not JWTs - we store only a
// hash of them server-side (in Session), so a stolen DB dump doesn't hand
// out usable tokens, and we can revoke individual sessions server-side
// (something a stateless JWT-only design can't do cleanly).
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
