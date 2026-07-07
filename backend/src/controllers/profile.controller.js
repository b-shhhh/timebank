const prisma = require('../config/db');
const { recordActivity } = require('../utils/logger');
const xss = require('xss');

const SELF_EDITABLE_FIELDS = ['displayName', 'bio', 'skillsOffered', 'skillsNeeded', 'isProfilePrivate'];

function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  return xss(value.trim());
}

function publicProfileShape(user, viewerIsSelfOrPrivileged) {
  const base = {
    id: user.id,
    displayName: user.displayName,
    bio: user.bio,
    skillsOffered: user.skillsOffered ? JSON.parse(user.skillsOffered) : [],
    skillsNeeded: user.skillsNeeded ? JSON.parse(user.skillsNeeded) : [],
  };
  if (user.isProfilePrivate && !viewerIsSelfOrPrivileged) {
    return base;
  }
  return { ...base, email: user.email, timeCredits: user.timeCredits };
}

async function getMyProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.status(200).json(publicProfileShape(user, true));
  } catch (err) {
    next(err);
  }
}

async function updateMyProfile(req, res, next) {
  try {
    const data = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        let value = req.body[field];
        if (field === 'displayName' || field === 'bio') value = sanitizeText(value);
        if (field === 'skillsOffered' || field === 'skillsNeeded') {
          if (!Array.isArray(value)) return res.status(400).json({ error: `${field} must be an array of strings.` });
          value = JSON.stringify(value.slice(0, 20).map((s) => sanitizeText(String(s)).slice(0, 60)));
        }
        if (field === 'isProfilePrivate') value = Boolean(value);
        data[field] = value;
      }
    }
    const updated = await prisma.user.update({ where: { id: req.user.id }, data });
    await recordActivity({ userId: req.user.id, action: 'PROFILE_UPDATED', req, metadata: { fields: Object.keys(data) } });
    res.status(200).json(publicProfileShape(updated, true));
  } catch (err) {
    next(err);
  }
}

async function getProfileById(req, res, next) {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'Profile not found.' });
    const viewerIsPrivileged = req.user.id === target.id || ['ADMIN', 'MEDIATOR'].includes(req.user.role);
    res.status(200).json(publicProfileShape(target, viewerIsPrivileged));
  } catch (err) {
    next(err);
  }
}

async function searchProfiles(req, res, next) {
  try {
    const { skill } = req.query;
    const users = await prisma.user.findMany({
      where: skill
        ? { skillsOffered: { contains: sanitizeText(String(skill)) } }
        : {},
      take: 50,
    });
    const results = users
      .filter((u) => u.id !== req.user.id)
      .map((u) => ({
        id: u.id,
        displayName: u.displayName,
        bio: u.isProfilePrivate ? null : u.bio,
        skillsOffered: u.skillsOffered ? JSON.parse(u.skillsOffered) : [],
      }));
    res.status(200).json(results);
  } catch (err) {
    next(err);
  }
}

async function exportMyData(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { bookingsAsProvider: true, bookingsAsRequester: true, ledgerEntries: true },
    });
    const { passwordHash, mfaSecret, mfaBackupCodes, passwordHistory, ...safe } = user;
    await recordActivity({ userId: req.user.id, action: 'DATA_EXPORTED', req });
    res.status(200).json(safe);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyProfile, updateMyProfile, getProfileById, searchProfiles, exportMyData };
