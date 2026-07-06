const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { loginRateLimiter, sensitiveActionLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 12, max: 128 }),
    body('displayName').trim().isLength({ min: 2, max: 40 }).escape(),
  ],
  validate,
  ctrl.register
);

router.post(
  '/login',
  loginRateLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isString().notEmpty()],
  validate,
  ctrl.login
);

router.post(
  '/mfa/verify-login',
  sensitiveActionLimiter,
  [
    body('pendingToken').isString().notEmpty(),
    body('code').isString().isLength({ min: 6, max: 12 }),
  ],
  validate,
  ctrl.verifyMfaLogin
);

router.post('/refresh', ctrl.refresh);
router.post('/logout', requireAuth, ctrl.logout);

router.post(
  '/change-password',
  requireAuth,
  sensitiveActionLimiter,
  [
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 12, max: 128 }),
  ],
  validate,
  ctrl.changePassword
);

module.exports = router;
