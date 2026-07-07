const prisma = require('../config/db');
const totp = require('../utils/totp');
const { encrypt } = require('../utils/crypto');
const { verifyPassword } = require('../utils/password');
const { recordActivity } = require('../utils/logger');

async function beginSetup(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const secret = totp.generateSecret(user.email);
    const qr = await totp.generateQrDataUrl(secret.otpauth_url);
    res.status(200).json({ base32Secret: secret.base32, qrDataUrl: qr });
  } catch (err) {
    next(err);
  }
}

async function confirmSetup(req, res, next) {
  try {
    const { base32Secret, code, currentPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const passwordOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!passwordOk) return res.status(401).json({ error: 'Password confirmation failed.' });

    const validCode = totp.verifyToken(base32Secret, code);
    if (!validCode) return res.status(400).json({ error: 'Invalid authentication code.' });

    const { plain, hashed } = await totp.generateBackupCodes();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecret: encrypt(base32Secret),
        mfaBackupCodes: JSON.stringify(hashed),
      },
    });

    await recordActivity({ userId: user.id, action: 'MFA_ENABLED', req });
    res.status(200).json({ message: 'MFA enabled.', backupCodes: plain });
  } catch (err) {
    next(err);
  }
}

async function disable(req, res, next) {
  try {
    const { currentPassword, code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const passwordOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!passwordOk) return res.status(401).json({ error: 'Password confirmation failed.' });

    const { decrypt } = require('../utils/crypto');
    const validCode = totp.verifyToken(decrypt(user.mfaSecret), code);
    if (!validCode) return res.status(400).json({ error: 'Invalid authentication code.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null },
    });
    await recordActivity({ userId: user.id, action: 'MFA_DISABLED', req });
    res.status(200).json({ message: 'MFA disabled.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { beginSetup, confirmSetup, disable };
