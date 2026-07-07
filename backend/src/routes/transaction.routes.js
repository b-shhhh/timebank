const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireOwnershipOrRole } = require('../middleware/auth');
const ctrl = require('../controllers/transaction.controller');
const disputeCtrl = require('../controllers/dispute.controller');

const router = express.Router();
router.use(requireAuth);

router.post(
  '/',
  [
    body('providerId').isUUID(),
    body('skill').isString().isLength({ min: 1, max: 80 }),
    body('hours').optional().isInt({ min: 1, max: 8 }),
    body('scheduledFor').optional().isISO8601(),
  ],
  validate,
  ctrl.createBooking
);

router.get('/mine', ctrl.myBookings);
router.get('/ledger/mine', ctrl.myLedger);

const bookingOwnership = requireOwnershipOrRole(ctrl.loadBooking, ['providerId', 'requesterId'], ['ADMIN']);

router.patch('/:id/accept', [param('id').isUUID()], validate, bookingOwnership, ctrl.acceptBooking);
router.patch('/:id/complete', [param('id').isUUID()], validate, bookingOwnership, ctrl.completeBooking);
router.patch('/:id/cancel', [param('id').isUUID()], validate, bookingOwnership, ctrl.cancelBooking);

router.post(
  '/:bookingId/dispute',
  [param('bookingId').isUUID(), body('reason').isString().isLength({ min: 5, max: 1000 })],
  validate,
  requireOwnershipOrRole(
    (req) => require('../config/db').booking.findUnique({ where: { id: req.params.bookingId } }),
    ['providerId', 'requesterId'],
    ['ADMIN']
  ),
  disputeCtrl.raiseDispute
);

module.exports = router;
