/**
 * Payment Controller
 * 
 * Handles:
 * - Subscription creation (PayPal billing)
 * - PayPal webhook processing (subscription activated, payment completed, cancelled)
 * - Credit granting on payment success
 * - Service fee collection on booking completion
 * 
 * Security (Requirement 2.4):
 * - Webhook signature verification (data integrity)
 * - Atomic Prisma transactions with rollback
 * - Activity logging for audit trail
 */

const prisma = require('../config/db');
const paypalService = require('../services/paypal.service');
const { recordActivity, appLogger } = require('../utils/logger');

// ---------------------------------------------------------------------------
// GET /api/payments/plans — list active subscription plans
// ---------------------------------------------------------------------------
async function listPlans(req, res, next) {
  try {
    const plans = await prisma.pricingPlan.findMany({
      where: { isActive: true, type: 'SUBSCRIPTION' },
      orderBy: { priceCents: 'asc' },
    });
    res.status(200).json(plans);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/create-subscription
// Creates a PayPal billing subscription & returns approval URL
// ---------------------------------------------------------------------------
async function createSubscription(req, res, next) {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    // Validate plan
    const plan = await prisma.pricingPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.isActive || plan.type !== 'SUBSCRIPTION') {
      return res.status(400).json({ error: 'Invalid or inactive subscription plan.' });
    }

    // Check if user already has an active subscription
    const existing = await prisma.userSubscription.findUnique({
      where: { userId },
    });
    if (existing && existing.status === 'ACTIVE') {
      return res.status(409).json({
        error: 'You already have an active subscription. Cancel it first to switch plans.',
      });
    }

    // Ensure we have a PayPal plan ID (fallback: create on the fly)
    let paypalPlanId = plan.paypalPlanId;
    if (!paypalPlanId) {
      // Create product & plan in PayPal
      const productId = await paypalService.createProduct(
        `TimeBank ${plan.name}`,
        plan.description || ''
      );
      paypalPlanId = await paypalService.createPlan(
        productId,
        plan.name,
        plan.priceCents,
        plan.intervalMonths || 1,
        plan.description || ''
      );

      // Persist the PayPal plan ID
      await prisma.pricingPlan.update({
        where: { id: plan.id },
        data: { paypalPlanId },
      });
    }

    // Get user details for subscriber info
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Create subscription at PayPal
    const result = await paypalService.createSubscription(
      paypalPlanId,
      userId,
      user.email,
      user.displayName
    );

    // Store pending subscription in DB
    await prisma.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        planId: plan.id,
        paypalSubscriptionId: result.subscriptionId,
        status: 'PENDING',
        autoRenew: true,
      },
      update: {
        planId: plan.id,
        paypalSubscriptionId: result.subscriptionId,
        status: 'PENDING',
        autoRenew: true,
      },
    });

    // Log activity
    await recordActivity({
      userId,
      action: 'SUBSCRIPTION_CREATED',
      req,
      targetType: 'PricingPlan',
      targetId: plan.id,
      metadata: { paypalSubscriptionId: result.subscriptionId, planName: plan.name },
    });

    res.status(201).json({
      approvalUrl: result.approvalUrl,
      subscriptionId: result.subscriptionId,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/subscription-webhook
// PayPal sends webhook events here (BILLING.SUBSCRIPTION.*, PAYMENT.SALE.*)
// ---------------------------------------------------------------------------
async function handleWebhook(req, res, next) {
  try {
    // Step 1: Verify webhook signature (Data Integrity - Requirement 2.4)
    const verified = await paypalService.verifyWebhookSignature(req.headers, req.body);
    if (!verified) {
      appLogger.warn('Unverified PayPal webhook received – rejecting');
      return res.status(401).json({ error: 'Webhook signature verification failed.' });
    }

    const eventType = req.body.event_type;
    const resource = req.body.resource;

    appLogger.info('PayPal webhook received', {
      eventType,
      resourceId: resource?.id,
    });

    // Step 2: Handle event based on type
    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(resource);
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(resource);
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await handleSubscriptionExpired(resource);
        break;

      case 'PAYMENT.SALE.COMPLETED':
        await handlePaymentSaleCompleted(resource);
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        appLogger.warn('Subscription payment failed', { resourceId: resource?.id });
        break;

      default:
        appLogger.debug('Unhandled PayPal webhook event', { eventType });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // Rollback safe – we don't want to return 5xx to PayPal, they'll retry
    appLogger.error('Webhook processing error', { error: err.message });
    res.status(200).json({ received: true, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Handle subscription activated
// ---------------------------------------------------------------------------
async function handleSubscriptionActivated(resource) {
  const subId = resource.id;
  const userId = resource.custom_id;

  if (!userId) {
    appLogger.warn('Subscription activated without custom_id (userId)', { subId });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.findUnique({
      where: { paypalSubscriptionId: subId },
    });
    if (!subscription) {
      appLogger.warn('No local subscription found for PayPal sub', { subId });
      return;
    }

    // Activate
    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: resource.billing_info?.next_billing_time
          ? new Date(resource.billing_info.next_billing_time)
          : null,
      },
    });

    const plan = await tx.pricingPlan.findUnique({ where: { id: subscription.planId } });

    // Grant initial credits
    if (plan) {
      await tx.user.update({
        where: { id: userId },
        data: { timeCredits: { increment: plan.credits } },
      });

      await tx.paymentTransaction.create({
        data: {
          userId,
          type: 'SUBSCRIPTION_ACTIVATED',
          amountCents: plan.priceCents,
          creditsAmount: plan.credits,
          paypalId: subId,
          planId: plan.id,
          status: 'COMPLETED',
          metadata: JSON.stringify({ event: 'BILLING.SUBSCRIPTION.ACTIVATED' }),
        },
      });
    }

    await recordActivity({
      userId,
      action: 'SUBSCRIPTION_ACTIVATED_CREDITS_GRANTED',
      targetType: 'UserSubscription',
      targetId: subscription.id,
      metadata: { paypalSubscriptionId: subId, credits: plan?.credits },
    });
  });
}

// ---------------------------------------------------------------------------
// Handle subscription cancelled
// ---------------------------------------------------------------------------
async function handleSubscriptionCancelled(resource) {
  const subId = resource.id;

  await prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.findUnique({
      where: { paypalSubscriptionId: subId },
    });
    if (!subscription) return;

    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED', autoRenew: false },
    });

    await recordActivity({
      userId: subscription.userId,
      action: 'SUBSCRIPTION_CANCELLED',
      targetType: 'UserSubscription',
      targetId: subscription.id,
    });
  });
}

