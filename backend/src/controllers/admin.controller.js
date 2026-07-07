const prisma = require('../config/db');
const { recordActivity } = require('../utils/logger');


async function listUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, displayName: true, role: true,
        timeCredits: true, createdAt: true, lockedUntil: true, mfaEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

const VALID_ROLES = ['MEMBER', 'MEDIATOR', 'ADMIN'];

async function setUserRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }
    const updated = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
    await recordActivity({ userId: req.user.id, action: 'ADMIN_ROLE_CHANGED', req, targetType: 'User', targetId: updated.id, metadata: { newRole: role } });
    res.status(200).json({ id: updated.id, role: updated.role });
  } catch (err) {
    next(err);
  }
}

async function unlockUser(req, res, next) {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { lockedUntil: null, failedLoginCount: 0 },
    });
    await recordActivity({ userId: req.user.id, action: 'ADMIN_UNLOCKED_USER', req, targetType: 'User', targetId: updated.id });
    res.status(200).json({ message: 'User unlocked.' });
  } catch (err) {
    next(err);
  }
}

async function getActivityLogs(req, res, next) {
  try {
    const { userId, action, take = 100 } = req.query;
    const logs = await prisma.activityLog.findMany({
      where: {
        ...(userId ? { userId: String(userId) } : {}),
        ...(action ? { action: String(action) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, parseInt(take, 10) || 100),
    });
    res.status(200).json(logs);
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, setUserRole, unlockUser, getActivityLogs };
