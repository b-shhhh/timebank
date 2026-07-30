const rateLimit = require('express-rate-limit');

// IP allow-list – IPs in this list bypass IP-based blocking.
// Configure via the IP_ALLOW_LIST env var (comma-separated CIDR or plain IPs).
const ALLOW_LIST = (process.env.IP_ALLOW_LIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Simple IP-blocking middleware.
 * Blocks requests from IPs that have exceeded the configured rate threshold,
 * unless the IP is on the allow-list. Works in tandem with the rate limiters
 * below by logging blocked IPs and checking a configurable block list.
 *
 * For production, consider replacing this with a dedicated package
 * (e.g., express-rate-limit's `skip` function + Redis-based block list).
 */
function isIpAllowed(ip) {
  if (ALLOW_LIST.length === 0) return false;
  // Plain IP match
  if (ALLOW_LIST.includes(ip)) return true;
  // Basic CIDR match for /24 and /32
  for (const entry of ALLOW_LIST) {
    if (entry.includes('/')) {
      const [rangeIP, bits] = entry.split('/');
      const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
      const ipLong = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0);
      const rangeLong = rangeIP.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0);
      if ((ipLong & mask) === (rangeLong & mask)) return true;
    }
  }
  return false;
}

/**
 * In-memory block list for IPs that have hit rate limits repeatedly.
 * In production, this should be backed by Redis so blocks survive restarts
 * and are shared across multiple instances.
 */
const blockedIPs = new Map();

function ipBlockingMiddleware(req, res, next) {
  const ip = req.ip;
  if (isIpAllowed(ip)) return next();

  if (blockedIPs.has(ip)) {
    const until = blockedIPs.get(ip);
    if (until > Date.now()) {
      return res.status(429).json({
        error: 'Your IP has been temporarily blocked due to excessive requests.',
      });
    }
    blockedIPs.delete(ip);
  }

  // Store original end to intercept responses
  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    // If the response was rate-limited (429), increment the block counter
    if (res.statusCode === 429) {
      const current = blockedIPs.get(ip) || 0;
      const strikes = typeof current === 'number' ? current : 0;
      if (strikes >= 3) {
        // Block for 1 hour after 3+ rate limit hits
        blockedIPs.set(ip, Date.now() + 60 * 60 * 1000);
        const logger = require('../utils/logger');
        logger.appLogger.warn('IP blocked due to repeated rate limit violations', { ip });
      } else {
        blockedIPs.set(ip, strikes + 1);
      }
    }
    return originalEnd(...args);
  };

  next();
}

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again later.' },
});

const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please slow down.' },
});

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authRateLimiter, loginRateLimiter, sensitiveActionLimiter, globalApiLimiter,
  ipBlockingMiddleware, isIpAllowed,
};
