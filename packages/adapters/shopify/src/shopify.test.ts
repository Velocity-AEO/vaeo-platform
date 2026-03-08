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

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockResponse(status: number, body: unknown): Response {
  return {
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
    text:   async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Returns a fetch fn that throws on every call. */
function throwingFetch(msg: string) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw new Error(msg);
  };
}

/** Returns a fetch fn that serves responses in order (last response repeats). */
function seqFetch(responses: { status: number; body: unknown }[]) {
  let i = 0;
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return mockResponse(r.status, r.body);
  };
}

/** seqFetch that also records (url, method) of each call. */
function recordingFetch(
  responses: { status: number; body: unknown }[],
  calls: { url: string; method: string }[],
) {
  let i = 0;
  return async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, method: (init?.method ?? 'GET') });
    const r = responses[Math.min(i++, responses.length - 1)];
    return mockResponse(r.status, r.body);
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREDS = {
  access_token: 'shpat_test_token',
  store_url:    'mystore.myshopify.com',
};

// Base fix for meta_title on a page URL
const BASE_META_FIX: Parameters<typeof applyFix>[0] = {
  action_id:    'action-1',
  access_token: 'shpat_test_token',
  store_url:    'mystore.myshopify.com',
  fix_type:     'meta_title',
  target_url:   'https://mystore.myshopify.com/pages/about',
  before_value: {},
  after_value:  { new_title: 'About | Test Store' },
  sandbox:      true,
};

// Base fix for h1 (stub — no fetch calls)
const BASE_STUB_FIX: Parameters<typeof applyFix>[0] = {
  ...BASE_META_FIX,
  fix_type: 'h1',
};

const BASE_REVERT: Parameters<typeof revertFix>[0] = {
  action_id:    'action-1',
  access_token: 'shpat_test_token',
  store_url:    'mystore.myshopify.com',
  fix_type:     'meta_title',
  before_value: { metafield_id: 456, old_value: 'Old SEO Title', field: 'title_tag' },
};

// Standard 3-call sequence for meta_title on a page (existing metafield)
function metaTitleSequence() {
  return [
    { status: 200, body: { pages: [{ id: 101, title: 'About' }] } },          // GET page by handle
    { status: 200, body: { metafields: [{ id: 456, value: 'Old SEO Title' }] } }, // GET existing metafield
    { status: 200, body: { metafield: { id: 456, value: 'About | Test Store' } } }, // PUT update
  ];
}

// ── verifyConnection tests ────────────────────────────────────────────────────

