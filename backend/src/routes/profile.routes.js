const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/profile.controller');

const router = express.Router();
router.use(requireAuth);

router.get('/me', ctrl.getMyProfile);
router.get('/me/export', ctrl.exportMyData);

router.patch(
  '/me',
  [
    body('displayName').optional().isString().isLength({ min: 2, max: 40 }),
    body('bio').optional().isString().isLength({ max: 500 }),
    body('skillsOffered').optional().isArray({ max: 20 }),
    body('skillsNeeded').optional().isArray({ max: 20 }),
    body('isProfilePrivate').optional().isBoolean(),
  ],
  validate,
  ctrl.updateMyProfile
);

router.get('/', [query('skill').optional().isString().trim()], validate, ctrl.searchProfiles);
router.get('/:id', [param('id').isUUID()], validate, ctrl.getProfileById);

module.exports = router;
