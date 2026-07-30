/**
 * PayPal Service
 * 
 * Wraps the PayPal Checkout Server SDK to handle:
 * - Subscription creation & management
 * - Webhook signature verification (data integrity)
 * - Error handling with rollback support
 * 
 * Supply chain risk mitigation:
 * - Pinned SDK version in package.json
 * - Isolated service module for easy swapping
 */

const paypal = require('@paypal/checkout-server-sdk');
const crypto = require('crypto');
const { appLogger } = require('../utils/logger');

// ---------------------------------------------------------------------------
// Environment – configured via .env
// ---------------------------------------------------------------------------
const CLIENT_ID     = process.env.PAYPAL_CLIENT_ID || 'sb';
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || 'sb';
const WEBHOOK_ID    = process.env.PAYPAL_WEBHOOK_ID || '';
const API_URL       = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';

const environment =
  API_URL.includes('sandbox')
    ? new paypal.core.SandboxEnvironment(CLIENT_ID, CLIENT_SECRET)
    : new paypal.core.LiveEnvironment(CLIENT_ID, CLIENT_SECRET);

const client = new paypal.core.PayPalHttpClient(environment);

// ---------------------------------------------------------------------------
// Helper – build idempotency key for retry safety
// ---------------------------------------------------------------------------
function idempotencyKey(prefix, userId) {
  return `${prefix}_${userId}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Create a product in PayPal (required before a plan)
// ---------------------------------------------------------------------------
async function createProduct(name, description = '') {
  const request = new paypal.products.ProductsCreateRequest();
  request.requestBody({
    name,
    description: description || `${name} – TimeBank subscription`,
    type: 'DIGITAL',
    category: 'SOFTWARE',
  });
  request.headers['PayPal-Request-Id'] = `product_${Date.now()}`;
  const response = await client.execute(request);
  appLogger.info('PayPal product created', { id: response.result.id });
  return response.result.id;
}

// ---------------------------------------------------------------------------
// Create a billing plan / template in PayPal
// ---------------------------------------------------------------------------
async function createPlan(productId, name, priceCents, intervalMonths, description = '') {
  const price = (priceCents / 100).toFixed(2);
  const interval = intervalMonths === 12 ? 'YEAR' : 'MONTH';

  const request = new paypal.billingplans.PlansCreateRequest();
  request.requestBody({
    product_id: productId,
    name,
    description: description || `${name} – ${price}/${
      interval === 'YEAR' ? 'year' : 'month'
    }`,
    billing_cycles: [
      {
        frequency: { interval_unit: interval, interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // infinite
        pricing_scheme: {
          fixed_price: { value: price, currency_code: 'USD' },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: '0', currency_code: 'USD' },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
  });
  request.headers['PayPal-Request-Id'] = idempotencyKey('plan', name);
  const response = await client.execute(request);
  appLogger.info('PayPal billing plan created', { id: response.result.id, name });
  return response.result.id;
}

// ---------------------------------------------------------------------------
// Create a subscription (returns approval URL)
// ---------------------------------------------------------------------------
async function createSubscription(planId, userId, userEmail, userName) {
  const request = new paypal.subscriptions.SubscriptionsCreateRequest();
  request.requestBody({
    plan_id: planId,
    start_time: new Date(Date.now() + 3600000).toISOString(), // start in 1 hour
    subscriber: {
      name: { given_name: userName || 'TimeBank', surname: 'User' },
      email_address: userEmail || '',
    },
    application_context: {
      brand_name: 'TimeBank',
      locale: 'en-US',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription?canceled=true`,
    },
    custom_id: userId, // attach user ID for webhook identification
  });
  request.headers['PayPal-Request-Id'] = idempotencyKey('sub', userId);
  const response = await client.execute(request);

  const approvalUrl = response.result.links.find((l) => l.rel === 'approve')?.href;
  appLogger.info('PayPal subscription created', {
    subscriptionId: response.result.id,
    userId,
    approvalUrl,
  });

  return {
    subscriptionId: response.result.id,
    approvalUrl,
    status: response.result.status,
  };
}

// ---------------------------------------------------------------------------
// Cancel a subscription at PayPal
// ---------------------------------------------------------------------------
async function cancelSubscription(paypalSubscriptionId, reason = 'User requested cancellation') {
  const request = new paypal.subscriptions.SubscriptionsCancelRequest(paypalSubscriptionId);
  request.requestBody({ reason });
  await client.execute(request);
  appLogger.info('PayPal subscription cancelled', { paypalSubscriptionId });
}

// ---------------------------------------------------------------------------
// Get subscription details from PayPal
// ---------------------------------------------------------------------------
async function getSubscriptionDetails(paypalSubscriptionId) {
  const request = new paypal.subscriptions.SubscriptionsGetRequest(paypalSubscriptionId);
  const response = await client.execute(request);
  return response.result;
}

// ---------------------------------------------------------------------------
// Verify PayPal webhook signature (data integrity)
// Uses PayPal SDK's built-in verifyWebhookSignature
// ---------------------------------------------------------------------------
async function verifyWebhookSignature(headers, body) {
  if (!WEBHOOK_ID) {
    appLogger.warn('PAYPAL_WEBHOOK_ID not configured – skipping webhook verification');
    return false;
  }

  const request = new paypal.notifications.VerifyWebhookSignature();
  request.requestBody({
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: WEBHOOK_ID,
    webhook_event: body,
  });

  try {
    const response = await client.execute(request);
    const verified = response.result.verification_status === 'SUCCESS';
    if (!verified) {
      appLogger.warn('PayPal webhook signature verification FAILED', {
        status: response.result.verification_status,
      });
    }
    return verified;
  } catch (err) {
    appLogger.error('PayPal webhook signature verification error', {
      error: err.message,
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// List all products (for admin setup)
// ---------------------------------------------------------------------------
async function listProducts() {
  const request = new paypal.products.ProductsListRequest();
  const response = await client.execute(request);
  return response.result.products || [];
}

// ---------------------------------------------------------------------------
// List all billing plans (for admin setup)
// ---------------------------------------------------------------------------
async function listPlans(productId) {
  const request = new paypal.billingplans.PlansListRequest();
  request.queryParams({ product_id: productId, page_size: 20, page: 1 });
  const response = await client.execute(request);
  return response.result.plans || [];
}

module.exports = {
  createProduct,
  createPlan,
  createSubscription,
  cancelSubscription,
  getSubscriptionDetails,
  verifyWebhookSignature,
  listProducts,
  listPlans,
  client,
};

