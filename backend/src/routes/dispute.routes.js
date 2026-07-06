const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/dispute.controller');

const router = express.Router();
router.use(requireAuth);

// Least-privilege: only mediators and admins can see or act on the
// dispute queue. Members can raise disputes (see transaction.routes.js)
// but cannot list or resolve them.
router.use(requireRole('MEDIATOR', 'ADMIN'));

router.get('/', ctrl.listOpenDisputes);

router.patch(
  '/:id/resolve',
  [
    param('id').isUUID(),
    body('outcome').isIn(['PROVIDER', 'REQUESTER', 'SPLIT']),
    body('resolutionNotes').optional().isString().isLength({ max: 1000 }),
  ],
  validate,
  ctrl.resolveDispute
);

module.exports = router;
