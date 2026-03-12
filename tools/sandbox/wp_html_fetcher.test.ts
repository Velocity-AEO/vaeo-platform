/**
 * tools/sandbox/wp_html_fetcher.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCacheBypassUrl,
  buildWPFetchHeaders,
  fetchWPPageHTML,
  fetchWPPageHTMLBefore,
  fetchWPPageHTMLAfter,
  type WPHTMLFetchConfig,
} from './wp_html_fetcher.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function config(overrides?: Partial<WPHTMLFetchConfig>): WPHTMLFetchConfig {
  return {
    wp_url:       'https://wp.example.com',
    username:     'admin',
    app_password: 'secret',
    timeout_ms:   5_000,
    bypass_cache: false,
    ...overrides,
  };
}

function successFetch(html = '<html><head><title>Test</title></head></html>') {
  return async (_url: string, _opts?: RequestInit): Promise<Response> =>
    ({
      ok:     true,
      status: 200,
      text:   async () => html,
    }) as Response;
}

function errorFetch(msg = 'network error') {
  return async (): Promise<Response> => { throw new Error(msg); };
}

function statusFetch(status: number) {
  return async (): Promise<Response> =>
    ({
      ok:     status >= 200 && status < 300,
      status,
      text:   async () => '',
    }) as Response;
}

// ── buildCacheBypassUrl ───────────────────────────────────────────────────────

describe('buildCacheBypassUrl', () => {
  it('appends vaeo_nocache param', () => {
    const url = buildCacheBypassUrl('https://x.com/page');
    assert.ok(url.includes('vaeo_nocache='));
  });

  it('includes a numeric timestamp', () => {
    const url = buildCacheBypassUrl('https://x.com/');
    const match = url.match(/vaeo_nocache=(\d+)/);
    assert.ok(match && Number(match[1]) > 0);
  });

  it('uses ? when no existing query string', () => {
    const url = buildCacheBypassUrl('https://x.com/page');
    assert.ok(url.includes('?vaeo_nocache='));
  });

  it('uses & when query string already present', () => {
    const url = buildCacheBypassUrl('https://x.com/page?foo=bar');
    assert.ok(url.includes('&vaeo_nocache='));
  });

  it('never throws on empty string', () => {
    assert.doesNotThrow(() => buildCacheBypassUrl(''));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildCacheBypassUrl(null as never));
  });
});

// ── buildWPFetchHeaders ───────────────────────────────────────────────────────

describe('buildWPFetchHeaders', () => {
  it('includes Authorization header', () => {
    const headers = buildWPFetchHeaders('admin', 'pass', false);
    assert.ok(headers['Authorization']?.startsWith('Basic '));
  });

  it('Authorization is base64 encoded', () => {
    const headers = buildWPFetchHeaders('admin', 'pass', false);
    const b64 = headers['Authorization']!.replace('Basic ', '');
    assert.equal(Buffer.from(b64, 'base64').toString(), 'admin:pass');
  });

  it('includes Cache-Control when bypass_cache=true', () => {
    const headers = buildWPFetchHeaders('u', 'p', true);
    assert.equal(headers['Cache-Control'], 'no-cache');
  });

  it('includes Pragma when bypass_cache=true', () => {
    const headers = buildWPFetchHeaders('u', 'p', true);
    assert.equal(headers['Pragma'], 'no-cache');
  });

  it('omits Cache-Control when bypass_cache=false', () => {
    const headers = buildWPFetchHeaders('u', 'p', false);
    assert.equal(headers['Cache-Control'], undefined);
  });

  it('omits Pragma when bypass_cache=false', () => {
    const headers = buildWPFetchHeaders('u', 'p', false);
    assert.equal(headers['Pragma'], undefined);
  });

  it('never throws on empty strings', () => {
    assert.doesNotThrow(() => buildWPFetchHeaders('', '', false));
  });
});

// ── fetchWPPageHTML ───────────────────────────────────────────────────────────

describe('fetchWPPageHTML', () => {
  it('calls fetchFn with provided URL', async () => {
    const called: string[] = [];
    await fetchWPPageHTML('https://x.com/page', config(), {
      fetchFn: async (url) => { called.push(url as string); return { ok: true, status: 200, text: async () => '' } as Response; },
    });
    assert.ok(called.some((u) => u.includes('x.com/page')));
  });

  it('returns success=true on 200', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config(), { fetchFn: successFetch() });
    assert.equal(result.success, true);
  });

  it('returns html content', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config(), { fetchFn: successFetch('<html>hi</html>') });
    assert.ok(result.html.includes('hi'));
  });

  it('returns status_code', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config(), { fetchFn: successFetch() });
    assert.equal(result.status_code, 200);
  });

  it('returns success=false when fetchFn throws (both attempts)', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config(), { fetchFn: errorFetch('boom') });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('boom'));
  });

  it('returns success=false on non-OK status', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config(), { fetchFn: statusFetch(500) });
    assert.equal(result.success, false);
  });

  it('has fetched_at ISO timestamp', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config(), { fetchFn: successFetch() });
    assert.ok(result.fetched_at.includes('T'));
  });

  it('sets cache_bypassed from config', async () => {
    const result = await fetchWPPageHTML('https://x.com/', config({ bypass_cache: true }), { fetchFn: successFetch() });
    assert.equal(result.cache_bypassed, true);
  });

  it('never throws when fetchFn always throws', async () => {
    await assert.doesNotReject(() =>
      fetchWPPageHTML('https://x.com/', config(), { fetchFn: errorFetch() }),
    );
  });
});

// ── fetchWPPageHTMLBefore ─────────────────────────────────────────────────────

describe('fetchWPPageHTMLBefore', () => {
  it('always sets cache_bypassed=true', async () => {
    const result = await fetchWPPageHTMLBefore('https://x.com/', config({ bypass_cache: false }), { fetchFn: successFetch() });
    assert.equal(result.cache_bypassed, true);
  });

  it('returns success=false on error', async () => {
    const result = await fetchWPPageHTMLBefore('https://x.com/', config(), { fetchFn: errorFetch() });
    assert.equal(result.success, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      fetchWPPageHTMLBefore('https://x.com/', config(), { fetchFn: errorFetch() }),
    );
  });
});

const noSleep = async (_ms: number) => {};

// ── fetchWPPageHTMLAfter ──────────────────────────────────────────────────────

describe('fetchWPPageHTMLAfter', () => {
  it('returns success=false on error', async () => {
    const result = await fetchWPPageHTMLAfter('https://x.com/', config(), { fetchFn: errorFetch(), sleepFn: noSleep });
    assert.equal(result.success, false);
  });

  it('always sets cache_bypassed=true', async () => {
    const result = await fetchWPPageHTMLAfter('https://x.com/', config({ bypass_cache: false }), { fetchFn: successFetch(), sleepFn: noSleep });
    assert.equal(result.cache_bypassed, true);
  });

  it('returns success=true on happy path', async () => {
    const result = await fetchWPPageHTMLAfter('https://x.com/', config(), { fetchFn: successFetch(), sleepFn: noSleep });
    assert.equal(result.success, true);
  });

  it('never throws when fetchFn throws', async () => {
    await assert.doesNotReject(() =>
      fetchWPPageHTMLAfter('https://x.com/', config(), { fetchFn: errorFetch(), sleepFn: noSleep }),
    );
  });
});
