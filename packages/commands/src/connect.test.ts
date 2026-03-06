/**
 * packages/commands/src/connect.test.ts
 *
 * Tests for runConnect and validateRequest.
 * All external deps (Shopify API, WordPress API, Supabase) are injected via _testOps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runConnect,
  validateRequest,
  type ConnectRequest,
  type ConnectOps,
  type SiteRecord,
  type ShopifyCredentials,
  type WordPressCredentials,
} from './connect.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_UUID = '11111111-1111-4111-8111-111111111111';
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shopifyReq(overrides: Partial<ConnectRequest> = {}): ConnectRequest {
  return {
    cms:       'shopify',
    tenant_id: 'tenant-abc',
    site_url:  'mystore.myshopify.com',
    credentials: {
      access_token: 'shpat_test_token',
      store_url:    'mystore.myshopify.com',
    } satisfies ShopifyCredentials,
    ...overrides,
  };
}

function wpReq(overrides: Partial<ConnectRequest> = {}): ConnectRequest {
  return {
    cms:       'wordpress',
    tenant_id: 'tenant-abc',
    site_url:  'https://mysite.com',
    credentials: {
      site_url:     'https://mysite.com',
      username:     'admin',
      app_password: 'xxxx xxxx xxxx xxxx xxxx xxxx',
    } satisfies WordPressCredentials,
    ...overrides,
  };
}

/** Happy-path ops — all succeed, generateId returns FIXED_UUID. */
function happy(overrides: Partial<ConnectOps> = {}): Partial<ConnectOps> {
  return {
    verifyShopify:   async () => ({ ok: true }),
    verifyWordPress: async () => ({ ok: true }),
    upsertSite:      async () => {},
    generateId:      () => FIXED_UUID,
    ...overrides,
  };
}

// ── validateRequest ────────────────────────────────────────────────────────────

