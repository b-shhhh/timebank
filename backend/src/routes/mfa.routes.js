const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { sensitiveActionLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/mfa.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/setup', ctrl.beginSetup);

router.post(
  '/confirm',
  sensitiveActionLimiter,
  [
    body('base32Secret').isString().notEmpty(),
    body('code').isString().isLength({ min: 6, max: 8 }),
    body('currentPassword').isString().notEmpty(),
  ],
  validate,
  ctrl.confirmSetup
);

router.post(
  '/disable',
  sensitiveActionLimiter,
  [body('currentPassword').isString().notEmpty(), body('code').isString().isLength({ min: 6, max: 8 })],
  validate,
  ctrl.disable
);

module.exports = router;
