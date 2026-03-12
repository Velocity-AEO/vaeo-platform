/**
 * tools/shopify/gdpr_webhooks.test.ts
 *
 * Tests for Shopify GDPR webhook handlers and HMAC verification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  handleCustomersRedact,
  handleShopRedact,
  handleCustomersDataRequest,
  verifyShopifyWebhookHmac,
  type GdprWebhookPayload,
  type GdprDeps,
} from './gdpr_webhooks.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_PAYLOAD: GdprWebhookPayload = {
  shop_id:     12345,
  shop_domain: 'test-store.myshopify.com',
  customer:    { id: 67890, email: 'customer@example.com' },
};

function makeDeps(
  auditEntries: Record<string, unknown>[] = [],
  deletedCount = 0,
): GdprDeps {
  return {
    writeAuditLog: async (entry) => { auditEntries.push(entry); },
    deleteSiteByDomain: async () => deletedCount,
  };
}

function makeHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

// ── handleCustomersRedact ────────────────────────────────────────────────────

describe('handleCustomersRedact', () => {
  it('returns handled=true', async () => {
    const result = await handleCustomersRedact(BASE_PAYLOAD, makeDeps());
    assert.equal(result.handled, true);
    assert.equal(result.webhook_type, 'customers/redact');
  });

  it('returns correct shop_domain', async () => {
    const result = await handleCustomersRedact(BASE_PAYLOAD, makeDeps());
    assert.equal(result.shop_domain, 'test-store.myshopify.com');
  });

  it('logs to audit log', async () => {
    const entries: Record<string, unknown>[] = [];
    await handleCustomersRedact(BASE_PAYLOAD, makeDeps(entries));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, 'gdpr_customers_redact');
    assert.equal(entries[0].resource_type, 'shopify_shop');
    assert.equal(entries[0].resource_id, 'test-store.myshopify.com');
  });

  it('action_taken indicates no PII stored', async () => {
    const result = await handleCustomersRedact(BASE_PAYLOAD, makeDeps());
    assert.ok(result.action_taken.includes('no_pii'));
  });

  it('returns handled=false on audit log error', async () => {
    const deps: GdprDeps = {
      writeAuditLog: async () => { throw new Error('db down'); },
      deleteSiteByDomain: async () => 0,
    };
    const result = await handleCustomersRedact(BASE_PAYLOAD, deps);
    assert.equal(result.handled, false);
    assert.ok(result.error?.includes('db down'));
  });

  it('includes customer_id in audit metadata', async () => {
    const entries: Record<string, unknown>[] = [];
    await handleCustomersRedact(BASE_PAYLOAD, makeDeps(entries));
    const meta = entries[0].metadata as Record<string, unknown>;
    assert.equal(meta.customer_id, 67890);
  });
});

// ── handleShopRedact ─────────────────────────────────────────────────────────

describe('handleShopRedact', () => {
  it('returns handled=true', async () => {
    const result = await handleShopRedact(BASE_PAYLOAD, makeDeps([], 2));
    assert.equal(result.handled, true);
    assert.equal(result.webhook_type, 'shop/redact');
  });

  it('reports deleted site count', async () => {
    const result = await handleShopRedact(BASE_PAYLOAD, makeDeps([], 3));
    assert.equal(result.action_taken, 'deleted_3_sites');
  });

  it('logs to audit log with sites_deleted', async () => {
    const entries: Record<string, unknown>[] = [];
    await handleShopRedact(BASE_PAYLOAD, makeDeps(entries, 1));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, 'gdpr_shop_redact');
    const meta = entries[0].metadata as Record<string, unknown>;
    assert.equal(meta.sites_deleted, 1);
  });

  it('handles zero deleted sites', async () => {
    const result = await handleShopRedact(BASE_PAYLOAD, makeDeps([], 0));
    assert.equal(result.handled, true);
    assert.equal(result.action_taken, 'deleted_0_sites');
  });

  it('returns handled=false on delete error', async () => {
    const deps: GdprDeps = {
      writeAuditLog: async () => {},
      deleteSiteByDomain: async () => { throw new Error('cascade failed'); },
    };
    const result = await handleShopRedact(BASE_PAYLOAD, deps);
    assert.equal(result.handled, false);
    assert.ok(result.error?.includes('cascade failed'));
  });
});

// ── handleCustomersDataRequest ───────────────────────────────────────────────

describe('handleCustomersDataRequest', () => {
  it('returns handled=true', async () => {
    const payload: GdprWebhookPayload = {
      ...BASE_PAYLOAD,
      data_request: { id: 999 },
    };
    const result = await handleCustomersDataRequest(payload, makeDeps());
    assert.equal(result.handled, true);
    assert.equal(result.webhook_type, 'customers/data_request');
  });

  it('logs data_request_id in audit metadata', async () => {
    const entries: Record<string, unknown>[] = [];
    const payload: GdprWebhookPayload = {
      ...BASE_PAYLOAD,
      data_request: { id: 42 },
    };
    await handleCustomersDataRequest(payload, makeDeps(entries));
    const meta = entries[0].metadata as Record<string, unknown>;
    assert.equal(meta.data_request_id, 42);
  });

  it('action_taken indicates no PII stored', async () => {
    const result = await handleCustomersDataRequest(BASE_PAYLOAD, makeDeps());
    assert.ok(result.action_taken.includes('no_pii'));
  });

  it('returns handled=false on error', async () => {
    const deps: GdprDeps = {
      writeAuditLog: async () => { throw new Error('audit fail'); },
      deleteSiteByDomain: async () => 0,
    };
    const result = await handleCustomersDataRequest(BASE_PAYLOAD, deps);
    assert.equal(result.handled, false);
    assert.ok(result.error);
  });
});

// ── verifyShopifyWebhookHmac ─────────────────────────────────────────────────

describe('verifyShopifyWebhookHmac', () => {
  const SECRET = 'shopify_webhook_secret_123';

  it('returns true for valid HMAC', () => {
    const body = '{"shop_id":123}';
    const hmac = makeHmac(body, SECRET);
    assert.equal(verifyShopifyWebhookHmac(body, hmac, SECRET), true);
  });

  it('returns false for wrong secret', () => {
    const body = '{"shop_id":123}';
    const hmac = makeHmac(body, 'wrong_secret');
    assert.equal(verifyShopifyWebhookHmac(body, hmac, SECRET), false);
  });

  it('returns false for modified body', () => {
    const body = '{"shop_id":123}';
    const hmac = makeHmac(body, SECRET);
    assert.equal(verifyShopifyWebhookHmac('{"shop_id":456}', hmac, SECRET), false);
  });

  it('returns false for empty inputs', () => {
    assert.equal(verifyShopifyWebhookHmac('', 'abc', SECRET), false);
    assert.equal(verifyShopifyWebhookHmac('body', '', SECRET), false);
    assert.equal(verifyShopifyWebhookHmac('body', 'abc', ''), false);
  });

  it('returns false for garbage hmac header', () => {
    assert.equal(verifyShopifyWebhookHmac('body', 'not-a-real-hmac!!', SECRET), false);
  });

  it('handles unicode body correctly', () => {
    const body = '{"name":"Ünïcödé"}';
    const hmac = makeHmac(body, SECRET);
    assert.equal(verifyShopifyWebhookHmac(body, hmac, SECRET), true);
  });
});
