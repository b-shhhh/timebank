const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = process.env.MFA_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes).'
    );
  }
  return Buffer.from(hex, 'hex');
}

// Encrypts a UTF-8 string, returning ivHex:tagHex:cipherHex so the value
// stored in the DB is self-contained and independently decryptable.
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
