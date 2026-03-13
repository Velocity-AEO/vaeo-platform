/**
 * tools/shopify/shopify_webhook_handler.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeShopifyWebhook } from './shopify_webhook_handler.ts';

// ── routeShopifyWebhook routing ───────────────────────────────────────────────

describe('routeShopifyWebhook — routing', () => {
  it('routes app/uninstalled to handleAppUninstalled', async () => {
    let called = false;
    await routeShopifyWebhook('app/uninstalled', {}, 'test.myshopify.com', {
      handleAppUninstalled: async () => { called = true; },
    });
    assert.equal(called, true);
  });

  it('routes customers/data_request to handleDataRequest', async () => {
    let called = false;
    await routeShopifyWebhook('customers/data_request', {}, 'test.myshopify.com', {
      handleDataRequest: async () => { called = true; },
    });
    assert.equal(called, true);
  });

  it('routes customers/redact to handleCustomerRedact', async () => {
    let called = false;
    await routeShopifyWebhook('customers/redact', {}, 'test.myshopify.com', {
      handleCustomerRedact: async () => { called = true; },
    });
    assert.equal(called, true);
  });

  it('routes shop/redact to handleShopRedact', async () => {
    let called = false;
    await routeShopifyWebhook('shop/redact', {}, 'test.myshopify.com', {
      handleShopRedact: async () => { called = true; },
    });
    assert.equal(called, true);
  });

  it('logs unknown topics without throwing', async () => {
    const logs: string[] = [];
    await routeShopifyWebhook('orders/create', {}, 'test.myshopify.com', {
      logFn: (msg) => logs.push(msg),
    });
    assert.ok(logs.some(l => l.includes('unknown topic')));
  });

  it('passes shop_domain to handler', async () => {
    let receivedDomain = '';
    await routeShopifyWebhook('app/uninstalled', {}, 'myshop.myshopify.com', {
      handleAppUninstalled: async (_b, domain) => { receivedDomain = domain; },
    });
    assert.equal(receivedDomain, 'myshop.myshopify.com');
  });

  it('passes body to handler', async () => {
    let receivedBody: unknown = null;
    const payload = { id: 42, myshopify_domain: 'test.myshopify.com' };
    await routeShopifyWebhook('app/uninstalled', payload, 'test.myshopify.com', {
      handleAppUninstalled: async (b) => { receivedBody = b; },
    });
    assert.deepEqual(receivedBody, payload);
  });
});

// ── handleAppUninstalled behaviour ────────────────────────────────────────────

describe('routeShopifyWebhook — app/uninstalled behaviour', () => {
  it('calls markSiteUninstalled with shop_domain', async () => {
    let markedDomain = '';
    await routeShopifyWebhook('app/uninstalled', {}, 'uninstall.myshopify.com', {
      markSiteUninstalled: async (domain) => { markedDomain = domain; },
    });
    assert.equal(markedDomain, 'uninstall.myshopify.com');
  });

  it('logs preservation of data', async () => {
    const logs: string[] = [];
    await routeShopifyWebhook('app/uninstalled', {}, 'shop.myshopify.com', {
      logFn: (msg) => logs.push(msg),
    });
    assert.ok(logs.some(l => l.includes('SHOPIFY_UNINSTALL') || l.includes('shop=')));
  });

  it('does not call cancelSubscription when not provided', async () => {
    // Should not throw even without cancelSubscription dep
    await assert.doesNotReject(() =>
      routeShopifyWebhook('app/uninstalled', {}, 'shop.myshopify.com', {}),
    );
  });

  it('markSiteUninstalled error is swallowed (non-fatal)', async () => {
    await assert.doesNotReject(() =>
      routeShopifyWebhook('app/uninstalled', {}, 'shop.myshopify.com', {
        markSiteUninstalled: async () => { throw new Error('db down'); },
      }),
    );
  });
});

// ── Never throws ──────────────────────────────────────────────────────────────

describe('routeShopifyWebhook — never throws', () => {
  it('never throws on null topic', async () => {
    await assert.doesNotReject(() =>
      routeShopifyWebhook(null as never, null, null as never),
    );
  });

  it('never throws when all handlers throw', async () => {
    await assert.doesNotReject(() =>
      routeShopifyWebhook('app/uninstalled', {}, 'shop.myshopify.com', {
        handleAppUninstalled: async () => { throw new Error('boom'); },
      }),
    );
  });

  it('never throws on unknown topic with no logFn', async () => {
    await assert.doesNotReject(() =>
      routeShopifyWebhook('products/create', {}, 'shop.myshopify.com'),
    );
  });
});