// ---------------------------------------------------------------------------
// Handle subscription expired
// ---------------------------------------------------------------------------
async function handleSubscriptionExpired(resource) {
  const subId = resource.id;

  await prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.findUnique({
      where: { paypalSubscriptionId: subId },
    });
    if (!subscription) return;

    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED', autoRenew: false },
    });
  });
}

// ---------------------------------------------------------------------------
// Handle payment sale completed (monthly/yearly billing cycle payment)
// Grant the user their monthly credits
// ---------------------------------------------------------------------------
async function handlePaymentSaleCompleted(resource) {
  const billingAgreementId = resource.billing_agreement_id; // links to subscription

  if (!billingAgreementId) {
    appLogger.warn('Sale completed without billing_agreement_id');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.findUnique({
      where: { paypalSubscriptionId: billingAgreementId },
      include: { plan: true },
    });
    if (!subscription || subscription.status !== 'ACTIVE') return;

    if (!subscription.plan) return;

    // Grant credits
    await tx.user.update({
      where: { id: subscription.userId },
      data: { timeCredits: { increment: subscription.plan.credits } },
    });

    // Record transaction
    await tx.paymentTransaction.create({
      data: {
        userId: subscription.userId,
        type: 'CREDITS_GRANTED',
        amountCents: subscription.plan.priceCents,
        creditsAmount: subscription.plan.credits,
        paypalId: resource.id,
        planId: subscription.planId,
        status: 'COMPLETED',
        metadata: JSON.stringify({
          event: 'PAYMENT.SALE.COMPLETED',
          saleAmount: resource.amount?.total,
          saleCurrency: resource.amount?.currency,
        }),
      },
    });

    // Update period end
    if (resource.create_time) {
      await tx.userSubscription.update({
        where: { id: subscription.id },
        data: { currentPeriodEnd: new Date(resource.create_time) },
      });
    }

    await recordActivity({
      userId: subscription.userId,
      action: 'SUBSCRIPTION_CREDITS_GRANTED',
      targetType: 'UserSubscription',
      targetId: subscription.id,
      metadata: {
        credits: subscription.plan.credits,
        saleId: resource.id,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// GET /api/payments/my-subscription — user's current subscription
// ---------------------------------------------------------------------------
async function mySubscription(req, res, next) {
  try {
    const sub = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });
    if (!sub) {
      return res.status(200).json(null);
    }
    res.status(200).json(sub);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/cancel-subscription — user cancels
// ---------------------------------------------------------------------------
async function cancelMySubscription(req, res, next) {
  try {
    const sub = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
    });
    if (!sub) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }
    if (sub.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Subscription is already ${sub.status}.` });
    }

    // Cancel at PayPal first
    if (sub.paypalSubscriptionId) {
      await paypalService.cancelSubscription(
        sub.paypalSubscriptionId,
        'Cancelled by user from TimeBank dashboard'
      );
    }

    // Update local DB
    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', autoRenew: false },
    });

    await recordActivity({
      userId: req.user.id,
      action: 'SUBSCRIPTION_CANCELLED_BY_USER',
      req,
      targetType: 'UserSubscription',
      targetId: sub.id,
    });

    res.status(200).json({ message: 'Subscription cancelled successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/my-transactions — user's payment history
// ---------------------------------------------------------------------------
async function myTransactions(req, res, next) {
  try {
    const transactions = await prisma.paymentTransaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { id: true, name: true } } },
      take: 100,
    });
    res.status(200).json(transactions);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/service-fees — admin view accumulated fees
// ---------------------------------------------------------------------------
async function getServiceFees(req, res, next) {
  try {
    const fees = await prisma.serviceFee.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            id: true,
            skill: true,
            hours: true,
            status: true,
            provider: { select: { id: true, displayName: true } },
          },
        },
      },
      take: 200,
    });

    const totalCents = fees.reduce((sum, f) => sum + f.amountCents, 0);
    const totalCredits = fees.reduce((sum, f) => sum + f.creditsEquivalent, 0);

    res.status(200).json({
      fees,
      totals: {
        amountCents: totalCents,
        creditsEquivalent: totalCredits,
        count: fees.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPlans,
  createSubscription,
  handleWebhook,
  mySubscription,
  cancelMySubscription,
  myTransactions,
  getServiceFees,
};

