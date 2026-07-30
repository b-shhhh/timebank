/**
 * WebAuthn / Passkey Controller
 *
 * Handles passkey registration and authentication flows (Requirement 2.2, 3.1).
 * Uses @simplewebauthn/server for FIDO2 WebAuthn verification.
 */

const prisma = require('../config/db');
const webauthn = require('../utils/webauthn');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/jwt');
const { recordActivity } = require('../utils/logger');

const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10);

// In-memory challenge store (use Redis in production)
const challengeStore = new Map();

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
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

/**
 * GET /api/auth/passkey/register/begin
 * Returns registration options for creating a new passkey.
 */
async function beginPasskeyRegistration(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const existingCreds = await prisma.passkeyCredential.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const options = await webauthn.generatePasskeyRegistrationOptions(
      user.id,
      user.email,
      user.displayName,
      existingCreds,
    );

    // Store challenge for verification
    challengeStore.set(`reg:${user.id}`, options.challenge);

    res.status(200).json(options);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/passkey/register/complete
 * Verifies the browser's registration response and stores the credential.
 */
async function completePasskeyRegistration(req, res, next) {
  try {
    const { credential, deviceName } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const expectedChallenge = challengeStore.get(`reg:${user.id}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Registration challenge expired. Please try again.' });
    }

    const result = await webauthn.verifyPasskeyRegistration(credential, expectedChallenge);

    // Store the credential
    await prisma.passkeyCredential.create({
      data: {
        id: result.credential.id,
        userId: user.id,
        publicKey: result.credential.publicKey,
        counter: result.credential.counter,
        transports: JSON.stringify(result.credential.transports),
        deviceName: deviceName || null,
      },
    });

    challengeStore.delete(`reg:${user.id}`);

    await recordActivity({
      userId: user.id,
      action: 'PASSKEY_REGISTERED',
      req,
      metadata: { credentialId: result.credential.id, deviceName: deviceName || 'Unnamed' },
    });

    res.status(201).json({ message: 'Passkey registered successfully.', credentialId: result.credential.id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/passkey/login/begin
 * Returns authentication options for passkey login.
 * If email is provided, restricts to credentials for that user.
 */
async function beginPasskeyLogin(req, res, next) {
  try {
    const { email } = req.query;
    let allowedCreds = [];

    if (email) {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (user) {
        allowedCreds = await prisma.passkeyCredential.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
      }
    }

    const options = await webauthn.generatePasskeyAuthenticationOptions(allowedCreds);

    // Store challenge for verification
    challengeStore.set('auth:' + options.challenge, { email: email ? email.toLowerCase() : null, allowedCreds: allowedCreds.map((c) => c.id) });

    res.status(200).json(options);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/passkey/login/complete
 * Verifies the browser's authentication response and issues a session.
 */
async function completePasskeyLogin(req, res, next) {
  try {
    const { credential } = req.body;

    // Look up the credential and associated challenge
    const credId = credential.id;
    const storedCred = await prisma.passkeyCredential.findUnique({ where: { id: credId } });
    if (!storedCred) {
      return res.status(401).json({ error: 'Passkey not recognized. Please register first.' });
    }

    // Find the challenge
    let expectedChallenge = null;
    for (const [key, value] of challengeStore.entries()) {
      if (key.startsWith('auth:')) {
        expectedChallenge = key.slice(5);
        break;
      }
    }

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Authentication challenge expired. Please try again.' });
    }

    const result = await webauthn.verifyPasskeyAuthentication(
      credential,
      expectedChallenge,
      storedCred,
    );

    // Update counter
    await prisma.passkeyCredential.update({
      where: { id: credId },
      data: { counter: result.newCounter, lastUsedAt: new Date() },
    });

    // Clear challenges
    for (const key of challengeStore.keys()) {
      if (key.startsWith('auth:')) challengeStore.delete(key);
    }

    // Issue session
    const user = await prisma.user.findUnique({ where: { id: storedCred.userId } });
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordActivity({ userId: user.id, action: 'LOGIN_BLOCKED_LOCKED', req });
      return res.status(423).json({ error: 'Account temporarily locked.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const accessToken = await issueSession(user, req, res);

    await recordActivity({
      userId: user.id,
      action: 'PASSKEY_LOGIN_SUCCESS',
      req,
      metadata: { credentialId: credId },
    });

    res.status(200).json({
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/passkey/credentials
 * Lists the user's registered passkeys.
 */
async function listCredentials(req, res, next) {
  try {
    const creds = await prisma.passkeyCredential.findMany({
      where: { userId: req.user.id },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    });
    res.status(200).json(creds);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/auth/passkey/credentials/:id
 * Removes a passkey credential.
 */
async function removeCredential(req, res, next) {
  try {
    const cred = await prisma.passkeyCredential.findUnique({ where: { id: req.params.id } });
    if (!cred) return res.status(404).json({ error: 'Credential not found.' });
    if (cred.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only remove your own credentials.' });
    }

    await prisma.passkeyCredential.delete({ where: { id: req.params.id } });

    await recordActivity({
      userId: req.user.id,
      action: 'PASSKEY_REMOVED',
      req,
      metadata: { credentialId: req.params.id },
    });

    res.status(200).json({ message: 'Passkey removed.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  beginPasskeyRegistration,
  completePasskeyRegistration,
  beginPasskeyLogin,
  completePasskeyLogin,
  listCredentials,
  removeCredential,
};

