const rateLimit = require('express-rate-limit');

// Layer 1: coarse IP-based throttling on all authentication endpoints.
// Applied globally to /api/auth/* in index.js.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 requests / 15 min / IP across all auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Layer 2: tighter limiter specifically on the login endpoint, since it's
// the highest-value brute-force target.
const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8, // 8 login attempts / 10 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again later.' },
});

// Layer 3: sensitive-endpoint limiter for password reset / MFA verify,
// which are also brute-forceable (reset tokens, TOTP codes).
const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please slow down.' },
});

// General API limiter applied last, as a backstop against scripted abuse
// of any endpoint (not just auth).
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authRateLimiter, loginRateLimiter, sensitiveActionLimiter, globalApiLimiter };
