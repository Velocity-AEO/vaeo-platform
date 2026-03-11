/**
 * tools/tracer/sitemap_discovery.test.ts
 *
 * Tests for sitemap auto-discovery.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { discoverURLs, discoverShopifyURLs, type SitemapURL } from './sitemap_discovery.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const URLSET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.com/products/widget</loc><lastmod>2026-01-15</lastmod><priority>0.8</priority><changefreq>weekly</changefreq></url>
  <url><loc>https://shop.com/collections/summer</loc></url>
  <url><loc>https://shop.com/pages/about</loc></url>
</urlset>`;

const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://shop.com/sitemap-products.xml</loc></sitemap>
  <sitemap><loc>https://shop.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;

const PRODUCTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset><url><loc>https://shop.com/products/hat</loc></url></urlset>`;

const PAGES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset><url><loc>https://shop.com/pages/contact</loc></url></urlset>`;

const SYSTEM_URLS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://shop.com/products/good</loc></url>
  <url><loc>https://shop.com/cart</loc></url>
  <url><loc>https://shop.com/account</loc></url>
  <url><loc>https://shop.com/checkout</loc></url>
  <url><loc>https://shop.com/search</loc></url>
</urlset>`;

function mockFetch(responses: Record<string, string>): typeof globalThis.fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = responses[url];
    if (body === undefined) return { ok: false, status: 404, text: async () => '' } as Response;
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as typeof globalThis.fetch;
}

// ── discoverURLs — regular sitemap ───────────────────────────────────────────

describe('discoverURLs — regular sitemap', () => {
  it('extracts URLs from urlset XML', async () => {
    const f = mockFetch({ 'https://shop.com/sitemap.xml': URLSET_XML });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 3);
    assert.equal(result[0]!.url, 'https://shop.com/products/widget');
  });

  it('parses lastmod, priority, changefreq', async () => {
    const f = mockFetch({ 'https://shop.com/sitemap.xml': URLSET_XML });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result[0]!.lastmod, '2026-01-15');
    assert.equal(result[0]!.priority, 0.8);
    assert.equal(result[0]!.changefreq, 'weekly');
  });

  it('omits optional fields when not present', async () => {
    const f = mockFetch({ 'https://shop.com/sitemap.xml': URLSET_XML });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result[1]!.lastmod, undefined);
    assert.equal(result[1]!.priority, undefined);
  });
});

// ── discoverURLs — sitemap index ─────────────────────────────────────────────

describe('discoverURLs — sitemap index', () => {
  it('follows sitemap index and fetches child sitemaps', async () => {
    const f = mockFetch({
      'https://shop.com/sitemap.xml':          INDEX_XML,
      'https://shop.com/sitemap-products.xml': PRODUCTS_XML,
      'https://shop.com/sitemap-pages.xml':    PAGES_XML,
    });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 2);
    assert.ok(result.some((r) => r.url === 'https://shop.com/products/hat'));
    assert.ok(result.some((r) => r.url === 'https://shop.com/pages/contact'));
  });

  it('falls back to sitemap_index.xml when sitemap.xml 404s', async () => {
    const f = mockFetch({
      'https://shop.com/sitemap_index.xml': URLSET_XML,
    });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 3);
  });
});

// ── discoverURLs — filtering ─────────────────────────────────────────────────

describe('discoverURLs — filtering', () => {
  it('filters out system URLs', async () => {
    const f = mockFetch({ 'https://shop.com/sitemap.xml': SYSTEM_URLS_XML });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.url, 'https://shop.com/products/good');
  });

  it('respects maxUrls limit', async () => {
    const f = mockFetch({ 'https://shop.com/sitemap.xml': URLSET_XML });
    const result = await discoverURLs('https://shop.com', { fetch: f, maxUrls: 2 });
    assert.equal(result.length, 2);
  });

  it('deduplicates URLs', async () => {
    const dupeXml = `<urlset>
      <url><loc>https://shop.com/products/a</loc></url>
      <url><loc>https://shop.com/products/a</loc></url>
    </urlset>`;
    const f = mockFetch({ 'https://shop.com/sitemap.xml': dupeXml });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 1);
  });

  it('filters cross-origin URLs', async () => {
    const crossXml = `<urlset>
      <url><loc>https://shop.com/products/local</loc></url>
      <url><loc>https://other.com/products/foreign</loc></url>
    </urlset>`;
    const f = mockFetch({ 'https://shop.com/sitemap.xml': crossXml });
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.url, 'https://shop.com/products/local');
  });
});

// ── discoverURLs — edge cases ────────────────────────────────────────────────

describe('discoverURLs — edge cases', () => {
  it('returns [] for invalid siteUrl', async () => {
    const result = await discoverURLs('not-a-url');
    assert.deepEqual(result, []);
  });

  it('returns [] when fetch fails', async () => {
    const f = (async () => { throw new Error('Network error'); }) as unknown as typeof globalThis.fetch;
    const result = await discoverURLs('https://shop.com', { fetch: f });
    assert.deepEqual(result, []);
  });
});

// ── discoverShopifyURLs ──────────────────────────────────────────────────────

describe('discoverShopifyURLs', () => {
  it('fetches main + products + collections sitemaps', async () => {
    const calls: string[] = [];
    const f = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (url.includes('?sitemap=products')) {
        return { ok: true, status: 200, text: async () => PRODUCTS_XML } as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as Response;
    }) as typeof globalThis.fetch;

    const result = await discoverShopifyURLs('https://shop.com', { fetch: f });
    assert.ok(calls.includes('https://shop.com/sitemap.xml'));
    assert.ok(calls.includes('https://shop.com/sitemap.xml?sitemap=products'));
    assert.ok(calls.includes('https://shop.com/sitemap.xml?sitemap=collections'));
    assert.equal(result.length, 1);
    assert.equal(result[0]!.url, 'https://shop.com/products/hat');
  });

  it('deduplicates across all sitemaps', async () => {
    const f = mockFetch({
      'https://shop.com/sitemap.xml': PRODUCTS_XML,
      'https://shop.com/sitemap.xml?sitemap=products': PRODUCTS_XML,
      'https://shop.com/sitemap.xml?sitemap=collections': '<urlset></urlset>',
    });
    const result = await discoverShopifyURLs('https://shop.com', { fetch: f });
    assert.equal(result.length, 1);
  });
});
