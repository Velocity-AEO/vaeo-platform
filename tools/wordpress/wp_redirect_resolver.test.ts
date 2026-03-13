import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRedirectChain,
  resolveAllRedirects,
  deduplicateByFinalUrl,
  MAX_REDIRECT_HOPS,
  RedirectResolveError,
  type RedirectChain,
} from './wp_redirect_resolver.js';

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockFetchRedirect(redirectMap: Record<string, { status: number; location?: string }>) {
  return async (url: string, _opts?: RequestInit): Promise<Response> => {
    const entry = redirectMap[url];
    if (!entry) {
      return { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
    }
    return {
      ok:      entry.status >= 200 && entry.status < 300,
      status:  entry.status,
      headers: { get: (h: string) => h.toLowerCase() === 'location' ? (entry.location ?? null) : null },
    } as unknown as Response;
  };
}

// ── resolveRedirectChain ────────────────────────────────────────────────────

describe('resolveRedirectChain', () => {
  it('follows single redirect', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/old': { status: 301, location: 'https://a.com/new' },
    });
    const result = await resolveRedirectChain('https://a.com/old', undefined, { fetchFn: fetch });
    assert.equal(result.final_url, 'https://a.com/new');
    assert.equal(result.is_redirect, true);
  });

  it('follows chain of redirects', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/1': { status: 301, location: 'https://a.com/2' },
      'https://a.com/2': { status: 302, location: 'https://a.com/3' },
    });
    const result = await resolveRedirectChain('https://a.com/1', undefined, { fetchFn: fetch });
    assert.equal(result.final_url, 'https://a.com/3');
    assert.equal(result.hops, 2);
  });

  it('detects circular redirect', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/a': { status: 301, location: 'https://a.com/b' },
      'https://a.com/b': { status: 301, location: 'https://a.com/a' },
    });
    const result = await resolveRedirectChain('https://a.com/a', undefined, { fetchFn: fetch });
    assert.equal(result.circular_detected, true);
  });

  it('stops at max hops', async () => {
    // Create chain of 12 redirects
    const map: Record<string, { status: number; location: string }> = {};
    for (let i = 0; i < 12; i++) {
      map[`https://a.com/${i}`] = { status: 301, location: `https://a.com/${i + 1}` };
    }
    const fetch = mockFetchRedirect(map);
    const result = await resolveRedirectChain('https://a.com/0', 10, { fetchFn: fetch });
    assert.equal(result.max_hops_exceeded, true);
  });

  it('returns is_redirect=false for non-redirect', async () => {
    const fetch = mockFetchRedirect({});
    const result = await resolveRedirectChain('https://a.com/', undefined, { fetchFn: fetch });
    assert.equal(result.is_redirect, false);
    assert.equal(result.hops, 0);
  });

  it('returns correct hops count', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/1': { status: 301, location: 'https://a.com/2' },
    });
    const result = await resolveRedirectChain('https://a.com/1', undefined, { fetchFn: fetch });
    assert.equal(result.hops, 1);
  });

  it('returns full chain array', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/1': { status: 301, location: 'https://a.com/2' },
      'https://a.com/2': { status: 302, location: 'https://a.com/3' },
    });
    const result = await resolveRedirectChain('https://a.com/1', undefined, { fetchFn: fetch });
    assert.deepEqual(result.chain, ['https://a.com/1', 'https://a.com/2', 'https://a.com/3']);
  });

  it('never throws on fetch error', async () => {
    const fetch = async () => { throw new Error('network down'); };
    await assert.doesNotReject(() => resolveRedirectChain('https://a.com/', undefined, { fetchFn: fetch as any }));
  });

  it('handles 307 redirect', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/old': { status: 307, location: 'https://a.com/new' },
    });
    const result = await resolveRedirectChain('https://a.com/old', undefined, { fetchFn: fetch });
    assert.equal(result.final_url, 'https://a.com/new');
  });

  it('handles 308 redirect', async () => {
    const fetch = mockFetchRedirect({
      'https://a.com/old': { status: 308, location: 'https://a.com/new' },
    });
    const result = await resolveRedirectChain('https://a.com/old', undefined, { fetchFn: fetch });
    assert.equal(result.final_url, 'https://a.com/new');
  });

  it('fetchFn is injectable', async () => {
    let called = false;
    const fetch = async (_url: string) => {
      called = true;
      return { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
    };
    await resolveRedirectChain('https://a.com/', undefined, { fetchFn: fetch });
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => resolveRedirectChain(null as any));
  });
});

