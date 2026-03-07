/**
 * packages/crawler/src/crawler.test.ts
 *
 * Unit tests for crawlSite(). All tests use injected dependencies —
 * no network calls, no real crawlee engine, no Supabase connection.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  crawlSite,
  _injectCrawler,
  _injectSupabase,
  _resetInjections,
} from './index.js';
import type { CrawlResult, SupabaseClient as _SC } from './index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function fakeResult(url: string, status_code = 200): CrawlResult {
  return {
    url,
    status_code,
    title:          'Test Page',
    meta_desc:      'A test description',
    h1:             ['Main Heading'],
    h2:             ['Sub Heading'],
    images:         [{ src: '/img/test.jpg', alt: 'Test', width: 800, height: 600 }],
    internal_links: ['https://example.com/page2'],
    schema_blocks:  ['{"@type":"WebPage"}'],
    canonical:      'https://example.com/',
    redirect_chain: [],
    load_time_ms:   42,
  };
}

const BASE: Parameters<typeof crawlSite>[0] = {
  run_id:    'test-run-1',
  tenant_id: 'tenant-abc',
  site_id:   'site-xyz',
  site_url:  'https://example.com',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('crawlSite', () => {
  afterEach(() => _resetInjections());

  it('returns status=completed with results array', async () => {
    _injectCrawler(async () => [fakeResult('https://example.com/')]);
    _injectSupabase(null);

    const result = await crawlSite(BASE);

    assert.equal(result.status, 'completed');
    assert.equal(result.urls_crawled, 1);
    assert.ok(Array.isArray(result.results));
    assert.equal(result.results.length, 1);
    assert.equal(result.run_id, BASE.run_id);
    assert.equal(result.site_id, BASE.site_id);
  });

  it('returns urls_crawled=3 when crawler returns 3 URLs', async () => {
    _injectCrawler(async () => [
      fakeResult('https://example.com/'),
      fakeResult('https://example.com/page2'),
      fakeResult('https://example.com/page3'),
    ]);
    _injectSupabase(null);

    const result = await crawlSite(BASE);

    assert.equal(result.urls_crawled, 3);
    assert.equal(result.results.length, 3);
    assert.equal(result.status, 'completed');
  });

  it('Supabase write failure does not throw — returns results', async () => {
    _injectCrawler(async () => [fakeResult('https://example.com/')]);
    // Inject a client whose insert always throws
    _injectSupabase({
      from: () => ({
        insert: () => { throw new Error('DB connection refused'); },
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient);

    let threw = false;
    let result: Awaited<ReturnType<typeof crawlSite>> | undefined;
    try {
      result = await crawlSite(BASE);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'crawlSite must not throw when Supabase fails');
    assert.ok(result);
    assert.ok(Array.isArray(result.results));
    assert.equal(result.urls_crawled, 1);
  });

  it('invalid site_url returns status=failed without throwing', async () => {
    _injectSupabase(null);

    let threw = false;
    let result: Awaited<ReturnType<typeof crawlSite>> | undefined;
    try {
      result = await crawlSite({ ...BASE, site_url: 'not-a-valid-url' });
    } catch {
      threw = true;
    }

    assert.equal(threw, false);
    assert.ok(result);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Invalid site_url'));
    assert.equal(result.urls_crawled, 0);
    assert.deepEqual(result.results, []);
  });

  it('results array contains correct CrawlResult shape', async () => {
    _injectCrawler(async () => [fakeResult('https://example.com/')]);
    _injectSupabase(null);

    const result = await crawlSite(BASE);
    const r = result.results[0];

    assert.ok(r, 'results[0] must exist');
    assert.equal(typeof r.url, 'string');
    assert.equal(typeof r.status_code, 'number');
    assert.ok(r.title === null || typeof r.title === 'string');
    assert.ok(r.meta_desc === null || typeof r.meta_desc === 'string');
    assert.ok(Array.isArray(r.h1));
    assert.ok(Array.isArray(r.h2));
    assert.ok(Array.isArray(r.images));
    assert.ok(Array.isArray(r.internal_links));
    assert.ok(Array.isArray(r.schema_blocks));
    assert.ok(Array.isArray(r.redirect_chain));
    assert.equal(typeof r.load_time_ms, 'number');
    // Image shape
    const img = r.images[0];
    assert.ok(img);
    assert.equal(typeof img.src, 'string');
    assert.ok(img.alt === null || typeof img.alt === 'string');
    assert.ok(img.width === null || typeof img.width === 'number');
    assert.ok(img.height === null || typeof img.height === 'number');
  });

  it('never throws under any condition', async () => {
    // Inject a crawler that throws
    _injectCrawler(async () => { throw new Error('Crawler engine exploded'); });
    _injectSupabase(null);

    let threw = false;
    try {
      await crawlSite(BASE);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'crawlSite must never throw');
  });
});
