const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { sensitiveActionLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/webauthn.controller');

const router = express.Router();

// --- Registration (authenticated) ---
router.get(
  '/register/begin',
  requireAuth,
  ctrl.beginPasskeyRegistration,
);

router.post(
  '/register/complete',
  requireAuth,
  sensitiveActionLimiter,
  [
    body('credential').isObject().notEmpty(),
    body('deviceName').optional().isString().isLength({ max: 60 }),
  ],
  validate,
  ctrl.completePasskeyRegistration,
);

// --- Login (unauthenticated) ---
router.get(
  '/login/begin',
  [query('email').optional().isEmail().normalizeEmail()],
  validate,
  ctrl.beginPasskeyLogin,
);

router.post(
  '/login/complete',
  sensitiveActionLimiter,
  [body('credential').isObject().notEmpty()],
  validate,
  ctrl.completePasskeyLogin,
);

// --- Credential management (authenticated) ---
router.get(
  '/credentials',
  requireAuth,
  ctrl.listCredentials,
);

router.delete(
  '/credentials/:id',
  requireAuth,
  [param('id').isString().notEmpty()],
  validate,
  ctrl.removeCredential,
);

module.exports = router;

