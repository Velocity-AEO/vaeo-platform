/**
 * packages/adapters/wordpress/src/index.test.ts
 *
 * Unit tests for verifyConnection(), applyFix(), revertFix(), detectSeoPlugin().
 * Uses injected fetch — no real network calls.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyConnection,
  applyFix,
  revertFix,
  detectSeoPlugin,
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

function throwingFetch(msg: string) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw new Error(msg);
  };
}

/** Serves responses in order; repeats last entry if exhausted. */
function seqFetch(responses: { status: number; body: unknown }[]) {
  let i = 0;
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return mockResponse(r.status, r.body);
  };
}

/** seqFetch that records (url, method) of each call. */
function recordingFetch(
  responses: { status: number; body: unknown }[],
  calls: { url: string; method: string }[],
) {
  let i = 0;
  return async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, method: init?.method ?? 'GET' });
    const r = responses[Math.min(i++, responses.length - 1)];
    return mockResponse(r.status, r.body);
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREDS = {
  site_url:     'http://wp-test.local',
  username:     'admin',
  app_password: 'xxxx yyyy zzzz',
};

const BASE_FIX: WpFixRequest = {
  action_id:    'wp-action-1',
  site_url:     'http://wp-test.local',
  username:     'admin',
  app_password: 'xxxx yyyy zzzz',
  fix_type:     'meta_title',
  target_url:   'http://wp-test.local/about-us/',
  before_value: {},
  after_value:  { new_title: 'About Us | Test Site' },
};

const BASE_REVERT = {
  action_id:    'wp-action-1',
  site_url:     'http://wp-test.local',
  username:     'admin',
  app_password: 'xxxx yyyy zzzz',
  fix_type:     'meta_title',
  before_value: {
    resource_id:   42,
    resource_type: 'page',
    plugin:        'none',
    field:         'title',
    old_value:     'Old Title',
  },
};

// Import type for test helper
type WpFixRequest = Parameters<typeof applyFix>[0];

// Standard page lookup response
const PAGE_RESPONSE = {
  status: 200,
  body: [{
    id:      42,
    title:   { raw: 'Old Page Title', rendered: 'Old Page Title' },
    meta:    { _yoast_wpseo_title: '', footnotes: '' },
    excerpt: { raw: '' },
    link:    'http://wp-test.local/about-us/',
  }],
};

// ── verifyConnection tests ─────────────────────────────────────────────────────

