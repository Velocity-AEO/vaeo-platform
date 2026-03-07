/**
 * packages/adapters/shopify/src/shopify.test.ts
 *
 * Unit tests for verifyConnection(), applyFix(), revertFix().
 * Uses injected fetch — no real network calls.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyConnection,
  applyFix,
  revertFix,
  _injectFetch,
  _resetInjections,
} from './index.js';

// ── Mock fetch factory ────────────────────────────────────────────────────────

function makeFetch(status: number, body: unknown, throws?: string) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    if (throws) throw new Error(throws);
    return {
      ok:     status >= 200 && status < 300,
      status,
      json:   async () => body,
      text:   async () => JSON.stringify(body),
    } as unknown as Response;
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREDS = {
  access_token: 'shpat_test_token',
  store_url:    'mystore.myshopify.com',
};

const BASE_FIX: Parameters<typeof applyFix>[0] = {
  action_id:    'action-1',
  access_token: 'shpat_test_token',
  store_url:    'mystore.myshopify.com',
  fix_type:     'meta_title',
  target_url:   'https://mystore.myshopify.com/pages/about',
  before_value: { title: 'Old Title' },
  after_value:  { title: 'New SEO Title' },
  sandbox:      true,
};

const BASE_REVERT: Parameters<typeof revertFix>[0] = {
  action_id:    'action-1',
  access_token: 'shpat_test_token',
  store_url:    'mystore.myshopify.com',
  fix_type:     'meta_title',
  before_value: { title: 'Old Title' },
};

// ── verifyConnection tests ────────────────────────────────────────────────────

describe('verifyConnection', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with store_name on 200 response', async () => {
    _injectFetch(makeFetch(200, { shop: { name: 'My Test Store' } }));

    const result = await verifyConnection(CREDS);

    assert.equal(result.success, true);
    assert.equal(result.store_name, 'My Test Store');
    assert.equal(result.error, undefined);
  });

  it('returns success=false on 401 response', async () => {
    _injectFetch(makeFetch(401, { errors: 'invalid token' }));

    const result = await verifyConnection(CREDS);

    assert.equal(result.success, false);
    assert.equal(result.error, 'invalid_credentials');
  });

  it('returns success=false on 403 response', async () => {
    _injectFetch(makeFetch(403, { errors: 'forbidden' }));

    const result = await verifyConnection(CREDS);

    assert.equal(result.success, false);
    assert.equal(result.error, 'invalid_credentials');
  });

  it('returns success=false without throwing on network error', async () => {
    _injectFetch(makeFetch(0, null, 'ECONNREFUSED'));

    let threw = false;
    let result: Awaited<ReturnType<typeof verifyConnection>> | undefined;
    try {
      result = await verifyConnection(CREDS);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'verifyConnection must not throw');
    assert.ok(result);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('ECONNREFUSED'));
  });

  it('never throws under any condition', async () => {
    _injectFetch(makeFetch(0, null, 'catastrophic network failure'));

    let threw = false;
    try {
      await verifyConnection(CREDS);
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
  });
});

// ── applyFix tests ────────────────────────────────────────────────────────────

describe('applyFix', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with correct action_id', async () => {
    const result = await applyFix(BASE_FIX);

    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_FIX.action_id);
    assert.equal(result.fix_type, BASE_FIX.fix_type);
    assert.equal(result.error, undefined);
  });

  it('sandbox=true is reflected in ShopifyFixResult', async () => {
    const result = await applyFix({ ...BASE_FIX, sandbox: true });
    assert.equal(result.sandbox, true);
  });

  it('sandbox defaults to true when omitted', async () => {
    const { sandbox: _s, ...withoutSandbox } = BASE_FIX;
    const result = await applyFix(withoutSandbox);
    assert.equal(result.sandbox, true);
  });

  it('never throws under any condition', async () => {
    let threw = false;
    try {
      await applyFix(BASE_FIX);
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
  });
});

// ── revertFix tests ───────────────────────────────────────────────────────────

describe('revertFix', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with correct action_id', async () => {
    const result = await revertFix(BASE_REVERT);

    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_REVERT.action_id);
    assert.equal(result.error, undefined);
  });

  it('never throws under any condition', async () => {
    let threw = false;
    try {
      await revertFix(BASE_REVERT);
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
  });
});
