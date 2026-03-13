/**
 * tools/link_graph/sitemap_loader.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSitemap,
  findSitemapDiscrepancies,
  SITEMAP_PATHS,
} from './sitemap_loader.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(responses: Record<string, string>) {
  return async (url: string): Promise<string> => {
    if (url in responses) return responses[url]!;
    throw new Error(`404: ${url}`);
  };
}

const SIMPLE_SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/pages-sitemap.xml</loc></sitemap>
  <sitemap><loc>https://example.com/products-sitemap.xml</loc></sitemap>
</sitemapindex>`;

const PAGES_SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

const PRODUCTS_SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/products/widget</loc></url>
</urlset>`;

// ── loadSitemap ───────────────────────────────────────────────────────────────

describe('loadSitemap', () => {
  it('tries SITEMAP_PATHS in order and returns first success', async () => {
    const tried: string[] = [];
    const result = await loadSitemap('example.com', {
      fetchFn: async (url) => {
        tried.push(url);
        if (url.includes('/sitemap.xml') && !url.includes('_index')) {
          return SIMPLE_SITEMAP;
        }
        throw new Error('not found');
      },
    });
    assert.equal(result.found, true);
    assert.ok(tried.length >= 1);
  });

  it('returns found=false when none found', async () => {
    const result = await loadSitemap('example.com', {
      fetchFn: async () => { throw new Error('not found'); },
    });
    assert.equal(result.found, false);
    assert.equal(result.urls.length, 0);
  });

  it('extracts all loc urls from simple sitemap', async () => {
    const result = await loadSitemap('example.com', {
      fetchFn: mockFetch({ 'https://example.com/sitemap.xml': SIMPLE_SITEMAP }),
    });
    assert.equal(result.found, true);
    assert.ok(result.urls.includes('https://example.com/about'));
    assert.ok(result.urls.includes('https://example.com/contact'));
  });

  it('parses sitemap index and fetches child sitemaps', async () => {
    const result = await loadSitemap('example.com', {
      fetchFn: mockFetch({
        'https://example.com/sitemap.xml':          SITEMAP_INDEX,
        'https://example.com/pages-sitemap.xml':    PAGES_SITEMAP,
        'https://example.com/products-sitemap.xml': PRODUCTS_SITEMAP,
      }),
    });
    assert.equal(result.found, true);
    assert.ok(result.urls.includes('https://example.com/about'));
    assert.ok(result.urls.includes('https://example.com/products/widget'));
  });

  it('sets url_count correctly', async () => {
    const result = await loadSitemap('example.com', {
      fetchFn: mockFetch({ 'https://example.com/sitemap.xml': SIMPLE_SITEMAP }),
    });
    assert.equal(result.url_count, result.urls.length);
  });

  it('sets loaded_at to ISO string', async () => {
    const result = await loadSitemap('example.com', {
      fetchFn: async () => { throw new Error(); },
    });
    assert.ok(result.loaded_at.includes('T'));
  });

  it('never throws on empty domain', async () => {
    await assert.doesNotReject(() => loadSitemap(''));
  });

  it('never throws on null domain', async () => {
    await assert.doesNotReject(() => loadSitemap(null as any));
  });
});

// ── findSitemapDiscrepancies ──────────────────────────────────────────────────

describe('findSitemapDiscrepancies', () => {
  it('finds urls in sitemap but not in crawl', () => {
    const sitemap  = ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'];
    const crawled  = ['https://example.com/a', 'https://example.com/b'];
    const result   = findSitemapDiscrepancies(sitemap, crawled, []);
    assert.deepEqual(result, ['https://example.com/c']);
  });

  it('returns empty when all sitemap urls are crawled', () => {
    const urls   = ['https://example.com/a', 'https://example.com/b'];
    const result = findSitemapDiscrepancies(urls, urls, []);
    assert.deepEqual(result, []);
  });

  it('excludes pagination urls', () => {
    const sitemap = ['https://example.com/blog?page=2'];
    const result  = findSitemapDiscrepancies(sitemap, [], []);
    assert.equal(result.length, 0);
  });

  it('excludes protected routes (/account, /cart, /checkout)', () => {
    const sitemap = [
      'https://example.com/account',
      'https://example.com/cart',
      'https://example.com/checkout',
    ];
    const result = findSitemapDiscrepancies(sitemap, [], []);
    assert.equal(result.length, 0);
  });

  it('excludes user-supplied patterns', () => {
    const sitemap = ['https://example.com/private/doc'];
    const result  = findSitemapDiscrepancies(sitemap, [], ['/private/']);
    assert.equal(result.length, 0);
  });

  it('is case-insensitive for crawled urls', () => {
    const sitemap = ['https://example.com/About'];
    const crawled = ['https://example.com/about'];
    const result  = findSitemapDiscrepancies(sitemap, crawled, []);
    assert.equal(result.length, 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => findSitemapDiscrepancies(null as any, null as any, null as any));
  });
});

// ── SITEMAP_PATHS ─────────────────────────────────────────────────────────────

describe('SITEMAP_PATHS', () => {
  it('contains /sitemap.xml as first entry', () => {
    assert.equal(SITEMAP_PATHS[0], '/sitemap.xml');
  });

  it('contains /wp-sitemap.xml', () => {
    assert.ok(SITEMAP_PATHS.includes('/wp-sitemap.xml'));
  });

  it('is a non-empty array', () => {
    assert.ok(Array.isArray(SITEMAP_PATHS) && SITEMAP_PATHS.length > 0);
  });
});