describe('verifyConnection', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with page_count on 200', async () => {
    _injectFetch(seqFetch([{
      status: 200,
      body:   [{ id: 1 }, { id: 2 }],
    }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, true);
    assert.equal(result.page_count, 2);
    assert.equal(result.site_url, 'http://wp-test.local');
  });

  it('returns success=true with page_count=0 on empty array', async () => {
    _injectFetch(seqFetch([{ status: 200, body: [] }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, true);
    assert.equal(result.page_count, 0);
  });

  it('returns success=false on 401', async () => {
    _injectFetch(seqFetch([{ status: 401, body: { message: 'Unauthorized' } }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, false);
    assert.equal(result.error, 'invalid_credentials');
  });

  it('returns success=false on 403', async () => {
    _injectFetch(seqFetch([{ status: 403, body: { message: 'Forbidden' } }]));
    const result = await verifyConnection(CREDS);
    assert.equal(result.success, false);
    assert.equal(result.error, 'invalid_credentials');
  });

  it('returns success=false without throwing on network error', async () => {
    _injectFetch(throwingFetch('ECONNREFUSED'));
    let threw = false;
    let result: Awaited<ReturnType<typeof verifyConnection>> | undefined;
    try { result = await verifyConnection(CREDS); } catch { threw = true; }
    assert.equal(threw, false);
    assert.ok(result);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('ECONNREFUSED'));
  });

  it('strips trailing slash from site_url', async () => {
    _injectFetch(seqFetch([{ status: 200, body: [] }]));
    const result = await verifyConnection({ ...CREDS, site_url: 'http://wp-test.local/' });
    assert.equal(result.site_url, 'http://wp-test.local');
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('catastrophic failure'));
    let threw = false;
    try { await verifyConnection(CREDS); } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── detectSeoPlugin tests ──────────────────────────────────────────────────────

describe('detectSeoPlugin', () => {
  afterEach(() => _resetInjections());

  it('returns yoast when wordpress-seo plugin is active', async () => {
    _injectFetch(seqFetch([{
      status: 200,
      body:   [
        { plugin: 'wordpress-seo/wp-seo', status: 'active' },
        { plugin: 'redirection/redirection', status: 'inactive' },
      ],
    }]));
    const plugin = await detectSeoPlugin('http://wp-test.local', 'Basic xxx');
    assert.equal(plugin, 'yoast');
  });

  it('returns rank_math when seo-by-rank-math is active', async () => {
    _injectFetch(seqFetch([{
      status: 200,
      body:   [{ plugin: 'seo-by-rank-math/rank-math', status: 'active' }],
    }]));
    const plugin = await detectSeoPlugin('http://wp-test.local', 'Basic xxx');
    assert.equal(plugin, 'rank_math');
  });

  it('returns none when no SEO plugins are active', async () => {
    _injectFetch(seqFetch([{
      status: 200,
      body:   [{ plugin: 'wordpress-seo/wp-seo', status: 'inactive' }],
    }]));
    const plugin = await detectSeoPlugin('http://wp-test.local', 'Basic xxx');
    assert.equal(plugin, 'none');
  });

  it('returns none on 403 (insufficient permissions)', async () => {
    _injectFetch(seqFetch([{ status: 403, body: {} }]));
    const plugin = await detectSeoPlugin('http://wp-test.local', 'Basic xxx');
    assert.equal(plugin, 'none');
  });

  it('returns none on network error', async () => {
    _injectFetch(throwingFetch('ECONNREFUSED'));
    const plugin = await detectSeoPlugin('http://wp-test.local', 'Basic xxx');
    assert.equal(plugin, 'none');
  });
});

// ── applyFix — meta_title (native, no SEO plugin) ─────────────────────────────

describe('applyFix — meta_title (native WP)', () => {
  afterEach(() => _resetInjections());

  it('looks up page, PATCHes native title, returns success=true', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: [] },              // plugins → empty → 'none'
      PAGE_RESPONSE,                           // GET pages?slug=about-us
      { status: 200, body: { id: 42, title: { raw: 'About Us | Test Site' } } }, // PATCH
    ], calls));

    const result = await applyFix(BASE_FIX);
    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_FIX.action_id);
    assert.ok(result.before_value?.['old_value'] === 'Old Page Title');
    assert.equal(result.before_value?.['plugin'], 'none');
    assert.equal(result.before_value?.['field'], 'title');

    const patch = calls.find(c => c.method === 'PATCH');
    assert.ok(patch, 'should have made a PATCH call');
    assert.ok(patch.url.includes('/pages/42'));
  });

  it('derives title from slug when new_title not in after_value', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: [] },
      PAGE_RESPONSE,
      { status: 200, body: { id: 42 } },
    ], calls));

    const result = await applyFix({ ...BASE_FIX, after_value: {} });
    assert.equal(result.success, true);  // derives "About Us" from slug
  });

  it('returns success=false when page not found', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: [] },   // plugins
      { status: 200, body: [] },   // pages → not found
      { status: 200, body: [] },   // posts → not found
    ]));
    const result = await applyFix(BASE_FIX);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('not found'));
  });

  it('returns success=false on non-parseable URL', async () => {
    const result = await applyFix({ ...BASE_FIX, target_url: 'http://wp-test.local/' });
    assert.equal(result.success, false);
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('network down'));
    let threw = false;
    try { await applyFix(BASE_FIX); } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── applyFix — meta_title (Yoast SEO) ────────────────────────────────────────

describe('applyFix — meta_title (Yoast)', () => {
  afterEach(() => _resetInjections());

  it('uses _yoast_wpseo_title meta key when Yoast is active', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: [{ plugin: 'wordpress-seo/wp-seo', status: 'active' }] }, // plugins
      PAGE_RESPONSE,   // GET page by slug
      { status: 200, body: { id: 42 } },  // PATCH
    ], calls));

    const result = await applyFix(BASE_FIX);
    assert.equal(result.success, true);
    assert.equal(result.before_value?.['plugin'], 'yoast');
    assert.equal(result.before_value?.['meta_key'], '_yoast_wpseo_title');
  });

  it('captures existing Yoast meta value as old_value', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: [{ plugin: 'wordpress-seo/wp-seo', status: 'active' }] },
      { status: 200, body: [{ id: 42, title: { raw: 'Old', rendered: 'Old' }, meta: { _yoast_wpseo_title: 'Old Yoast Title' }, excerpt: { raw: '' }, link: '' }] },
      { status: 200, body: { id: 42 } },
    ]));

    const result = await applyFix(BASE_FIX);
    assert.equal(result.success, true);
    assert.equal(result.before_value?.['old_value'], 'Old Yoast Title');
  });
});