describe('verifyConnection', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with store_name on 200 response', async () => {
    _injectFetch(seqFetch([{ status: 200, body: { shop: { name: 'My Test Store' } } }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, true);
    assert.equal(result.store_name, 'My Test Store');
    assert.equal(result.error, undefined);
  });

  it('returns success=false on 401 response', async () => {
    _injectFetch(seqFetch([{ status: 401, body: { errors: 'invalid token' } }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, false);
    assert.equal(result.error, 'invalid_credentials');
  });

  it('returns success=false on 403 response', async () => {
    _injectFetch(seqFetch([{ status: 403, body: { errors: 'forbidden' } }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, false);
    assert.equal(result.error, 'invalid_credentials');
  });

  it('returns success=false without throwing on network error', async () => {
    _injectFetch(throwingFetch('ECONNREFUSED'));
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
    _injectFetch(throwingFetch('catastrophic network failure'));
    let threw = false;
    try {
      await verifyConnection(CREDS);
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
  });
});

// ── applyFix — meta_title ─────────────────────────────────────────────────────

describe('applyFix — meta_title', () => {
  afterEach(() => _resetInjections());

  it('fetches page, updates existing metafield, returns success=true', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch(metaTitleSequence(), calls));

    const result = await applyFix(BASE_META_FIX);

    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_META_FIX.action_id);
    assert.equal(result.fix_type, 'meta_title');
    assert.equal(result.sandbox, true);
    // Should have made 3 calls: GET page, GET metafield, PUT metafield
    assert.equal(calls.length, 3);
    assert.ok(calls[0].url.includes('/pages.json'));
    assert.ok(calls[1].url.includes('/metafields.json'));
    assert.equal(calls[2].method, 'PUT');
  });

  it('creates new metafield via POST when none exists', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { pages: [{ id: 101, title: 'About' }] } },
      { status: 200, body: { metafields: [] } },  // no existing metafield
      { status: 201, body: { metafield: { id: 301, value: 'About | Test Store' } } },
    ], calls));

    const result = await applyFix(BASE_META_FIX);
    assert.equal(result.success, true);
    assert.equal(calls[2].method, 'POST');  // creates, not updates
  });

  it('derives title from URL handle when new_title not in after_value', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: { pages: [{ id: 101, title: 'About' }] } },
      { status: 200, body: { metafields: [] } },
      { status: 201, body: { metafield: { id: 301, value: 'About Us' } } },
    ]));

    // No new_title in after_value — should derive "About Us" from handle "about-us"
    const result = await applyFix({
      ...BASE_META_FIX,
      target_url:  'https://mystore.myshopify.com/pages/about-us',
      after_value: {},
    });
    assert.equal(result.success, true);
  });

  it('returns before_value with metafield_id and old_value', async () => {
    _injectFetch(seqFetch(metaTitleSequence()));
    const result = await applyFix(BASE_META_FIX);
    assert.equal(result.success, true);
    assert.ok(result.before_value);
    assert.equal(result.before_value['metafield_id'], 456);
    assert.equal(result.before_value['old_value'], 'Old SEO Title');
  });

  it('retries once on 429 then succeeds', async () => {
    let callCount = 0;
    _injectFetch(async (url, init) => {
      callCount++;
      // First call (GET page) returns 429; retry should succeed
      if (callCount === 1) return mockResponse(429, {});
      if (callCount === 2) return mockResponse(200, { pages: [{ id: 101, title: 'About' }] });
      if (callCount === 3) return mockResponse(200, { metafields: [{ id: 456, value: 'Old' }] });
      return mockResponse(200, { metafield: { id: 456, value: 'About | Test Store' } });
    });

    const result = await applyFix(BASE_META_FIX);
    assert.equal(result.success, true);
    assert.ok(callCount >= 4, `expected ≥4 calls (got ${callCount})`);
  });

  it('returns success=false when page not found', async () => {
    _injectFetch(seqFetch([{ status: 200, body: { pages: [] } }]));
    const result = await applyFix(BASE_META_FIX);
    assert.equal(result.success, false);
    assert.ok(result.error?.toLowerCase().includes('not found'));
  });

  it('returns success=false on non-routable URL', async () => {
    const result = await applyFix({ ...BASE_META_FIX, target_url: 'https://mystore.myshopify.com/' });
    assert.equal(result.success, false);
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('catastrophic failure'));
    let threw = false;
    try { await applyFix(BASE_META_FIX); } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── applyFix — meta_description ───────────────────────────────────────────────

describe('applyFix — meta_description', () => {
  afterEach(() => _resetInjections());

  it('updates description_tag metafield, returns success=true', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { pages: [{ id: 101, title: 'About' }] } },
      { status: 200, body: { metafields: [{ id: 502, value: 'Old desc' }] } },
      { status: 200, body: { metafield: { id: 502, value: 'Great products at great prices.' } } },
    ], calls));

    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'meta_description',
      after_value: { new_description: 'Great products at great prices.' },
    });
    assert.equal(result.success, true);
    assert.ok(calls[1].url.includes('description_tag'));
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('network down'));
    let threw = false;
    try { await applyFix({ ...BASE_META_FIX, fix_type: 'meta_description' }); } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── applyFix — image_alt ─────────────────────────────────────────────────────

