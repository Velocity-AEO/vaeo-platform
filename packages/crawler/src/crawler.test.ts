/**
 * packages/crawler/src/crawler.test.ts
 *
 * Unit tests for crawlSite() and fetchSitemapUrls().
 * All tests use injected dependencies —
 * no network calls, no real crawlee engine, no Supabase connection.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  crawlSite,
  fetchSitemapUrls,
  _injectCrawler,
  _injectSupabase,
  _injectSitemapFetcher,
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

/** Build a minimal fake fetch that returns given body text with status 200. */
function fakeFetch(responses: Record<string, string | number>): typeof globalThis.fetch {
  return (async (url: string | URL | Request) => {
    const key = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const val = responses[key];
    if (val === undefined || typeof val === 'number') {
      return {
        ok:   false,
        status: typeof val === 'number' ? val : 404,
        text: async () => '',
      } as unknown as Response;
    }
    return {
      ok:   true,
      status: 200,
      text: async () => val,
    } as unknown as Response;
  }) as typeof globalThis.fetch;
}

const URLSET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`;

const SITEMAPINDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-products.xml</loc></sitemap>
</sitemapindex>`;

const PAGES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`;

const PRODUCTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/products/widget</loc></url>
</urlset>`;

// ── crawlSite — existing tests ─────────────────────────────────────────────────

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

  // ── NEW: sitemap seeding ───────────────────────────────────────────────────

  it('seeds startUrls from sitemap when sitemap returns URLs', async () => {
    let capturedStartUrls: string[] = [];
    _injectCrawler(async (opts) => {
      capturedStartUrls = opts.startUrls;
      return opts.startUrls.map(u => fakeResult(u));
    });
    _injectSitemapFetcher(async () => [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/products',
    ]);
    _injectSupabase(null);

    const result = await crawlSite(BASE);

    assert.deepEqual(capturedStartUrls, [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/products',
    ]);
    assert.equal(result.urls_crawled, 3);
  });

  it('falls back to [site_url] when sitemap returns empty array', async () => {
    let capturedStartUrls: string[] = [];
    _injectCrawler(async (opts) => {
      capturedStartUrls = opts.startUrls;
      return [fakeResult(opts.startUrls[0]!)];
    });
    _injectSitemapFetcher(async () => []);
    _injectSupabase(null);

    await crawlSite(BASE);

    assert.deepEqual(capturedStartUrls, ['https://example.com/']);
  });

  it('honors depth field — passes depth as maxDepth to crawler', async () => {
    let capturedDepth: number | undefined;
    _injectCrawler(async (opts) => {
      capturedDepth = opts.maxDepth;
      return [fakeResult('https://example.com/')];
    });
    _injectSitemapFetcher(async () => []);
    _injectSupabase(null);

    await crawlSite({ ...BASE, depth: 7 });

    assert.equal(capturedDepth, 7);
  });
});

// ── fetchSitemapUrls ───────────────────────────────────────────────────────────

describe('fetchSitemapUrls', () => {
  it('returns URLs from a simple <urlset> sitemap', async () => {
    const fetch = fakeFetch({ 'https://example.com/sitemap.xml': URLSET_XML });
    const urls  = await fetchSitemapUrls('https://example.com', fetch);
    assert.deepEqual(urls, [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ]);
  });

  it('follows <sitemapindex> and merges child sitemaps', async () => {
    const fetch = fakeFetch({
      'https://example.com/sitemap.xml':          SITEMAPINDEX_XML,
      'https://example.com/sitemap-pages.xml':    PAGES_XML,
      'https://example.com/sitemap-products.xml': PRODUCTS_XML,
    });
    const urls = await fetchSitemapUrls('https://example.com', fetch);
    assert.deepEqual(urls.sort(), [
      'https://example.com/about',
      'https://example.com/contact',
      'https://example.com/products/widget',
    ].sort());
  });

  it('returns [] when sitemap fetch fails without throwing', async () => {
    const fetch = fakeFetch({ /* no matching URL → 404 */ });
    let threw = false;
    let result: string[] = [];
    try {
      result = await fetchSitemapUrls('https://example.com', fetch);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'fetchSitemapUrls must not throw on failure');
    assert.deepEqual(result, []);
  });

  it('filters out off-domain URLs', async () => {
    const mixedXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://other.com/page2</loc></url>
  <url><loc>https://cdn.example.com/image.jpg</loc></url>
  <url><loc>https://example.com/page3</loc></url>
</urlset>`;
    const fetch = fakeFetch({ 'https://example.com/sitemap.xml': mixedXml });
    const urls  = await fetchSitemapUrls('https://example.com', fetch);
    // Only same-origin URLs should be returned
    assert.ok(urls.every(u => new URL(u).origin === 'https://example.com'));
    assert.equal(urls.length, 2);
    assert.ok(urls.includes('https://example.com/page1'));
    assert.ok(urls.includes('https://example.com/page3'));
  });
});
