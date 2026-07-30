/**
 * WebAuthn / Passkey Utilities
 *
 * Provides registration and authentication challenge generation/verification
 * for FIDO2/WebAuthn credentials (Requirement 2.2, 3.1).
 *
 * This implementation uses @simplewebauthn/server for the core WebAuthn
 * flows and stores passkey credentials in the database.
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const RP_NAME = 'TimeBank';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const RP_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';

/**
 * Generate registration options for a new passkey.
 * @param {string} userId - User UUID
 * @param {string} userEmail - User email (for display)
 * @param {string} userName - User display name
 * @param {Array} existingCreds - Array of { id } objects already registered
 */
async function generatePasskeyRegistrationOptions(userId, userEmail, userName, existingCreds = []) {
  const excludeCredentials = existingCreds.map((cred) => ({
    id: typeof cred.id === 'string' ? isoBase64URL.toBuffer(cred.id) : cred.id,
    type: 'public-key',
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: userEmail,
    userDisplayName: userName,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  return options;
}

/**
 * Verify a registration response from the browser.
 * @param {Object} credential - The credential returned by the browser
 * @param {Object} expectedChallenge - The challenge that was sent
 */
async function verifyPasskeyRegistration(credential, expectedChallenge) {
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration verification failed');
  }

  const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

  return {
    verified: true,
    credential: {
      id: isoBase64URL.fromBuffer(credentialID),
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      counter,
      transports: credential.response?.transports || [],
    },
  };
}

/**
 * Generate authentication options for a passkey login.
 * @param {Array} allowedCreds - Array of { id } objects to restrict authentication to
 */
async function generatePasskeyAuthenticationOptions(allowedCreds = []) {
  const allowCredentials = allowedCreds.length > 0
    ? allowedCreds.map((cred) => ({
        id: typeof cred.id === 'string' ? isoBase64URL.toBuffer(cred.id) : cred.id,
        type: 'public-key',
      }))
    : [];

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
    userVerification: 'preferred',
  });

  return options;
}

/**
 * Verify an authentication response from the browser.
 * @param {Object} credential - The credential returned by the browser
 * @param {Object} expectedChallenge - The challenge that was sent
 * @param {Object} storedCredential - The stored credential from DB (with publicKey, counter)
 */
async function verifyPasskeyAuthentication(credential, expectedChallenge, storedCredential) {
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: storedCredential.id,
      publicKey: Buffer.from(storedCredential.publicKey, 'base64'),
      counter: storedCredential.counter,
      transports: storedCredential.transports || [],
    },
  });

  if (!verification.verified) {
    throw new Error('Passkey authentication verification failed');
  }

  return {
    verified: true,
    newCounter: verification.authenticationInfo?.newCounter || storedCredential.counter,
  };
}

module.exports = {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  RP_ID,
  RP_ORIGIN,
};