describe('applyFix — image_alt', () => {
  afterEach(() => _resetInjections());

  it('fetches old alt, PUTs new alt, returns success=true', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { image: { id: 2, alt: 'old alt text' } } },  // GET image
      { status: 200, body: { image: { id: 2, alt: 'luxurious pool float' } } }, // PUT
    ], calls));

    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_alt',
      after_value: { product_id: 1, image_id: 2, new_alt: 'luxurious pool float' },
    });
    assert.equal(result.success, true);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[1].method, 'PUT');
    assert.ok(result.before_value?.['old_alt'] === 'old alt text');
  });

  it('returns success=false when product_id is missing', async () => {
    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_alt',
      after_value: { image_id: 2, new_alt: 'alt text' },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('product_id'));
  });

  it('returns success=false when new_alt is missing', async () => {
    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_alt',
      after_value: { product_id: 1, image_id: 2 },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('new_alt'));
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('network error'));
    let threw = false;
    try {
      await applyFix({
        ...BASE_META_FIX,
        fix_type:    'image_alt',
        after_value: { product_id: 1, image_id: 2, new_alt: 'alt' },
      });
    } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── applyFix — image_dimensions ───────────────────────────────────────────────

describe('applyFix — image_dimensions', () => {
  afterEach(() => _resetInjections());

  it('GETs existing dimensions then PUTs new ones, captures before_value', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { image: { id: 99, width: 400, height: 300 } } },  // GET current dims
      { status: 200, body: { image: { id: 99, width: 1280, height: 960 } } }, // PUT new dims
    ], calls));

    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_dimensions',
      after_value: { product_id: '42', image_id: '99', width: 1280, height: 960 },
    });

    assert.equal(result.success, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].url.includes('/products/42/images/99.json'));
    assert.equal(calls[1].method, 'PUT');
    assert.ok(result.before_value?.['old_width'] === 400);
    assert.ok(result.before_value?.['old_height'] === 300);
  });

  it('captures null before_value when image has no prior dimensions', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: { image: { id: 99 } } },                           // no width/height
      { status: 200, body: { image: { id: 99, width: 800, height: 600 } } },  // PUT succeeds
    ]));

    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_dimensions',
      after_value: { product_id: '42', image_id: '99', width: 800, height: 600 },
    });

    assert.equal(result.success, true);
    assert.equal(result.before_value?.['old_width'],  null);
    assert.equal(result.before_value?.['old_height'], null);
  });

  it('returns success=false when product_id is missing', async () => {
    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_dimensions',
      after_value: { image_id: '99', width: 800, height: 600 },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('product_id'));
  });

  it('returns success=false when width is missing', async () => {
    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_dimensions',
      after_value: { product_id: '42', image_id: '99', height: 600 },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('width'));
  });

  it('returns success=false when PUT fails', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: { image: { id: 99, width: 400, height: 300 } } },
      { status: 422, body: { errors: 'Unprocessable Entity' } },
    ]));

    const result = await applyFix({
      ...BASE_META_FIX,
      fix_type:    'image_dimensions',
      after_value: { product_id: '42', image_id: '99', width: 800, height: 600 },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('422'));
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('network error'));
    let threw = false;
    try {
      await applyFix({
        ...BASE_META_FIX,
        fix_type:    'image_dimensions',
        after_value: { product_id: '42', image_id: '99', width: 800, height: 600 },
      });
    } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── revertFix — image_dimensions ──────────────────────────────────────────────

