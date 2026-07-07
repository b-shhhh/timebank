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

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
