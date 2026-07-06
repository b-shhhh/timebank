const prisma = require('../config/db');
const { recordActivity } = require('../utils/logger');
const xss = require('xss');

// Fields a user is allowed to edit on their OWN profile via this endpoint.
// This explicit allow-list is the core defence against mass assignment:
// even if a client sends { role: "ADMIN", timeCredits: 999999 } in the
// body, only the keys below are ever read from req.body - everything
// else is silently ignored, never passed to Prisma's `data`.
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
  // Private profiles hide contact-adjacent detail from other members;
  // owners, mediators, and admins always see the full shape.
  if (user.isProfilePrivate && !viewerIsSelfOrPrivileged) {
    return base;
  }
  return { ...base, email: user.email, timeCredits: user.timeCredits };
}

// GET /api/profiles/me
async function getMyProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.status(200).json(publicProfileShape(user, true));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/profiles/me - self-service edit, allow-listed fields only.
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

// GET /api/profiles/:id - viewing ANOTHER user's profile.
// Object-level authorization: we look the record up ourselves by the ID
// in the URL rather than trusting any ID the client claims to be "theirs"
// - this route is read-only and privacy-filtered rather than blocked
// outright, since browsing profiles is core app functionality, but the
// isProfilePrivate filter above still applies for non-owners.
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

// GET /api/profiles?skill=xyz - discovery/search. Never exposes email or
// credit balance for other users' cards, regardless of privacy flag,
// keeping the search surface minimal (data minimisation principle).
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

// GDPR-aligned data export: the user's own data only, structured JSON.
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
