/**
 * apps/dashboard/app/api/billing/handler.test.ts
 *
 * Tests for createCheckout, handleWebhook, and checkSiteGate.
 * All Stripe and DB calls mocked via injectable BillingDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCheckout,
  handleWebhook,
  checkSiteGate,
  type BillingDeps,
  type CreateCheckoutRequest,
  type WebhookEvent,
} from './handler.js';
import { PLANS, type Tenant, type PlanId } from '../../../lib/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-001';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id:                     TENANT_ID,
    name:                   'Test Tenant',
    email:                  'test@example.com',
    plan:                   'starter',
    billing_status:         'active',
    stripe_customer_id:     'cus_test_123',
    stripe_subscription_id: 'sub_test_456',
    site_limit:             1,
    created_at:             '2025-01-01T00:00:00Z',
    updated_at:             '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function happyDeps(overrides: Partial<BillingDeps> = {}): BillingDeps {
  return {
    loadTenant:                 async () => makeTenant(),
    loadTenantByStripeCustomer: async () => makeTenant(),
    updateTenant:               async () => {},
    countSites:                 async () => 0,
    createCheckoutSession:      async () => 'https://checkout.stripe.com/test',
    ...overrides,
  };
}

function checkoutReq(overrides: Partial<CreateCheckoutRequest> = {}): CreateCheckoutRequest {
  return {
    tenant_id:   TENANT_ID,
    plan:        'pro',
    success_url: 'https://app.vaeo.io/billing?success=true',
    cancel_url:  'https://app.vaeo.io/billing?canceled=true',
    ...overrides,
  };
}

function webhookEvent(type: string, obj: Record<string, unknown> = {}): WebhookEvent {
  return { type, data: { object: obj } };
}

// ── createCheckout ───────────────────────────────────────────────────────────

describe('createCheckout — happy path', () => {
  it('returns ok with checkout URL', async () => {
    const result = await createCheckout(checkoutReq(), happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.url, 'https://checkout.stripe.com/test');
  });

  it('passes correct metadata to createCheckoutSession', async () => {
    let capturedMetadata: Record<string, string> = {};
    await createCheckout(checkoutReq({ plan: 'starter' }), happyDeps({
      createCheckoutSession: async (params) => {
        capturedMetadata = params.metadata;
        return 'https://checkout.stripe.com/test';
      },
    }));
    assert.equal(capturedMetadata['tenant_id'], TENANT_ID);
    assert.equal(capturedMetadata['plan'], 'starter');
  });

  it('passes existing stripe_customer_id when available', async () => {
    let capturedCustomerId: string | undefined;
    await createCheckout(checkoutReq(), happyDeps({
      loadTenant: async () => makeTenant({ stripe_customer_id: 'cus_existing' }),
      createCheckoutSession: async (params) => {
        capturedCustomerId = params.customer_id;
        return 'https://checkout.stripe.com/test';
      },
    }));
    assert.equal(capturedCustomerId, 'cus_existing');
  });

  it('omits customer_id when tenant has none', async () => {
    let capturedCustomerId: string | undefined = 'should_be_overwritten';
    await createCheckout(checkoutReq(), happyDeps({
      loadTenant: async () => makeTenant({ stripe_customer_id: null }),
      createCheckoutSession: async (params) => {
        capturedCustomerId = params.customer_id;
        return 'https://checkout.stripe.com/test';
      },
    }));
    assert.equal(capturedCustomerId, undefined);
  });
});

describe('createCheckout — validation', () => {
  it('rejects invalid plan', async () => {
    const result = await createCheckout(checkoutReq({ plan: 'gold' }), happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Invalid plan'));
  });

  it('rejects empty plan', async () => {
    const result = await createCheckout(checkoutReq({ plan: '' }), happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Invalid plan'));
  });

  it('rejects empty tenant_id', async () => {
    const result = await createCheckout(checkoutReq({ tenant_id: '' }), happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('tenant_id is required'));
  });

  it('returns error when tenant not found', async () => {
    const result = await createCheckout(checkoutReq(), happyDeps({
      loadTenant: async () => null,
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Tenant not found'));
  });

  it('returns error when loadTenant throws', async () => {
    const result = await createCheckout(checkoutReq(), happyDeps({
      loadTenant: async () => { throw new Error('DB down'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('DB down'));
  });

  it('returns error when Stripe throws', async () => {
    const result = await createCheckout(checkoutReq(), happyDeps({
      createCheckoutSession: async () => { throw new Error('Stripe 500'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Stripe 500'));
  });

  it('accepts all three valid plans', async () => {
    for (const plan of ['starter', 'pro', 'enterprise'] as PlanId[]) {
      const result = await createCheckout(checkoutReq({ plan }), happyDeps());
      assert.equal(result.ok, true, `Plan ${plan} should be accepted`);
    }
  });
});

// ── handleWebhook — checkout.session.completed ───────────────────────────────

describe('handleWebhook — checkout.session.completed', () => {
  it('activates tenant plan on checkout completed', async () => {
    let updatedFields: Partial<Tenant> = {};
    let updatedId = '';

    const event = webhookEvent('checkout.session.completed', {
      metadata:     { tenant_id: TENANT_ID, plan: 'pro' },
      customer:     'cus_new_123',
      subscription: 'sub_new_456',
    });

    const result = await handleWebhook(event, happyDeps({
      updateTenant: async (id, fields) => { updatedId = id; updatedFields = fields; },
    }));

    assert.equal(result.ok, true);
    assert.equal(result.action, 'activated_pro');
    assert.equal(updatedId, TENANT_ID);
    assert.equal(updatedFields.plan, 'pro');
    assert.equal(updatedFields.billing_status, 'active');
    assert.equal(updatedFields.stripe_customer_id, 'cus_new_123');
    assert.equal(updatedFields.stripe_subscription_id, 'sub_new_456');
    assert.equal(updatedFields.site_limit, PLANS.pro.site_limit);
  });

  it('sets correct site_limit for each plan', async () => {
    for (const plan of ['starter', 'pro', 'enterprise'] as PlanId[]) {
      let savedLimit = 0;
      const event = webhookEvent('checkout.session.completed', {
        metadata: { tenant_id: TENANT_ID, plan },
        customer: 'cus_1',
        subscription: 'sub_1',
      });
      await handleWebhook(event, happyDeps({
        updateTenant: async (_id, fields) => { savedLimit = fields.site_limit as number; },
      }));
      assert.equal(savedLimit, PLANS[plan].site_limit, `${plan} should set limit to ${PLANS[plan].site_limit}`);
    }
  });

  it('fails when metadata missing tenant_id', async () => {
    const event = webhookEvent('checkout.session.completed', {
      metadata: { plan: 'pro' },
    });
    const result = await handleWebhook(event, happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Missing tenant_id'));
  });

  it('fails when metadata missing plan', async () => {
    const event = webhookEvent('checkout.session.completed', {
      metadata: { tenant_id: TENANT_ID },
    });
    const result = await handleWebhook(event, happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Missing'));
  });

  it('fails when metadata has unknown plan', async () => {
    const event = webhookEvent('checkout.session.completed', {
      metadata: { tenant_id: TENANT_ID, plan: 'platinum' },
    });
    const result = await handleWebhook(event, happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Unknown plan'));
  });
});

// ── handleWebhook — customer.subscription.deleted ────────────────────────────

describe('handleWebhook — customer.subscription.deleted', () => {
  it('deactivates tenant on subscription deleted (via metadata)', async () => {
    let updatedFields: Partial<Tenant> = {};
    const event = webhookEvent('customer.subscription.deleted', {
      metadata: { tenant_id: TENANT_ID },
      customer: 'cus_123',
    });
    const result = await handleWebhook(event, happyDeps({
      updateTenant: async (_id, fields) => { updatedFields = fields; },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.action, 'deactivated');
    assert.equal(updatedFields.billing_status, 'inactive');
    assert.equal(updatedFields.stripe_subscription_id, null);
  });

  it('deactivates tenant on subscription deleted (via customer lookup)', async () => {
    let updatedId = '';
    const event = webhookEvent('customer.subscription.deleted', {
      customer: 'cus_lookup_123',
    });
    const result = await handleWebhook(event, happyDeps({
      loadTenantByStripeCustomer: async (cid) => {
        assert.equal(cid, 'cus_lookup_123');
        return makeTenant();
      },
      updateTenant: async (id) => { updatedId = id; },
    }));
    assert.equal(result.ok, true);
    assert.equal(updatedId, TENANT_ID);
  });

  it('fails when no tenant found for subscription', async () => {
    const event = webhookEvent('customer.subscription.deleted', {
      customer: 'cus_unknown',
    });
    const result = await handleWebhook(event, happyDeps({
      loadTenantByStripeCustomer: async () => null,
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('No tenant found'));
  });
});

// ── handleWebhook — customer.subscription.updated ────────────────────────────

describe('handleWebhook — customer.subscription.updated', () => {
  it('marks tenant past_due when status is past_due', async () => {
    let updatedFields: Partial<Tenant> = {};
    const event = webhookEvent('customer.subscription.updated', {
      status:   'past_due',
      metadata: { tenant_id: TENANT_ID },
    });
    const result = await handleWebhook(event, happyDeps({
      updateTenant: async (_id, fields) => { updatedFields = fields; },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.action, 'marked_past_due');
    assert.equal(updatedFields.billing_status, 'past_due');
  });

  it('ignores non-past_due status updates', async () => {
    const event = webhookEvent('customer.subscription.updated', {
      status:   'active',
      metadata: { tenant_id: TENANT_ID },
    });
    const result = await handleWebhook(event, happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.action, 'ignored');
  });
});

// ── handleWebhook — invoice.payment_failed ───────────────────────────────────

describe('handleWebhook — invoice.payment_failed', () => {
  it('marks tenant past_due on payment failure', async () => {
    let updatedFields: Partial<Tenant> = {};
    const event = webhookEvent('invoice.payment_failed', {
      subscription: 'sub_123',
      customer:     'cus_123',
    });
    const result = await handleWebhook(event, happyDeps({
      loadTenantByStripeCustomer: async () => makeTenant(),
      updateTenant: async (_id, fields) => { updatedFields = fields; },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.action, 'marked_past_due');
    assert.equal(updatedFields.billing_status, 'past_due');
  });

  it('ignores when no subscription on invoice', async () => {
    const event = webhookEvent('invoice.payment_failed', {
      customer: 'cus_123',
    });
    const result = await handleWebhook(event, happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.action, 'ignored');
  });

  it('fails when no tenant found for customer', async () => {
    const event = webhookEvent('invoice.payment_failed', {
      subscription: 'sub_123',
      customer:     'cus_unknown',
    });
    const result = await handleWebhook(event, happyDeps({
      loadTenantByStripeCustomer: async () => null,
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('No tenant found'));
  });
});

// ── handleWebhook — unknown event types ──────────────────────────────────────

describe('handleWebhook — unknown events', () => {
  it('ignores unknown event type', async () => {
    const result = await handleWebhook(webhookEvent('charge.succeeded', {}), happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.action, 'ignored');
  });

  it('ignores customer.created', async () => {
    const result = await handleWebhook(webhookEvent('customer.created', {}), happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.action, 'ignored');
  });
});

// ── handleWebhook — error resilience ─────────────────────────────────────────

describe('handleWebhook — error resilience', () => {
  it('returns error when updateTenant throws', async () => {
    const event = webhookEvent('checkout.session.completed', {
      metadata: { tenant_id: TENANT_ID, plan: 'starter' },
    });
    const result = await handleWebhook(event, happyDeps({
      updateTenant: async () => { throw new Error('DB write failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('DB write failed'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      handleWebhook(webhookEvent('checkout.session.completed', {
        metadata: { tenant_id: TENANT_ID, plan: 'starter' },
      }), happyDeps({
        updateTenant: async () => { throw new Error('crash'); },
      })),
    );
  });
});

// ── checkSiteGate ────────────────────────────────────────────────────────────

describe('checkSiteGate — allowed', () => {
  it('allows when billing active and under limit', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'active', site_limit: 5 }),
      countSites: async () => 2,
    }));
    assert.equal(result.allowed, true);
    assert.equal(result.current_count, 2);
    assert.equal(result.site_limit, 5);
  });

  it('allows when billing active and zero sites', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'active', site_limit: 1 }),
      countSites: async () => 0,
    }));
    assert.equal(result.allowed, true);
  });

  it('allows past_due billing (grace period)', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'past_due', site_limit: 5 }),
      countSites: async () => 1,
    }));
    assert.equal(result.allowed, true);
  });
});

describe('checkSiteGate — blocked', () => {
  it('blocks when billing_status is inactive', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'inactive' }),
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('inactive'));
  });

  it('blocks when billing_status is canceled', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'canceled' }),
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('canceled'));
  });

  it('blocks when at site limit', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'active', site_limit: 1 }),
      countSites: async () => 1,
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('Site limit reached'));
    assert.equal(result.current_count, 1);
    assert.equal(result.site_limit, 1);
  });

  it('blocks when over site limit', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'active', site_limit: 5 }),
      countSites: async () => 7,
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('7/5'));
  });

  it('blocks when tenant not found', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => null,
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('Tenant not found'));
  });

  it('blocks when loadTenant throws', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => { throw new Error('DB down'); },
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('DB down'));
  });

  it('blocks when countSites throws', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ billing_status: 'active' }),
      countSites: async () => { throw new Error('count error'); },
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('count error'));
  });
});

// ── Plan site limits match PLANS constant ────────────────────────────────────

describe('checkSiteGate — plan limits', () => {
  it('starter allows 1 site', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ plan: 'starter', site_limit: PLANS.starter.site_limit, billing_status: 'active' }),
      countSites: async () => 1,
    }));
    assert.equal(result.allowed, false); // at limit
  });

  it('pro allows 5 sites', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ plan: 'pro', site_limit: PLANS.pro.site_limit, billing_status: 'active' }),
      countSites: async () => 4,
    }));
    assert.equal(result.allowed, true); // under limit
  });

  it('enterprise allows 999 sites', async () => {
    const result = await checkSiteGate(TENANT_ID, happyDeps({
      loadTenant: async () => makeTenant({ plan: 'enterprise', site_limit: PLANS.enterprise.site_limit, billing_status: 'active' }),
      countSites: async () => 50,
    }));
    assert.equal(result.allowed, true);
  });
});

// ── PLANS constant ───────────────────────────────────────────────────────────

describe('PLANS constant', () => {
  it('starter is $299/mo', () => {
    assert.equal(PLANS.starter.price, 29900);
    assert.equal(PLANS.starter.site_limit, 1);
  });

  it('pro is $799/mo', () => {
    assert.equal(PLANS.pro.price, 79900);
    assert.equal(PLANS.pro.site_limit, 5);
  });

  it('enterprise is $2,499/mo', () => {
    assert.equal(PLANS.enterprise.price, 249900);
    assert.equal(PLANS.enterprise.site_limit, 999);
  });

  it('all plans have features list', () => {
    for (const plan of Object.values(PLANS)) {
      assert.ok(plan.features.length > 0, `${plan.name} should have features`);
    }
  });
});
