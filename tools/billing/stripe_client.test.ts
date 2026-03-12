/**
 * tools/billing/stripe_client.test.ts
 *
 * Tests for Stripe client wrapper — mock fetch, no real API calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCheckoutSession,
  getSubscriptionStatus,
  mapStripePlanTier,
  type StripeCheckoutParams,
  type StripeDeps,
} from './stripe_client.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRICE_MAP: Record<string, string> = {
  pro:        'price_pro_123',
  agency:     'price_agency_456',
  enterprise: 'price_ent_789',
};

function makeDeps(response: unknown, ok = true): StripeDeps {
  const mockFetch = async (_url: string | URL | Request, _init?: RequestInit) => ({
    ok,
    status: ok ? 200 : 400,
    json: async () => response,
  }) as Response;

  return { fetch: mockFetch, priceMap: PRICE_MAP };
}

const BASE_PARAMS: StripeCheckoutParams = {
  tenant_id:    'tenant-001',
  tenant_email: 'user@example.com',
  plan_tier:    'pro',
  success_url:  'https://app.com/success',
  cancel_url:   'https://app.com/cancel',
};

// ── createCheckoutSession ────────────────────────────────────────────────────

describe('createCheckoutSession', () => {
  it('returns url and session_id on success', async () => {
    const deps = makeDeps({ url: 'https://checkout.stripe.com/s/123', id: 'cs_123' });
    const result = await createCheckoutSession(BASE_PARAMS, 'sk_test', deps);
    assert.deepStrictEqual(result, { url: 'https://checkout.stripe.com/s/123', session_id: 'cs_123' });
  });

  it('returns null when API returns error', async () => {
    const deps = makeDeps({}, false);
    const result = await createCheckoutSession(BASE_PARAMS, 'sk_test', deps);
    assert.equal(result, null);
  });

  it('returns null when response has no url', async () => {
    const deps = makeDeps({ id: 'cs_123' });
    const result = await createCheckoutSession(BASE_PARAMS, 'sk_test', deps);
    assert.equal(result, null);
  });

  it('returns null when response has no id', async () => {
    const deps = makeDeps({ url: 'https://checkout.stripe.com/s/123' });
    const result = await createCheckoutSession(BASE_PARAMS, 'sk_test', deps);
    assert.equal(result, null);
  });

  it('returns null when price_id not found in map', async () => {
    const deps = makeDeps({ url: 'https://checkout.stripe.com/s/123', id: 'cs_123' });
    const params = { ...BASE_PARAMS, plan_tier: 'pro' as const };
    const emptyDeps = { ...deps, priceMap: {} };
    const result = await createCheckoutSession(params, 'sk_test', emptyDeps);
    assert.equal(result, null);
  });

  it('returns null when fetch throws', async () => {
    const throwDeps: StripeDeps = {
      fetch: async () => { throw new Error('network error'); },
      priceMap: PRICE_MAP,
    };
    const result = await createCheckoutSession(BASE_PARAMS, 'sk_test', throwDeps);
    assert.equal(result, null);
  });

  it('sends correct URL to Stripe API', async () => {
    let capturedUrl = '';
    const deps: StripeDeps = {
      fetch: async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return { ok: true, json: async () => ({ url: 'https://co.stripe.com/1', id: 'cs_1' }) } as Response;
      },
      priceMap: PRICE_MAP,
    };
    await createCheckoutSession(BASE_PARAMS, 'sk_test', deps);
    assert.equal(capturedUrl, 'https://api.stripe.com/v1/checkout/sessions');
  });

  it('sends authorization header', async () => {
    let capturedHeaders: Record<string, string> = {};
    const deps: StripeDeps = {
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers ?? {})
        );
        return { ok: true, json: async () => ({ url: 'https://co.stripe.com/1', id: 'cs_1' }) } as Response;
      },
      priceMap: PRICE_MAP,
    };
    await createCheckoutSession(BASE_PARAMS, 'sk_test_key', deps);
    assert.equal(capturedHeaders['Authorization'], 'Bearer sk_test_key');
  });
});

// ── getSubscriptionStatus ────────────────────────────────────────────────────

describe('getSubscriptionStatus', () => {
  const MOCK_SUB = {
    id: 'sub_123',
    customer: 'cus_456',
    status: 'active',
    current_period_end: 1700000000,
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: 'price_pro_123' } }],
    },
  };

  it('returns subscription status on success', async () => {
    const deps = makeDeps(MOCK_SUB);
    const result = await getSubscriptionStatus('sub_123', 'sk_test', deps);
    assert.ok(result);
    assert.equal(result.subscription_id, 'sub_123');
    assert.equal(result.customer_id, 'cus_456');
    assert.equal(result.status, 'active');
    assert.equal(result.plan_tier, 'pro');
    assert.equal(result.cancel_at_period_end, false);
  });

  it('returns null when API returns error', async () => {
    const deps = makeDeps({}, false);
    const result = await getSubscriptionStatus('sub_123', 'sk_test', deps);
    assert.equal(result, null);
  });

  it('returns null when fetch throws', async () => {
    const throwDeps: StripeDeps = {
      fetch: async () => { throw new Error('timeout'); },
      priceMap: PRICE_MAP,
    };
    const result = await getSubscriptionStatus('sub_123', 'sk_test', throwDeps);
    assert.equal(result, null);
  });

  it('returns null for invalid status', async () => {
    const deps = makeDeps({ ...MOCK_SUB, status: 'unknown_status' });
    const result = await getSubscriptionStatus('sub_123', 'sk_test', deps);
    assert.equal(result, null);
  });

  it('maps plan tier from price ID', async () => {
    const agencySub = {
      ...MOCK_SUB,
      items: { data: [{ price: { id: 'price_agency_456' } }] },
    };
    const deps = makeDeps(agencySub);
    const result = await getSubscriptionStatus('sub_123', 'sk_test', deps);
    assert.ok(result);
    assert.equal(result.plan_tier, 'agency');
  });

  it('defaults to starter when price ID not in map', async () => {
    const unknownSub = {
      ...MOCK_SUB,
      items: { data: [{ price: { id: 'price_unknown' } }] },
    };
    const deps = makeDeps(unknownSub);
    const result = await getSubscriptionStatus('sub_123', 'sk_test', deps);
    assert.ok(result);
    assert.equal(result.plan_tier, 'starter');
  });

  it('converts current_period_end to ISO string', async () => {
    const deps = makeDeps(MOCK_SUB);
    const result = await getSubscriptionStatus('sub_123', 'sk_test', deps);
    assert.ok(result);
    assert.ok(result.current_period_end.includes('T'));
    assert.ok(result.current_period_end.endsWith('Z'));
  });
});

// ── mapStripePlanTier ────────────────────────────────────────────────────────

describe('mapStripePlanTier', () => {
  it('maps pro price ID', () => {
    assert.equal(mapStripePlanTier('price_pro_123', PRICE_MAP), 'pro');
  });

  it('maps agency price ID', () => {
    assert.equal(mapStripePlanTier('price_agency_456', PRICE_MAP), 'agency');
  });

  it('maps enterprise price ID', () => {
    assert.equal(mapStripePlanTier('price_ent_789', PRICE_MAP), 'enterprise');
  });

  it('returns starter for unknown price ID', () => {
    assert.equal(mapStripePlanTier('price_unknown', PRICE_MAP), 'starter');
  });

  it('returns starter for empty price ID', () => {
    assert.equal(mapStripePlanTier('', PRICE_MAP), 'starter');
  });
});
