const crypto = require('crypto');

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
  // Skip CSRF for GET requests and safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const cookieToken = req.cookies?.csrfToken;

  if (!token || !cookieToken || token !== cookieToken) {
    return res.status(403).json({ error: 'CSRF token validation failed.' });
  }

  next();
}

function setCsrfCookie(req, res, next) {
  if (!req.cookies?.csrfToken) {
    const token = generateCsrfToken();
    res.cookie('csrfToken', token, {
      httpOnly: false, // Must be accessible to JavaScript for header
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }
  next();
}

module.exports = { csrfProtection, setCsrfCookie, generateCsrfToken };