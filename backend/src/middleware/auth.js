const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/db');

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Invalid session.' });
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked.' });
    }
    req.user = { id: user.id, role: user.role, mfaEnabled: user.mfaEnabled, email: user.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient privileges for this action.' });
    }
    next();
  };
}

function requireOwnershipOrRole(loader, ownerFields, bypassRoles = ['ADMIN']) {
  return async (req, res, next) => {
    try {
      const record = await loader(req);
      if (!record) return res.status(404).json({ error: 'Resource not found.' });
      const isOwner = ownerFields.some((f) => record[f] === req.user.id);
      const bypassed = bypassRoles.includes(req.user.role);
      if (!isOwner && !bypassed) {
        return res.status(403).json({ error: 'You do not have access to this resource.' });
      }
      req.resource = record;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth, requireRole, requireOwnershipOrRole };
