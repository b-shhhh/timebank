const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function generateSecret(email) {
  return speakeasy.generateSecret({
    name: `TimeBank (${email})`,
    length: 20,
  });
}

async function generateQrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}

function verifyToken(base32Secret, token) {
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token,
    window: 1, // allow ±30s clock drift
  });
}

async function generateBackupCodes(count = 8) {
  const plain = Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex')
  );
  const hashed = await Promise.all(plain.map((c) => bcrypt.hash(c, 10)));
  return { plain, hashed };
}

async function consumeBackupCode(hashedCodesJson, submittedCode) {
  const hashedCodes = JSON.parse(hashedCodesJson || '[]');
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(submittedCode, hashedCodes[i])) {
      hashedCodes.splice(i, 1); // one-time use - remove once consumed
      return { valid: true, remaining: JSON.stringify(hashedCodes) };
    }
  }
  return { valid: false, remaining: hashedCodesJson };
}

module.exports = {
  generateSecret,
  generateQrDataUrl,
  verifyToken,
  generateBackupCodes,
  consumeBackupCode,
};