// ── applyFix — meta_description ───────────────────────────────────────────────

describe('applyFix — meta_description', () => {
  afterEach(() => _resetInjections());

  it('PATCHes excerpt field natively when no SEO plugin', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: [] },   // plugins → none
      PAGE_RESPONSE,
      { status: 200, body: { id: 42 } },
    ], calls));

    const result = await applyFix({
      ...BASE_FIX,
      fix_type:    'meta_description',
      after_value: { new_description: 'Great pool floats and summer essentials.' },
    });
    assert.equal(result.success, true);
    assert.equal(result.before_value?.['field'], 'excerpt');
  });

  it('uses _yoast_wpseo_metadesc key when Yoast active', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: [{ plugin: 'wordpress-seo/wp-seo', status: 'active' }] },
      PAGE_RESPONSE,
      { status: 200, body: { id: 42 } },
    ]));

    const result = await applyFix({
      ...BASE_FIX,
      fix_type:    'meta_description',
      after_value: { new_description: 'Great pool floats.' },
    });
    assert.equal(result.success, true);
    assert.equal(result.before_value?.['meta_key'], '_yoast_wpseo_metadesc');
  });

  it('returns success=false when new_description is empty', async () => {
    _injectFetch(seqFetch([
      { status: 200, body: [] },   // plugins
      PAGE_RESPONSE,               // page found
    ]));
    const result = await applyFix({
      ...BASE_FIX,
      fix_type:    'meta_description',
      after_value: {},   // no description provided
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('No new value'));
  });

  it('never throws under any condition', async () => {
    _injectFetch(throwingFetch('ECONNRESET'));
    let threw = false;
    try { await applyFix({ ...BASE_FIX, fix_type: 'meta_description' }); } catch { threw = true; }
    assert.equal(threw, false);
  });
});

// ── applyFix — stub fix types ─────────────────────────────────────────────────

describe('applyFix — stub fix types', () => {
  afterEach(() => _resetInjections());

  it('h1 returns success=true without API calls', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([], calls));
    const result = await applyFix({ ...BASE_FIX, fix_type: 'h1' });
    assert.equal(result.success, true);
    assert.equal(calls.length, 0);
  });

  it('schema returns success=true', async () => {
    const result = await applyFix({ ...BASE_FIX, fix_type: 'schema' });
    assert.equal(result.success, true);
  });

  it('redirect returns success=true', async () => {
    const result = await applyFix({ ...BASE_FIX, fix_type: 'redirect' });
    assert.equal(result.success, true);
  });
});

// ── revertFix ─────────────────────────────────────────────────────────────────

describe('revertFix', () => {
  afterEach(() => _resetInjections());

  it('meta_title native — PATCHes title field back to old_value', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { id: 42, title: { raw: 'Old Title' } } },
    ], calls));

    const result = await revertFix(BASE_REVERT);
    assert.equal(result.success, true);
    assert.equal(result.action_id, 'wp-action-1');
    assert.equal(calls[0].method, 'PATCH');
    assert.ok(calls[0].url.includes('/pages/42'));
  });

  it('meta_title Yoast — PATCHes meta key back to old_value', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { id: 42 } },
    ], calls));

    const result = await revertFix({
      ...BASE_REVERT,
      before_value: {
        resource_id:   42,
        resource_type: 'page',
        plugin:        'yoast',
        meta_key:      '_yoast_wpseo_title',
        old_value:     'Old Yoast Title',
      },
    });
    assert.equal(result.success, true);
    assert.ok(calls[0].url.includes('/pages/42'));
  });

  it('returns success=false when resource_id missing', async () => {
    const result = await revertFix({ ...BASE_REVERT, before_value: { old_value: 'x' } });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('resource_id'));
  });

  it('returns success=false when Yoast meta_key missing', async () => {
    const result = await revertFix({
      ...BASE_REVERT,
      before_value: { resource_id: 42, resource_type: 'page', plugin: 'yoast' },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('meta_key'));
  });

  it('meta_description native — PATCHes excerpt back', async () => {
    const calls: { url: string; method: string }[] = [];
    _injectFetch(recordingFetch([{ status: 200, body: { id: 42 } }], calls));

    const result = await revertFix({
      ...BASE_REVERT,
      fix_type:     'meta_description',
      before_value: {
        resource_id:   42,
        resource_type: 'page',
        plugin:        'none',
        field:         'excerpt',
        old_value:     'Old excerpt',
      },
    });
    assert.equal(result.success, true);
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
