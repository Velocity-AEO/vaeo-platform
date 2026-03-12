/**
 * tools/wordpress/cache_bust.test.ts
 *
 * Tests for WordPress cache busting system.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCachePlugins,
  bustCache,
  bustCacheAfterFix,
  type CacheBustConfig,
} from './cache_bust.js';

function makeConfig(overrides: Partial<CacheBustConfig> = {}): CacheBustConfig {
  return {
    site_id: 's1',
    wp_url: 'https://shop.com',
    username: 'admin',
    app_password: 'xxxx',
    cache_plugins: [],
    ...overrides,
  };
}

function mockFetch(ok = true) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok, status: ok ? 200 : 500 };
  };
  return { fn, calls };
}

// ── detectCachePlugins ───────────────────────────────────────────────────────

describe('detectCachePlugins', () => {
  it('identifies wp-rocket', () => {
    const r = detectCachePlugins(['wp-rocket']);
    assert.deepEqual(r, ['wp_rocket']);
  });

  it('identifies w3-total-cache', () => {
    const r = detectCachePlugins(['w3-total-cache']);
    assert.deepEqual(r, ['w3_total_cache']);
  });

  it('identifies wp-super-cache', () => {
    const r = detectCachePlugins(['wp-super-cache']);
    assert.deepEqual(r, ['wp_super_cache']);
  });

  it('identifies litespeed-cache', () => {
    const r = detectCachePlugins(['litespeed-cache']);
    assert.deepEqual(r, ['litespeed']);
  });

  it('returns [] for unknown plugins', () => {
    const r = detectCachePlugins(['woocommerce', 'akismet']);
    assert.deepEqual(r, []);
  });

  it('returns [] for empty input', () => {
    assert.deepEqual(detectCachePlugins([]), []);
  });

  it('detects multiple cache plugins', () => {
    const r = detectCachePlugins(['wp-rocket', 'litespeed-cache']);
    assert.deepEqual(r, ['wp_rocket', 'litespeed']);
  });
});

// ── bustCache ────────────────────────────────────────────────────────────────

describe('bustCache', () => {
  it('calls fetch for wp_rocket endpoint', async () => {
    const { fn, calls } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    const r = await bustCache(config, { fetchFn: fn });
    assert.equal(r.success, true);
    assert.ok(calls[0].url.includes('wp-rocket'));
    assert.equal(calls[0].init?.method, 'POST');
  });

  it('calls fetch for w3_total_cache endpoint', async () => {
    const { fn, calls } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['w3_total_cache'] });
    await bustCache(config, { fetchFn: fn });
    assert.ok(calls[0].url.includes('w3tc'));
  });

  it('calls fetch for wp_super_cache endpoint', async () => {
    const { fn, calls } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['wp_super_cache'] });
    await bustCache(config, { fetchFn: fn });
    assert.ok(calls[0].url.includes('wpsc_delete_all'));
  });

  it('returns success false on fetch error', async () => {
    const fn = async () => { throw new Error('network'); };
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    const r = await bustCache(config, { fetchFn: fn as any });
    assert.equal(r.success, false);
  });

  it('returns success false when all methods fail', async () => {
    const { fn } = mockFetch(false);
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    const r = await bustCache(config, { fetchFn: fn });
    assert.equal(r.success, false);
    assert.equal(r.methods_succeeded.length, 0);
  });

  it('falls back to server_level when no plugins', async () => {
    const { fn, calls } = mockFetch(true);
    const config = makeConfig({ cache_plugins: [] });
    const r = await bustCache(config, { fetchFn: fn });
    assert.equal(r.success, true);
    assert.deepEqual(r.methods_attempted, ['server_level']);
  });

  it('tracks methods_attempted', async () => {
    const { fn } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['wp_rocket', 'litespeed'] });
    const r = await bustCache(config, { fetchFn: fn });
    assert.deepEqual(r.methods_attempted, ['wp_rocket', 'litespeed']);
  });
});

// ── bustCacheAfterFix ────────────────────────────────────────────────────────

describe('bustCacheAfterFix', () => {
  it('warms affected URLs after cache bust', async () => {
    const { fn, calls } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    await bustCacheAfterFix(config, ['https://shop.com/page1', 'https://shop.com/page2'], { fetchFn: fn });
    // 1 cache bust call + 2 warm calls
    assert.equal(calls.length, 3);
    assert.ok(calls[1].url.includes('page1'));
    assert.ok(calls[2].url.includes('page2'));
  });

  it('returns result from bustCache', async () => {
    const { fn } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    const r = await bustCacheAfterFix(config, [], { fetchFn: fn });
    assert.equal(r.success, true);
  });

  it('never throws on warm failure', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount > 1) throw new Error('warm fail');
      return { ok: true, status: 200 };
    };
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    const r = await bustCacheAfterFix(config, ['https://shop.com/p'], { fetchFn: fn as any });
    assert.equal(r.success, true);
  });

  it('handles empty affected_urls', async () => {
    const { fn } = mockFetch(true);
    const config = makeConfig({ cache_plugins: ['wp_rocket'] });
    const r = await bustCacheAfterFix(config, [], { fetchFn: fn });
    assert.equal(r.success, true);
  });
});
