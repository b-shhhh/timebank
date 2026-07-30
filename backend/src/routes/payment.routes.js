const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/payment.controller');

const router = express.Router();

// Public webhook (no auth – PayPal signs the payload)
router.post('/subscription-webhook', express.raw({ type: 'application/json' }), ctrl.handleWebhook);

// Protected routes
router.use(requireAuth);

// Plans
router.get('/plans', ctrl.listPlans);

// Subscription
router.post(
  '/create-subscription',
  [body('planId').isUUID()],
  validate,
  ctrl.createSubscription
);

router.get('/my-subscription', ctrl.mySubscription);
router.post('/cancel-subscription', ctrl.cancelMySubscription);

// Transaction history
router.get('/my-transactions', ctrl.myTransactions);

// Admin: service fees
router.get('/service-fees', requireRole('ADMIN'), ctrl.getServiceFees);

module.exports = router;

