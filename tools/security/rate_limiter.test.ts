/**
 * tools/security/rate_limiter.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRateLimit,
  createInMemoryStore,
  DEFAULT_RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitStore,
} from './rate_limiter.ts';

const CFG: RateLimitConfig = {
  window_ms:    60_000,
  max_requests: 3,
  key_prefix:   'rl:test',
};

// ── DEFAULT_RATE_LIMITS ───────────────────────────────────────────────────────

describe('DEFAULT_RATE_LIMITS', () => {
  it('defines api_general preset', () => {
    assert.ok(DEFAULT_RATE_LIMITS['api_general']);
    assert.equal(DEFAULT_RATE_LIMITS['api_general']!.max_requests, 100);
    assert.equal(DEFAULT_RATE_LIMITS['api_general']!.key_prefix, 'rl:api');
  });

  it('defines api_auth with low limit', () => {
    assert.equal(DEFAULT_RATE_LIMITS['api_auth']!.max_requests, 10);
    assert.equal(DEFAULT_RATE_LIMITS['api_auth']!.key_prefix, 'rl:auth');
  });

  it('defines api_crawl with lowest limit', () => {
    assert.equal(DEFAULT_RATE_LIMITS['api_crawl']!.max_requests, 5);
    assert.equal(DEFAULT_RATE_LIMITS['api_crawl']!.key_prefix, 'rl:crawl');
  });

  it('defines api_export preset', () => {
    assert.equal(DEFAULT_RATE_LIMITS['api_export']!.max_requests, 20);
    assert.equal(DEFAULT_RATE_LIMITS['api_export']!.key_prefix, 'rl:export');
  });
});

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows first request', async () => {
    const store = createInMemoryStore();
    const r     = await checkRateLimit('ip-1', CFG, store);
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 2);
  });

  it('allows requests up to the limit', async () => {
    const store = createInMemoryStore();
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit('ip-2', CFG, store);
      assert.equal(r.allowed, true);
    }
  });

  it('blocks request when limit exceeded', async () => {
    const store = createInMemoryStore();
    for (let i = 0; i < 3; i++) await checkRateLimit('ip-3', CFG, store);
    const r = await checkRateLimit('ip-3', CFG, store);
    assert.equal(r.allowed, false);
    assert.equal(r.remaining, 0);
  });

  it('includes correct key in result', async () => {
    const store = createInMemoryStore();
    const r     = await checkRateLimit('tenant-abc', CFG, store);
    assert.equal(r.key, 'rl:test:tenant-abc');
  });

  it('includes reset_at as ISO datetime', async () => {
    const store = createInMemoryStore();
    const r     = await checkRateLimit('ip-4', CFG, store);
    assert.ok(!isNaN(Date.parse(r.reset_at)));
    assert.ok(Date.parse(r.reset_at) > Date.now());
  });

  it('tracks different identifiers independently', async () => {
    const store = createInMemoryStore();
    for (let i = 0; i < 3; i++) await checkRateLimit('ip-a', CFG, store);
    // ip-a is now blocked; ip-b should still be allowed
    const rb = await checkRateLimit('ip-b', CFG, store);
    assert.equal(rb.allowed, true);
  });

  it('remaining decrements with each request', async () => {
    const store = createInMemoryStore();
    const r1 = await checkRateLimit('ip-5', CFG, store);
    const r2 = await checkRateLimit('ip-5', CFG, store);
    assert.equal(r1.remaining, 2);
    assert.equal(r2.remaining, 1);
  });

  it('fails open when store throws on increment', async () => {
    const badStore: RateLimitStore = {
      get:       async () => null,
      set:       async () => {},
      increment: async () => { throw new Error('store down'); },
    };
    const r = await checkRateLimit('ip-6', CFG, badStore);
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, CFG.max_requests);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => checkRateLimit('x', CFG, null as any));
  });
});

// ── createInMemoryStore ───────────────────────────────────────────────────────

describe('createInMemoryStore', () => {
  it('get returns null for unknown key', async () => {
    const store = createInMemoryStore();
    assert.equal(await store.get('missing'), null);
  });

  it('set then get returns stored value', async () => {
    const store = createInMemoryStore();
    await store.set('k', 42, 60_000);
    assert.equal(await store.get('k'), 42);
  });

  it('increment starts at 1 for new key', async () => {
    const store = createInMemoryStore();
    const n = await store.increment('new-key', 60_000);
    assert.equal(n, 1);
  });

  it('increment accumulates on same key', async () => {
    const store = createInMemoryStore();
    await store.increment('acc', 60_000);
    await store.increment('acc', 60_000);
    const n = await store.increment('acc', 60_000);
    assert.equal(n, 3);
  });

  it('expired entries are treated as missing', async () => {
    const store = createInMemoryStore();
    await store.set('exp-key', 7, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(await store.get('exp-key'), null);
  });

  it('increment resets after expiry', async () => {
    const store = createInMemoryStore();
    await store.increment('short', 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    const n = await store.increment('short', 60_000);
    assert.equal(n, 1); // restarted
  });
});
