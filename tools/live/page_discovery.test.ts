/**
 * tools/live/page_discovery.test.ts
 *
 * Tests for page discovery and crawl runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPageType,
  prioritizePage,
  deduplicatePages,
  discoverPages,
  type DiscoveredPage,
} from './page_discovery.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function page(url: string, overrides?: Partial<DiscoveredPage>): DiscoveredPage {
  return {
    url,
    status_code: 200,
    depth: 1,
    page_type: classifyPageType(url),
    priority: 'low',
    ...overrides,
  };
}

// ── classifyPageType ─────────────────────────────────────────────────────────

describe('classifyPageType', () => {
  it('classifies homepage', () => {
    assert.equal(classifyPageType('https://example.com/'), 'homepage');
  });

  it('classifies product', () => {
    assert.equal(classifyPageType('https://example.com/products/widget'), 'product');
  });

  it('classifies collection', () => {
    assert.equal(classifyPageType('https://example.com/collections/all'), 'collection');
  });

  it('classifies blog', () => {
    assert.equal(classifyPageType('https://example.com/blogs/news/post'), 'blog');
  });

  it('classifies page', () => {
    assert.equal(classifyPageType('https://example.com/pages/about'), 'page');
  });

  it('classifies other for unknown paths', () => {
    assert.equal(classifyPageType('https://example.com/custom-path'), 'other');
  });
});

// ── prioritizePage ───────────────────────────────────────────────────────────

describe('prioritizePage', () => {
  it('homepage is high priority', () => {
    assert.equal(prioritizePage(page('/', { page_type: 'homepage' })), 'high');
  });

  it('product is high priority', () => {
    assert.equal(prioritizePage(page('/products/x', { page_type: 'product' })), 'high');
  });

  it('collection is medium priority', () => {
    assert.equal(prioritizePage(page('/collections/y', { page_type: 'collection' })), 'medium');
  });

  it('blog is medium priority', () => {
    assert.equal(prioritizePage(page('/blogs/z', { page_type: 'blog' })), 'medium');
  });

  it('page is low priority', () => {
    assert.equal(prioritizePage(page('/pages/a', { page_type: 'page' })), 'low');
  });

  it('other is low priority', () => {
    assert.equal(prioritizePage(page('/x', { page_type: 'other' })), 'low');
  });
});

// ── deduplicatePages ─────────────────────────────────────────────────────────

describe('deduplicatePages', () => {
  it('removes duplicate URLs (case-insensitive)', () => {
    const pages = [
      page('https://example.com/products/a'),
      page('https://Example.com/Products/A'),
    ];
    const result = deduplicatePages(pages);
    assert.equal(result.length, 1);
  });

  it('removes cart URLs', () => {
    const pages = [page('https://example.com/cart')];
    assert.equal(deduplicatePages(pages).length, 0);
  });

  it('removes checkout URLs', () => {
    const pages = [page('https://example.com/checkout')];
    assert.equal(deduplicatePages(pages).length, 0);
  });

  it('removes URLs with query strings', () => {
    const pages = [page('https://example.com/products/a?variant=123')];
    assert.equal(deduplicatePages(pages).length, 0);
  });

  it('removes cdn.shopify URLs', () => {
    const pages = [page('https://cdn.shopify.com/s/files/image.jpg')];
    assert.equal(deduplicatePages(pages).length, 0);
  });

  it('keeps valid pages', () => {
    const pages = [page('https://example.com/products/widget')];
    assert.equal(deduplicatePages(pages).length, 1);
  });

  it('handles empty array', () => {
    assert.equal(deduplicatePages([]).length, 0);
  });
});

// ── discoverPages ────────────────────────────────────────────────────────────

describe('discoverPages', () => {
  it('returns CrawlResult with pages', async () => {
    const result = await discoverPages('site_1', 'example.com', 50);
    assert.ok(result.pages.length > 0);
    assert.equal(result.site_id, 'site_1');
    assert.equal(result.domain, 'example.com');
  });

  it('respects max_pages limit', async () => {
    const result = await discoverPages('site_1', 'example.com', 3);
    assert.ok(result.pages.length <= 3);
  });

  it('sets crawl_duration_ms', async () => {
    const result = await discoverPages('site_1', 'example.com', 5);
    assert.ok(typeof result.crawl_duration_ms === 'number');
    assert.ok(result.crawl_duration_ms >= 0);
  });

  it('sets crawled_at', async () => {
    const result = await discoverPages('site_1', 'example.com', 5);
    assert.ok(result.crawled_at.includes('T'));
  });

  it('uses injected fetchSitemap', async () => {
    const result = await discoverPages('site_1', 'example.com', 50, {
      fetchSitemap: async () => [
        'https://example.com/',
        'https://example.com/products/custom',
      ],
    });
    assert.equal(result.pages.length, 2);
  });

  it('uses injected fetchPage for status and size', async () => {
    const result = await discoverPages('site_1', 'example.com', 50, {
      fetchSitemap: async () => ['https://example.com/'],
      fetchPage: async () => ({ status: 200, html: '<html>hello</html>' }),
    });
    assert.equal(result.pages[0].status_code, 200);
    assert.equal(result.pages[0].html_size_bytes, 18);
  });

  it('sets total_discovered', async () => {
    const result = await discoverPages('site_1', 'example.com', 50);
    assert.equal(result.total_discovered, result.pages.length);
  });

  it('classifies page types correctly', async () => {
    const result = await discoverPages('site_1', 'example.com', 50);
    const types = result.pages.map((p) => p.page_type);
    assert.ok(types.includes('homepage'));
    assert.ok(types.includes('product'));
  });
});
