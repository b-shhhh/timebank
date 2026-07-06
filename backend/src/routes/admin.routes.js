const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/users', ctrl.listUsers);
router.patch(
  '/users/:id/role',
  [param('id').isUUID(), body('role').isIn(['MEMBER', 'MEDIATOR', 'ADMIN'])],
  validate,
  ctrl.setUserRole
);
router.patch('/users/:id/unlock', [param('id').isUUID()], validate, ctrl.unlockUser);
router.get('/activity-logs', ctrl.getActivityLogs);

module.exports = router;