// ── resolveAllRedirects ─────────────────────────────────────────────────────

describe('resolveAllRedirects', () => {
  it('resolves in parallel', async () => {
    const results = await resolveAllRedirects(
      ['https://a.com/', 'https://b.com/'],
      { resolveFn: async (url) => ({
        original_url: url, final_url: url, hops: 0, chain: [url],
        is_redirect: false, circular_detected: false, max_hops_exceeded: false,
      }) },
    );
    assert.equal(results.length, 2);
  });

  it('returns all results', async () => {
    const results = await resolveAllRedirects(
      ['https://a.com/'],
      { resolveFn: async (url) => ({
        original_url: url, final_url: url, hops: 0, chain: [url],
        is_redirect: false, circular_detected: false, max_hops_exceeded: false,
      }) },
    );
    assert.equal(results[0].original_url, 'https://a.com/');
  });

  it('handles empty array', async () => {
    const results = await resolveAllRedirects([]);
    assert.deepEqual(results, []);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => resolveAllRedirects(null as any));
  });
});

// ── deduplicateByFinalUrl ───────────────────────────────────────────────────

describe('deduplicateByFinalUrl', () => {
  it('removes duplicate finals', () => {
    const chains: RedirectChain[] = [
      { original_url: 'https://a.com/1', final_url: 'https://a.com/final', hops: 1, chain: [], is_redirect: true, circular_detected: false, max_hops_exceeded: false },
      { original_url: 'https://a.com/2', final_url: 'https://a.com/final', hops: 1, chain: [], is_redirect: true, circular_detected: false, max_hops_exceeded: false },
    ];
    const result = deduplicateByFinalUrl(chains, { logFn: () => {} });
    assert.equal(result.length, 1);
  });

  it('keeps first occurrence', () => {
    const chains: RedirectChain[] = [
      { original_url: 'https://a.com/first', final_url: 'https://a.com/final', hops: 1, chain: [], is_redirect: true, circular_detected: false, max_hops_exceeded: false },
      { original_url: 'https://a.com/second', final_url: 'https://a.com/final', hops: 1, chain: [], is_redirect: true, circular_detected: false, max_hops_exceeded: false },
    ];
    const result = deduplicateByFinalUrl(chains, { logFn: () => {} });
    assert.equal(result[0].original_url, 'https://a.com/first');
  });

  it('logs dedup', () => {
    const logged: string[] = [];
    const chains: RedirectChain[] = [
      { original_url: 'https://a.com/1', final_url: 'https://a.com/final', hops: 1, chain: [], is_redirect: true, circular_detected: false, max_hops_exceeded: false },
      { original_url: 'https://a.com/2', final_url: 'https://a.com/final', hops: 1, chain: [], is_redirect: true, circular_detected: false, max_hops_exceeded: false },
    ];
    deduplicateByFinalUrl(chains, { logFn: (msg) => logged.push(msg) });
    assert.ok(logged.some(m => m.includes('Deduped')));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => deduplicateByFinalUrl(null as any));
  });
});

// ── Constants ───────────────────────────────────────────────────────────────

describe('constants', () => {
  it('MAX_REDIRECT_HOPS equals 10', () => {
    assert.equal(MAX_REDIRECT_HOPS, 10);
  });

  it('RedirectResolveError has correct name', () => {
    const err = new RedirectResolveError('https://a.com/', 'circular', 5);
    assert.equal(err.name, 'RedirectResolveError');
    assert.equal(err.url, 'https://a.com/');
    assert.equal(err.reason, 'circular');
    assert.equal(err.hops, 5);
  });
});
