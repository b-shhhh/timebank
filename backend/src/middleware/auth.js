const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/db');

// Verifies the access token and attaches a minimal user object to
// req.user. Deliberately re-fetches role from the DB rather than trusting
// the JWT's role claim after a threshold, could be extended to always
// re-check on sensitive actions - see requireRole below for the trade-off
// discussion in the report.
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

// Least-privilege gate: pass the roles allowed to call this route.
// Fails closed (deny) on any unlisted role rather than defaulting to allow.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient privileges for this action.' });
    }
    next();
  };
}

// Ownership check for object-level authorization (defends against IDOR):
// confirms the authenticated user actually owns / is party to the record
// identified by req.params[idParam], OR holds one of the bypass roles
// (e.g. ADMIN, MEDIATOR for disputes). `loader` fetches the record and
// must return an object with the fields to check against req.user.id.
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