describe('revertFix — image_dimensions', () => {
  afterEach(() => _resetInjections());

  it('PUTs old width/height when before_value has them', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { image: { id: 99, width: 400, height: 300 } } },
    ], calls));

    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'image_dimensions',
      before_value: { product_id: '42', image_id: '99', old_width: 400, old_height: 300 },
    });

    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PUT');
    assert.ok(calls[0].url.includes('/products/42/images/99.json'));
  });

  it('skips gracefully when old_width/old_height are null', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([], calls));

    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'image_dimensions',
      before_value: { product_id: '42', image_id: '99', old_width: null, old_height: null },
    });

    assert.equal(result.success, true);
    assert.equal(calls.length, 0, 'no API calls when no prior dimensions');
  });

  it('returns success=false when product_id missing', async () => {
    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'image_dimensions',
      before_value: { image_id: '99', old_width: 400, old_height: 300 },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('product_id'));
  });

  it('returns success=false when PUT fails', async () => {
    _injectFetch(seqFetch([
      { status: 422, body: { errors: 'bad' } },
    ]));

    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'image_dimensions',
      before_value: { product_id: '42', image_id: '99', old_width: 400, old_height: 300 },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('422'));
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('ECONNRESET'));
    let threw = false;
    try {
      await revertFix({
        ...BASE_REVERT,
        fix_type:     'image_dimensions',
        before_value: { product_id: '42', image_id: '99', old_width: 400, old_height: 300 },
      });
    } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── applyFix — stub fix types ─────────────────────────────────────────────────

describe('applyFix — stub fix types (h1, schema, redirect)', () => {
  afterEach(() => _resetInjections());

  it('h1 returns success=true without making API calls', async () => {
    const result = await applyFix(BASE_STUB_FIX);
    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_STUB_FIX.action_id);
    assert.equal(result.fix_type, 'h1');
  });

  it('schema returns success=true', async () => {
    const result = await applyFix({ ...BASE_STUB_FIX, fix_type: 'schema' });
    assert.equal(result.success, true);
  });

  it('redirect returns success=true', async () => {
    const result = await applyFix({ ...BASE_STUB_FIX, fix_type: 'redirect' });
    assert.equal(result.success, true);
  });

  it('sandbox=true is reflected in result', async () => {
    const result = await applyFix({ ...BASE_STUB_FIX, sandbox: true });
    assert.equal(result.sandbox, true);
  });

  it('sandbox defaults to true when omitted', async () => {
    const { sandbox: _s, ...withoutSandbox } = BASE_STUB_FIX;
    const result = await applyFix(withoutSandbox);
    assert.equal(result.sandbox, true);
  });
});

// ── revertFix ─────────────────────────────────────────────────────────────────

describe('revertFix', () => {
  afterEach(() => _resetInjections());

  it('meta_title — PUTs old value back when old_value is present', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafield: { id: 456, value: 'Old SEO Title' } } },
    ], calls));

    const result = await revertFix(BASE_REVERT);
    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_REVERT.action_id);
    assert.equal(calls[0].method, 'PUT');
    assert.ok(calls[0].url.includes('/metafields/456.json'));
  });

  it('meta_title — DELETEs metafield when old_value is null (did not exist before)', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: {} },
    ], calls));

    const result = await revertFix({
      ...BASE_REVERT,
      before_value: { metafield_id: 456, old_value: null },
    });
    assert.equal(result.success, true);
    assert.equal(calls[0].method, 'DELETE');
  });

  it('meta_title — returns success=false when metafield_id missing', async () => {
    const result = await revertFix({ ...BASE_REVERT, before_value: { old_value: 'Old Title' } });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('metafield_id'));
  });

  it('image_alt — PUTs old alt text back', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { image: { id: 2, alt: 'old alt' } } },
    ], calls));

    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'image_alt',
      before_value: { product_id: 1, image_id: 2, old_alt: 'old alt' },
    });
    assert.equal(result.success, true);
    assert.equal(calls[0].method, 'PUT');
  });

  it('image_alt — returns success=false when product_id missing', async () => {
    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'image_alt',
      before_value: { image_id: 2, old_alt: 'alt' },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('product_id'));
  });

  it('h1 stub returns success=true', async () => {
    const result = await revertFix({ ...BASE_REVERT, fix_type: 'h1' });
    assert.equal(result.success, true);
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('ECONNRESET'));
    let threw = false;
    try { await revertFix(BASE_REVERT); } catch { threw = true; }
    assert.equal(threw, false);
  });
});