describe('validateRequest', () => {
  it('returns valid=true for a complete Shopify request', () => {
    assert.deepEqual(validateRequest(shopifyReq()), { valid: true });
  });

  it('returns valid=true for a complete WordPress request', () => {
    assert.deepEqual(validateRequest(wpReq()), { valid: true });
  });

  it('rejects an unknown cms value', () => {
    const r = validateRequest({ ...shopifyReq(), cms: 'drupal' as 'shopify' });
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('drupal'));
  });

  it('rejects empty tenant_id', () => {
    const r = validateRequest({ ...shopifyReq(), tenant_id: '' });
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('tenant_id'));
  });

  it('rejects whitespace-only tenant_id', () => {
    const r = validateRequest({ ...shopifyReq(), tenant_id: '   ' });
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('tenant_id'));
  });

  it('rejects empty site_url', () => {
    const r = validateRequest({ ...shopifyReq(), site_url: '' });
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('site_url'));
  });

  it('rejects Shopify store_url not ending in .myshopify.com', () => {
    const r = validateRequest(shopifyReq({
      credentials: { access_token: 'shpat_x', store_url: 'mystore.shopify.com' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('.myshopify.com'));
  });

  it('rejects empty Shopify access_token', () => {
    const r = validateRequest(shopifyReq({
      credentials: { access_token: '', store_url: 'mystore.myshopify.com' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('access_token'));
  });

  it('rejects empty Shopify store_url', () => {
    const r = validateRequest(shopifyReq({
      credentials: { access_token: 'shpat_x', store_url: '' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('store_url'));
  });

  it('rejects empty WordPress username', () => {
    const r = validateRequest(wpReq({
      credentials: { site_url: 'https://mysite.com', username: '', app_password: 'pass' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('username'));
  });

  it('rejects empty WordPress app_password', () => {
    const r = validateRequest(wpReq({
      credentials: { site_url: 'https://mysite.com', username: 'admin', app_password: '' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('app_password'));
  });

  it('rejects missing WordPress site_url', () => {
    const r = validateRequest(wpReq({
      credentials: { site_url: '', username: 'admin', app_password: 'pass' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes('site_url'));
  });
});

// ── runConnect — Shopify happy path ───────────────────────────────────────────

describe('runConnect — valid Shopify credentials return success=true with site_id', () => {
  it('returns success=true with FIXED_UUID as site_id', async () => {
    const result = await runConnect(shopifyReq(), happy());
    assert.equal(result.success, true);
    assert.equal(result.site_id, FIXED_UUID);
    assert.equal(result.cms, 'shopify');
    assert.equal(result.tenant_id, 'tenant-abc');
    assert.equal(result.site_url, 'mystore.myshopify.com');
    assert.equal(result.error, undefined);
  });

  it('calls verifyShopify with the credentials from the request', async () => {
    let captured: ShopifyCredentials | null = null;
    await runConnect(shopifyReq(), happy({
      verifyShopify: async (c) => { captured = c; return { ok: true }; },
    }));
    assert.ok(captured);
    assert.equal((captured as ShopifyCredentials).access_token, 'shpat_test_token');
    assert.equal((captured as ShopifyCredentials).store_url, 'mystore.myshopify.com');
  });

  it('calls upsertSite with the correct record fields', async () => {
    let saved: SiteRecord | null = null;
    await runConnect(shopifyReq(), happy({ upsertSite: async (r) => { saved = r; } }));
    assert.ok(saved);
    assert.equal(saved.site_id,   FIXED_UUID);
    assert.equal(saved.tenant_id, 'tenant-abc');
    assert.equal(saved.cms_type,  'shopify');
    assert.equal(saved.site_url,  'mystore.myshopify.com');
    assert.ok(saved.created_at);
    assert.ok(saved.verified_at);
  });

  it('verified_at is an ISO 8601 timestamp', async () => {
    const result = await runConnect(shopifyReq(), happy());
    assert.ok(!isNaN(Date.parse(result.verified_at)));
  });
});

// ── runConnect — WordPress happy path ─────────────────────────────────────────

describe('runConnect — valid WordPress credentials return success=true with site_id', () => {
  it('returns success=true with FIXED_UUID as site_id', async () => {
    const result = await runConnect(wpReq(), happy());
    assert.equal(result.success, true);
    assert.equal(result.site_id, FIXED_UUID);
    assert.equal(result.cms, 'wordpress');
    assert.equal(result.tenant_id, 'tenant-abc');
    assert.equal(result.site_url, 'https://mysite.com');
    assert.equal(result.error, undefined);
  });

  it('calls verifyWordPress with the credentials from the request', async () => {
    let captured: WordPressCredentials | null = null;
    await runConnect(wpReq(), happy({
      verifyWordPress: async (c) => { captured = c; return { ok: true }; },
    }));
    assert.ok(captured);
    assert.equal((captured as WordPressCredentials).username,     'admin');
    assert.equal((captured as WordPressCredentials).site_url,     'https://mysite.com');
    assert.ok((captured as WordPressCredentials).app_password);
  });

  it('calls upsertSite with cms_type=wordpress', async () => {
    let saved: SiteRecord | null = null;
    await runConnect(wpReq(), happy({ upsertSite: async (r) => { saved = r; } }));
    assert.ok(saved);
    assert.equal(saved.cms_type, 'wordpress');
  });
});

// ── runConnect — invalid Shopify URL format ───────────────────────────────────

describe('runConnect — invalid Shopify URL format returns success=false', () => {
  it('returns success=false for a non-.myshopify.com URL', async () => {
    const result = await runConnect(
      shopifyReq({ credentials: { access_token: 'tok', store_url: 'mystore.shopify.com' } }),
      happy(),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('.myshopify.com'));
  });

  it('does not call verifyShopify when URL validation fails', async () => {
    let called = false;
    await runConnect(
      shopifyReq({ credentials: { access_token: 'tok', store_url: 'bad.domain.com' } }),
      happy({ verifyShopify: async () => { called = true; return { ok: true }; } }),
    );
    assert.equal(called, false);
  });

  it('does not call upsertSite when URL validation fails', async () => {
    let called = false;
    await runConnect(
      shopifyReq({ credentials: { access_token: 'tok', store_url: 'bad.domain.com' } }),
      happy({ upsertSite: async () => { called = true; } }),
    );
    assert.equal(called, false);
  });
});

// ── runConnect — adapter verification failure ─────────────────────────────────

describe('runConnect — adapter verification failure returns success=false', () => {
  it('returns success=false when Shopify verify returns ok=false', async () => {
    const result = await runConnect(
      shopifyReq(),
      happy({ verifyShopify: async () => ({ ok: false, error: '401 Unauthorized — bad token' }) }),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('401'));
  });

  it('returns success=false when WordPress verify returns ok=false', async () => {
    const result = await runConnect(
      wpReq(),
      happy({ verifyWordPress: async () => ({ ok: false, error: '403 Forbidden' }) }),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('403'));
  });

  it('does not call upsertSite when verification fails', async () => {
    let called = false;
    await runConnect(
      shopifyReq(),
      happy({
        verifyShopify: async () => ({ ok: false, error: 'bad creds' }),
        upsertSite:    async () => { called = true; },
      }),
    );
    assert.equal(called, false);
  });

  it('returns success=false when verifyShopify throws (network error)', async () => {
    const result = await runConnect(
      shopifyReq(),
      happy({ verifyShopify: async () => { throw new Error('ECONNREFUSED'); } }),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('ECONNREFUSED'));
  });

  it('returns success=false when verifyWordPress throws', async () => {
    const result = await runConnect(
      wpReq(),
      happy({ verifyWordPress: async () => { throw new Error('ETIMEDOUT'); } }),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('ETIMEDOUT'));
  });
});

// ── runConnect — missing required fields ──────────────────────────────────────

describe('runConnect — missing required fields return success=false', () => {
  it('returns success=false when cms is invalid', async () => {
    const result = await runConnect({ ...shopifyReq(), cms: '' as 'shopify' }, happy());
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('returns success=false when tenant_id is empty', async () => {
    const result = await runConnect({ ...shopifyReq(), tenant_id: '' }, happy());
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('tenant_id'));
  });

  it('returns success=false when site_url is empty', async () => {
    const result = await runConnect({ ...shopifyReq(), site_url: '' }, happy());
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('site_url'));
  });

  it('returns success=false when Shopify access_token is empty', async () => {
    const result = await runConnect(
      shopifyReq({ credentials: { access_token: '', store_url: 'mystore.myshopify.com' } }),
      happy(),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('access_token'));
  });

  it('never throws regardless of missing or null fields', async () => {
    await assert.doesNotReject(() =>
      runConnect(
        { cms: '' as 'shopify', tenant_id: '', site_url: '', credentials: null as never },
        happy(),
      ),
    );
  });
});

// ── runConnect — Supabase write failure ───────────────────────────────────────

describe('runConnect — Supabase write failure returns success=false without throwing', () => {
  it('returns success=false when upsertSite throws', async () => {
    const result = await runConnect(
      shopifyReq(),
      happy({ upsertSite: async () => { throw new Error('Supabase connection refused'); } }),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Supabase connection refused'));
  });

  it('does not throw even when upsertSite throws', async () => {
    await assert.doesNotReject(() =>
      runConnect(
        shopifyReq(),
        happy({ upsertSite: async () => { throw new Error('network error'); } }),
      ),
    );
  });

  it('includes site_id in the failure result for retry reference', async () => {
    const result = await runConnect(
      shopifyReq(),
      happy({ upsertSite: async () => { throw new Error('timeout'); } }),
    );
    assert.equal(result.success, false);
    assert.equal(result.site_id, FIXED_UUID);
  });
});

// ── runConnect — site_id is a valid UUID v4 ───────────────────────────────────

describe('runConnect — site_id is a valid UUID v4', () => {
  it('generates a UUID v4 when not injecting generateId', async () => {
    const result = await runConnect(shopifyReq(), {
      verifyShopify:   async () => ({ ok: true }),
      verifyWordPress: async () => ({ ok: true }),
      upsertSite:      async () => {},
      // generateId intentionally omitted → uses real crypto.randomUUID()
    });
    assert.equal(result.success, true);
    assert.match(result.site_id, UUID_V4_RE);
  });

  it('each connect generates a unique site_id', async () => {
    const ops: Partial<ConnectOps> = {
      verifyShopify: async () => ({ ok: true }),
      upsertSite:    async () => {},
      // generateId omitted — real randomUUID()
    };
    const [r1, r2] = await Promise.all([
      runConnect(shopifyReq(), ops),
      runConnect(shopifyReq(), ops),
    ]);
    assert.notEqual(r1.site_id, r2.site_id);
  });
});

// ── runConnect — ActionLog receives connect:verified on success ───────────────

describe('runConnect — ActionLog entries', () => {
  /**
   * Temporarily redirects process.stdout.write to a buffer.
   * Returns the captured JSONL lines after the test function completes.
   */
  async function captureStdout(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);

    // @ts-expect-error — test-only stdout capture
    process.stdout.write = (chunk: unknown): boolean => {
      lines.push(String(chunk));
      return true;
    };

    try {
      await fn();
    } finally {
      process.stdout.write = orig;
    }

    return lines
      .join('')
      .split('\n')
      .filter((l) => l.trim().startsWith('{'))
      .map((l) => JSON.parse(l.trim()) as Record<string, unknown>);
  }

  it('writes connect:verified with status=ok on Shopify success', async () => {
    const entries = await captureStdout(() => runConnect(shopifyReq(), happy()));

    const verified = entries.find((e) => e['stage'] === 'connect:verified');
    assert.ok(verified, 'Expected a connect:verified log entry');
    assert.equal(verified['status'],    'ok');
    assert.equal(verified['command'],   'connect');
    assert.equal(verified['cms'],       'shopify');
    assert.equal(verified['tenant_id'], 'tenant-abc');
    assert.equal(verified['site_id'],   FIXED_UUID);
  });

  it('writes connect:verified with status=ok on WordPress success', async () => {
    const entries = await captureStdout(() => runConnect(wpReq(), happy()));

    const verified = entries.find((e) => e['stage'] === 'connect:verified');
    assert.ok(verified, 'Expected a connect:verified log entry');
    assert.equal(verified['status'], 'ok');
    assert.equal(verified['cms'],    'wordpress');
  });

  it('writes connect:failed with status=failed on validation error', async () => {
    const entries = await captureStdout(() =>
      runConnect({ ...shopifyReq(), tenant_id: '' }, happy()),
    );

    const failed = entries.find((e) => e['stage'] === 'connect:failed');
    assert.ok(failed, 'Expected a connect:failed log entry');
    assert.equal(failed['status'],  'failed');
    assert.equal(failed['command'], 'connect');
    assert.ok(failed['error']);
  });

  it('writes connect:failed with status=failed when verify fails', async () => {
    const entries = await captureStdout(() =>
      runConnect(
        shopifyReq(),
        happy({ verifyShopify: async () => ({ ok: false, error: 'bad token' }) }),
      ),
    );

    const failed = entries.find((e) => e['stage'] === 'connect:failed');
    assert.ok(failed, 'Expected a connect:failed log entry');
    assert.equal(failed['status'], 'failed');
  });

  it('does not write connect:verified when upsertSite fails', async () => {
    const entries = await captureStdout(() =>
      runConnect(
        shopifyReq(),
        happy({ upsertSite: async () => { throw new Error('db error'); } }),
      ),
    );

    const verified = entries.find((e) => e['stage'] === 'connect:verified');
    assert.equal(verified, undefined, 'connect:verified must NOT be written when upsert fails');
  });
});
