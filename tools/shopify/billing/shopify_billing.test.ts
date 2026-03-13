/**
 * tools/shopify/billing/shopify_billing.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOPIFY_PLANS,
  createShopifySubscription,
  getShopifySubscription,
  cancelShopifySubscription,
  type ShopifyPlan,
} from './shopify_billing.ts';

// ── SHOPIFY_PLANS ─────────────────────────────────────────────────────────────

describe('SHOPIFY_PLANS', () => {
  it('has all 5 plans', () => {
    assert.equal(SHOPIFY_PLANS.length, 5);
  });

  it('has starter plan at $49/month', () => {
    const plan = SHOPIFY_PLANS.find(p => p.name === 'starter');
    assert.ok(plan);
    assert.equal(plan!.price, 49);
    assert.equal(plan!.interval, 'EVERY_30_DAYS');
  });

  it('has pro plan at $149/month', () => {
    const plan = SHOPIFY_PLANS.find(p => p.name === 'pro');
    assert.ok(plan);
    assert.equal(plan!.price, 149);
  });

  it('has agency_starter at $299/month', () => {
    const plan = SHOPIFY_PLANS.find(p => p.name === 'agency_starter');
    assert.ok(plan);
    assert.equal(plan!.price, 299);
  });

  it('has agency_growth at $799/month', () => {
    const plan = SHOPIFY_PLANS.find(p => p.name === 'agency_growth');
    assert.ok(plan);
    assert.equal(plan!.price, 799);
  });

  it('has agency_enterprise at $1999/month', () => {
    const plan = SHOPIFY_PLANS.find(p => p.name === 'agency_enterprise');
    assert.ok(plan);
    assert.equal(plan!.price, 1999);
  });

  it('every plan has 14 day trial', () => {
    for (const plan of SHOPIFY_PLANS) {
      assert.equal(plan.trial_days, 14, `${plan.name} should have 14 day trial`);
    }
  });

  it('every plan has EVERY_30_DAYS interval', () => {
    for (const plan of SHOPIFY_PLANS) {
      assert.equal(plan.interval, 'EVERY_30_DAYS', `${plan.name} interval`);
    }
  });

  it('every plan has USD currency', () => {
    for (const plan of SHOPIFY_PLANS) {
      assert.equal(plan.currency, 'USD');
    }
  });

  it('every plan has at least one feature', () => {
    for (const plan of SHOPIFY_PLANS) {
      assert.ok(plan.features.length >= 1);
    }
  });
});

// ── createShopifySubscription ─────────────────────────────────────────────────

describe('createShopifySubscription', () => {
  const starterPlan: ShopifyPlan = SHOPIFY_PLANS.find(p => p.name === 'starter')!;

  it('returns confirmation_url on success', async () => {
    const result = await createShopifySubscription(
      'test.myshopify.com',
      starterPlan,
      'https://app.velocityaeo.com/billing/callback',
      {
        graphqlFn: async () => ({
          data: {
            appSubscriptionCreate: {
              appSubscription: { id: 'gid://shopify/AppSubscription/123' },
              confirmationUrl:  'https://test.myshopify.com/admin/charges/confirm_recurring/123',
              userErrors:       [],
            },
          },
        }),
      },
    );
    assert.ok(result);
    assert.ok(result!.confirmation_url.includes('confirm_recurring'));
    assert.ok(result!.subscription_id.length > 0);
  });

  it('returns null on graphql error', async () => {
    const result = await createShopifySubscription(
      'test.myshopify.com',
      starterPlan,
      'https://app.velocityaeo.com/billing/callback',
      {
        graphqlFn: async () => ({
          data: {
            appSubscriptionCreate: {
              appSubscription: null,
              confirmationUrl: null,
              userErrors: [{ field: 'name', message: 'App already has subscription' }],
            },
          },
        }),
      },
    );
    assert.equal(result, null);
  });

  it('returns null when graphqlFn throws', async () => {
    const result = await createShopifySubscription(
      'test.myshopify.com',
      starterPlan,
      'https://example.com',
      {
        graphqlFn: async () => { throw new Error('network error'); },
      },
    );
    assert.equal(result, null);
  });

  it('graphqlFn is injectable', async () => {
    let called = false;
    await createShopifySubscription(
      'test.myshopify.com',
      starterPlan,
      'https://example.com',
      {
        graphqlFn: async () => {
          called = true;
          return { data: { appSubscriptionCreate: { confirmationUrl: 'https://x.com', appSubscription: { id: 'gid://123' }, userErrors: [] } } };
        },
      },
    );
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() =>
      createShopifySubscription(null as never, null as never, null as never),
    );
  });
});

// ── getShopifySubscription ────────────────────────────────────────────────────

describe('getShopifySubscription', () => {
  it('returns status and plan_name on success', async () => {
    const result = await getShopifySubscription(
      'test.myshopify.com',
      'gid://shopify/AppSubscription/123',
      {
        graphqlFn: async () => ({
          data: {
            node: {
              id:        'gid://shopify/AppSubscription/123',
              status:    'ACTIVE',
              name:      'Velocity AEO — starter',
              createdAt: '2025-01-01T00:00:00Z',
            },
          },
        }),
      },
    );
    assert.ok(result);
    assert.equal(result!.status, 'ACTIVE');
    assert.ok(result!.plan_name.includes('starter'));
    assert.ok(result!.activated_on);
  });

  it('returns null when node is null', async () => {
    const result = await getShopifySubscription(
      'test.myshopify.com',
      'gid://404',
      { graphqlFn: async () => ({ data: { node: null } }) },
    );
    assert.equal(result, null);
  });

  it('returns null when graphqlFn throws', async () => {
    const result = await getShopifySubscription(
      'test.myshopify.com',
      'gid://123',
      { graphqlFn: async () => { throw new Error('timeout'); } },
    );
    assert.equal(result, null);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      getShopifySubscription(null as never, null as never),
    );
  });
});

// ── cancelShopifySubscription ─────────────────────────────────────────────────

describe('cancelShopifySubscription', () => {
  it('returns true on success', async () => {
    const result = await cancelShopifySubscription(
      'test.myshopify.com',
      'gid://shopify/AppSubscription/123',
      {
        graphqlFn: async () => ({
          data: {
            appSubscriptionCancel: {
              appSubscription: { id: 'gid://123', status: 'CANCELLED' },
              userErrors: [],
            },
          },
        }),
      },
    );
    assert.equal(result, true);
  });

  it('returns false on userErrors', async () => {
    const result = await cancelShopifySubscription(
      'test.myshopify.com',
      'gid://123',
      {
        graphqlFn: async () => ({
          data: {
            appSubscriptionCancel: {
              appSubscription: null,
              userErrors: [{ field: 'id', message: 'Not found' }],
            },
          },
        }),
      },
    );
    assert.equal(result, false);
  });

  it('returns false when graphqlFn throws', async () => {
    const result = await cancelShopifySubscription(
      'test.myshopify.com',
      'gid://123',
      { graphqlFn: async () => { throw new Error('api down'); } },
    );
    assert.equal(result, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      cancelShopifySubscription(null as never, null as never),
    );
  });
});
