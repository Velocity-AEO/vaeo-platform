/**
 * tools/billing/stripe_webhook.test.ts
 *
 * Tests for Stripe webhook processor — signature verification and event handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  verifyWebhookSignature,
  processStripeWebhook,
  type WebhookDeps,
  type WebhookProcessResult,
} from './stripe_webhook.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = 'whsec_test_secret_key_12345';

const PRICE_MAP: Record<string, string> = {
  pro:        'price_pro_123',
  agency:     'price_agency_456',
  enterprise: 'price_ent_789',
};

function sign(body: string, secret: string = SECRET, timestampOverride?: number): string {
  const ts = timestampOverride ?? Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

function makeEvent(type: string, object: Record<string, unknown>): string {
  return JSON.stringify({ type, data: { object } });
}

function makeDeps(updates: Record<string, unknown>[] = []): WebhookDeps {
  return {
    updateTenant: async (_tenantId: string, fields: Record<string, unknown>) => {
      updates.push(fields);
    },
    priceMap: PRICE_MAP,
  };
}

// ── verifyWebhookSignature ───────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
  it('returns true for valid signature', () => {
    const body = '{"test":"data"}';
    const sig = sign(body);
    assert.equal(verifyWebhookSignature(body, sig, SECRET), true);
  });

  it('returns false for wrong signature', () => {
    const body = '{"test":"data"}';
    const sig = sign(body, 'wrong_secret');
    assert.equal(verifyWebhookSignature(body, sig, SECRET), false);
  });

  it('returns false for modified body', () => {
    const body = '{"test":"data"}';
    const sig = sign(body);
    assert.equal(verifyWebhookSignature('{"test":"modified"}', sig, SECRET), false);
  });

  it('returns false for stale timestamp (> 300s)', () => {
    const body = '{"test":"data"}';
    const oldTs = Math.floor(Date.now() / 1000) - 400;
    const sig = sign(body, SECRET, oldTs);
    assert.equal(verifyWebhookSignature(body, sig, SECRET), false);
  });

  it('returns false for empty inputs', () => {
    assert.equal(verifyWebhookSignature('', 't=1,v1=abc', SECRET), false);
    assert.equal(verifyWebhookSignature('body', '', SECRET), false);
    assert.equal(verifyWebhookSignature('body', 't=1,v1=abc', ''), false);
  });

  it('returns false for malformed header', () => {
    assert.equal(verifyWebhookSignature('body', 'garbage', SECRET), false);
  });

  it('returns false for missing timestamp', () => {
    assert.equal(verifyWebhookSignature('body', 'v1=abc123', SECRET), false);
  });
});

// ── processStripeWebhook — subscription events ──────────────────────────────

describe('processStripeWebhook — subscription.created', () => {
  it('activates subscription and sets plan tier', async () => {
    const updates: Record<string, unknown>[] = [];
    const deps = makeDeps(updates);
    const body = makeEvent('customer.subscription.created', {
      id: 'sub_123',
      customer: 'cus_456',
      metadata: { tenant_id: 'tenant-001' },
      items: { data: [{ price: { id: 'price_pro_123' } }] },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, true);
    assert.equal(result.tenant_id, 'tenant-001');
    assert.equal(updates[0].billing_status, 'active');
    assert.equal(updates[0].plan_tier, 'pro');
    assert.equal(updates[0].stripe_subscription_id, 'sub_123');
  });

  it('returns error when no tenant_id in metadata', async () => {
    const deps = makeDeps();
    const body = makeEvent('customer.subscription.created', {
      id: 'sub_123',
      customer: 'cus_456',
      metadata: {},
      items: { data: [] },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, false);
    assert.ok(result.error?.includes('tenant_id'));
  });
});

describe('processStripeWebhook — subscription.updated', () => {
  it('updates billing status and plan tier', async () => {
    const updates: Record<string, unknown>[] = [];
    const deps = makeDeps(updates);
    const body = makeEvent('customer.subscription.updated', {
      id: 'sub_123',
      status: 'active',
      metadata: { tenant_id: 'tenant-001' },
      items: { data: [{ price: { id: 'price_agency_456' } }] },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, true);
    assert.equal(updates[0].billing_status, 'active');
    assert.equal(updates[0].plan_tier, 'agency');
  });
});

describe('processStripeWebhook — subscription.deleted', () => {
  it('sets billing_status to canceled', async () => {
    const updates: Record<string, unknown>[] = [];
    const deps = makeDeps(updates);
    const body = makeEvent('customer.subscription.deleted', {
      id: 'sub_123',
      metadata: { tenant_id: 'tenant-001' },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, true);
    assert.equal(updates[0].billing_status, 'canceled');
  });
});

// ── processStripeWebhook — invoice events ────────────────────────────────────

describe('processStripeWebhook — invoice events', () => {
  it('sets past_due on payment_failed', async () => {
    const updates: Record<string, unknown>[] = [];
    const deps = makeDeps(updates);
    const body = makeEvent('invoice.payment_failed', {
      subscription_details: { metadata: { tenant_id: 'tenant-001' } },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, true);
    assert.equal(updates[0].billing_status, 'past_due');
  });

  it('clears past_due on payment_succeeded', async () => {
    const updates: Record<string, unknown>[] = [];
    const deps = makeDeps(updates);
    const body = makeEvent('invoice.payment_succeeded', {
      subscription_details: { metadata: { tenant_id: 'tenant-001' } },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, true);
    assert.equal(updates[0].billing_status, 'active');
  });
});

// ── processStripeWebhook — checkout.session.completed ────────────────────────

describe('processStripeWebhook — checkout.session.completed', () => {
  it('links customer to tenant', async () => {
    const updates: Record<string, unknown>[] = [];
    const deps = makeDeps(updates);
    const body = makeEvent('checkout.session.completed', {
      customer: 'cus_789',
      metadata: { tenant_id: 'tenant-002' },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, true);
    assert.equal(result.tenant_id, 'tenant-002');
    assert.equal(updates[0].stripe_customer_id, 'cus_789');
  });
});

// ── processStripeWebhook — edge cases ────────────────────────────────────────

describe('processStripeWebhook — edge cases', () => {
  it('returns processed=false for unknown event type', async () => {
    const deps = makeDeps();
    const body = makeEvent('charge.refunded', { id: 'ch_123' });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.equal(result.processed, false);
    assert.equal(result.event_type, 'charge.refunded');
  });

  it('returns error for invalid signature', async () => {
    const deps = makeDeps();
    const result = await processStripeWebhook('body', 'bad_sig', SECRET, deps);
    assert.equal(result.processed, false);
    assert.ok(result.error?.includes('signature'));
  });

  it('returns error for invalid JSON', async () => {
    const body = 'not json';
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, makeDeps());
    assert.equal(result.processed, false);
    assert.ok(result.error);
  });

  it('never throws on db error', async () => {
    const deps: WebhookDeps = {
      updateTenant: async () => { throw new Error('db down'); },
      priceMap: PRICE_MAP,
    };
    const body = makeEvent('customer.subscription.deleted', {
      metadata: { tenant_id: 'tenant-001' },
    });
    const sig = sign(body);
    const result = await processStripeWebhook(body, sig, SECRET, deps);
    assert.ok(result);
    assert.equal(result.processed, false);
    assert.ok(result.error?.includes('db down'));
  });
});
