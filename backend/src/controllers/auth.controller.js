const prisma = require('../config/db');
const {
  validatePasswordPolicy, hashPassword, verifyPassword,
  recordPasswordHistory,
} = require('../utils/password');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/jwt');
const totp = require('../utils/totp');
const { encrypt, decrypt } = require('../utils/crypto');
const { recordActivity } = require('../utils/logger');
const { verifyCaptcha } = require('../utils/captcha');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10);

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

async function issueSession(user, req, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshHash: hashToken(refreshToken),
      userAgent: req.get('user-agent') || null,
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  return accessToken;
}

async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body;

    const policy = validatePasswordPolicy(password, email);
    if (!policy.valid) {
      return res.status(400).json({ error: 'Password does not meet policy.', details: policy.errors });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(200).json({
        message: 'If this email is not already registered, a verification link has been sent.',
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName,
      },
    });

    await recordActivity({ userId: user.id, action: 'USER_REGISTERED', req });

    res.status(201).json({
      message: 'Registration successful. Please verify your email to continue.',
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, captchaToken } = req.body;
    const user = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });

    const dummyHash = '$2b$12$abcdefghijklmnopqrstuv1234567890abcdefghijklmnopqrstuv';
    const passwordOk = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, dummyHash);

    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      await recordActivity({ userId: user.id, action: 'LOGIN_BLOCKED_LOCKED', req });
      return res.status(423).json({ error: 'Account temporarily locked due to repeated failed attempts.' });
    }

    if (user && user.failedLoginCount >= 3) {
      const captchaOk = await verifyCaptcha(captchaToken);
      if (!captchaOk) {
        return res.status(400).json({ error: 'CAPTCHA verification required.', requireCaptcha: true });
      }
    }

    if (!user || !passwordOk) {
      if (user) {
        const failedLoginCount = user.failedLoginCount + 1;
        const shouldLock = failedLoginCount >= MAX_FAILED_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            lockedUntil: shouldLock
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
              : null,
          },
        });
        await recordActivity({ userId: user.id, action: 'LOGIN_FAILED', req, metadata: { failedLoginCount } });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    if (user.mfaEnabled) {
      const pendingToken = signAccessToken({ id: user.id, role: 'PENDING_MFA', mfaEnabled: true });
      await recordActivity({ userId: user.id, action: 'LOGIN_PASSWORD_OK_MFA_PENDING', req });
      return res.status(200).json({ mfaRequired: true, pendingToken });
    }

    // Check password expiration (90 days)
    const { isPasswordExpired } = require('../utils/password');
    if (isPasswordExpired(user.passwordChangedAt)) {
      await recordActivity({ userId: user.id, action: 'LOGIN_PASSWORD_EXPIRED', req });
      return res.status(403).json({ error: 'Password expired. Please change your password.', passwordExpired: true });
    }

    const accessToken = await issueSession(user, req, res);
    await recordActivity({ userId: user.id, action: 'LOGIN_SUCCESS', req });
    res.status(200).json({
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    });
  } catch (err) {
    next(err);
  }
}

async function verifyMfaLogin(req, res, next) {
  try {
    const { pendingToken, code, isBackupCode } = req.body;
    const { verifyAccessToken } = require('../utils/jwt');
    let payload;
    try {
      payload = verifyAccessToken(pendingToken);
    } catch {
      return res.status(401).json({ error: 'MFA session expired, please log in again.' });
    }
    if (payload.role !== 'PENDING_MFA') {
      return res.status(400).json({ error: 'Invalid MFA session.' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.mfaEnabled) return res.status(400).json({ error: 'MFA is not enabled for this account.' });

    let ok = false;
    let updatedBackupCodes = user.mfaBackupCodes;
    if (isBackupCode) {
      const result = await totp.consumeBackupCode(user.mfaBackupCodes, code);
      ok = result.valid;
      updatedBackupCodes = result.remaining;
    } else {
      const secret = decrypt(user.mfaSecret);
      ok = totp.verifyToken(secret, code);
    }

    if (!ok) {
      await recordActivity({ userId: user.id, action: 'MFA_VERIFY_FAILED', req });
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }

    if (isBackupCode) {
      await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: updatedBackupCodes } });
    }

    const accessToken = await issueSession(user, req, res);
    await recordActivity({ userId: user.id, action: 'MFA_VERIFY_SUCCESS', req });
    res.status(200).json({
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token provided.' });

    const tokenHash = hashToken(token);
    const session = await prisma.session.findFirst({ where: { refreshHash: tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired, please log in again.' });
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid session.' });

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const accessToken = await issueSession(user, req, res);
    res.status(200).json({ accessToken });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await prisma.session.updateMany({
        where: { refreshHash: hashToken(token) },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie('refreshToken', { path: '/' });
    if (req.user) await recordActivity({ userId: req.user.id, action: 'LOGOUT', req });
    res.status(200).json({ message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) return res.status(401).json({ error: 'Current password is incorrect.' });

    const policy = validatePasswordPolicy(newPassword, user.email);
    if (!policy.valid) return res.status(400).json({ error: 'Password does not meet policy.', details: policy.errors });

    const { isPasswordReused } = require('../utils/password');
    if (await isPasswordReused(user.id, user.passwordHash, newPassword)) {
      return res.status(400).json({ error: 'You cannot reuse a recent password.' });
    }

    const newHash = await hashPassword(newPassword);
    await recordPasswordHistory(user.id, user.passwordHash);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordActivity({ userId: user.id, action: 'PASSWORD_CHANGED', req });
    res.status(200).json({ message: 'Password updated. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, verifyMfaLogin, refresh, logout, changePassword };
