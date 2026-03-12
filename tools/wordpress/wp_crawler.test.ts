/**
 * tools/wordpress/wp_crawler.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crawlWPSite, summarizeCrawl } from './wp_crawler.ts';
import type { WPCrawlResult, WPPage } from './wp_crawler.ts';
import type { WPConnectionConfig } from './wp_connection.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_CONFIG: WPConnectionConfig = {
  site_id:      'wp-crawl-1',
  domain:       'mystore.com',
  wp_url:       'https://mystore.com',
  username:     'admin',
  app_password: 'pass 1234',
  platform:     'wordpress',
};

function makeRawPage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id:      1,
    status:  'publish',
    link:    'https://mystore.com/about',
    title:   { rendered: 'About Us' },
    content: { rendered: '<p>Hello world</p>' },
    excerpt: { rendered: '<p>Short excerpt</p>' },
    ...overrides,
  };
}

function makeRawProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id:      99,
    status:  'publish',
    link:    'https://mystore.com/product/widget',
    title:   { rendered: 'Widget' },
    content: { rendered: '<p>A great widget with <img src="x.jpg"> image</p>' },
    excerpt: { rendered: '' },
    ...overrides,
  };
}

/** Creates a fetch fn that sequences through responses */
function makeSeqFetch(
  responses: Array<{ status: number; body: unknown; ok?: boolean }>,
) {
  let i = 0;
  return async (_url: string, _opts: RequestInit): Promise<Response> => {
    const r  = responses[i] ?? responses[responses.length - 1]!;
    i++;
    const ok = r.ok ?? (r.status >= 200 && r.status < 300);
    return {
      ok,
      status:     r.status,
      statusText: ok ? 'OK' : 'Error',
      json:       async () => r.body,
    } as unknown as Response;
  };
}

// ── crawlWPSite ───────────────────────────────────────────────────────────────

describe('crawlWPSite', () => {
  it('returns WPCrawlResult shape', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage()] },  // pages
      { status: 200, body: [] },               // posts
      { status: 404, body: {}, ok: false },    // products (no WC)
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.site_id, 'wp-crawl-1');
    assert.equal(r.domain, 'mystore.com');
    assert.ok(typeof r.crawled_at === 'string');
    assert.ok(Array.isArray(r.pages));
    assert.ok(Array.isArray(r.errors));
  });

  it('maps page post_type correctly', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage({ id: 1 })] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.post_type, 'page');
  });

  it('maps post post_type correctly', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [] },
      { status: 200, body: [makeRawPage({ id: 2 })] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.post_type, 'post');
  });

  it('counts WooCommerce products', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [] },
      { status: 200, body: [] },
      { status: 200, body: [makeRawProduct(), makeRawProduct({ id: 100 })] },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.woocommerce_products, 2);
  });

  it('product pages have post_type=product', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [] },
      { status: 200, body: [] },
      { status: 200, body: [makeRawProduct()] },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.post_type, 'product');
  });

  it('total_pages = pages.length', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage({ id: 1 }), makeRawPage({ id: 2 })] },
      { status: 200, body: [makeRawPage({ id: 3 })] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.total_pages, r.pages.length);
    assert.equal(r.total_pages, 3);
  });

  it('detects JSON-LD schema in content', async () => {
    const withSchema = makeRawPage({
      content: { rendered: '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' },
    });
    const fetchFn = makeSeqFetch([
      { status: 200, body: [withSchema] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.has_schema, true);
  });

  it('has_schema=false when no JSON-LD in content', async () => {
    const noSchema = makeRawPage({ content: { rendered: '<p>plain text</p>' } });
    const fetchFn = makeSeqFetch([
      { status: 200, body: [noSchema] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.has_schema, false);
  });

  it('counts images in content', async () => {
    const withImages = makeRawPage({
      content: { rendered: '<img src="a.jpg"> text <img src="b.jpg"> more' },
    });
    const fetchFn = makeSeqFetch([
      { status: 200, body: [withImages] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.image_count, 2);
  });

  it('word_count > 0 when content has text', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage()] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.ok(r.pages[0]!.word_count > 0);
  });

  it('meta_description undefined when no yoast data', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage()] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.meta_description, undefined);
  });

  it('extracts meta_description from yoast_head_json', async () => {
    const withYoast = makeRawPage({
      yoast_head_json: { description: 'SEO description here' },
    });
    const fetchFn = makeSeqFetch([
      { status: 200, body: [withYoast] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.meta_description, 'SEO description here');
  });

  it('adds error when pages endpoint fails', async () => {
    const fetchFn = makeSeqFetch([
      { status: 500, body: {}, ok: false },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.ok(r.errors.some(e => e.includes('pages') && e.includes('500')));
  });

  it('adds error when posts endpoint fails', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [] },
      { status: 401, body: {}, ok: false },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.ok(r.errors.some(e => e.includes('posts') && e.includes('401')));
  });

  it('does NOT add error when products endpoint 404 (no WC)', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    // WC 404 is expected — should not appear in errors
    assert.equal(r.errors.length, 0);
    assert.equal(r.woocommerce_products, 0);
  });

  it('strips HTML tags from title', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage({ title: { rendered: '<em>Bold</em> Title' } })] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.ok(!r.pages[0]?.title.includes('<'));
    assert.ok(r.pages[0]?.title.includes('Bold'));
  });

  it('preserves link as url', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [makeRawPage({ link: 'https://mystore.com/custom-page' })] },
      { status: 200, body: [] },
      { status: 404, body: {}, ok: false },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.equal(r.pages[0]?.url, 'https://mystore.com/custom-page');
  });

  it('handles fetch throwing (network error)', async () => {
    const fetchFn = async () => { throw new Error('connection refused'); };
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn: fetchFn as never });
    assert.equal(r.total_pages, 0);
    assert.ok(r.errors.length > 0);
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() => crawlWPSite(null as never));
  });

  it('returns empty pages array when all endpoints return []', async () => {
    const fetchFn = makeSeqFetch([
      { status: 200, body: [] },
      { status: 200, body: [] },
      { status: 200, body: [] },
    ]);
    const r = await crawlWPSite(BASE_CONFIG, { fetchFn });
    assert.deepEqual(r.pages, []);
    assert.equal(r.total_pages, 0);
  });
});

// ── summarizeCrawl ────────────────────────────────────────────────────────────

describe('summarizeCrawl', () => {
  function makeMockResult(overrides: Partial<WPCrawlResult> = {}): WPCrawlResult {
    const pages: WPPage[] = [
      { url: 'https://mystore.com/', post_id: 1, post_type: 'page', title: 'Home', has_schema: true,  image_count: 2, word_count: 150, status: 'publish' },
      { url: 'https://mystore.com/about', post_id: 2, post_type: 'page', title: 'About', has_schema: false, image_count: 0, word_count: 80, status: 'publish' },
      { url: 'https://mystore.com/product/widget', post_id: 3, post_type: 'product', title: 'Widget', has_schema: false, image_count: 1, word_count: 50, status: 'publish' },
    ];
    return {
      site_id:              'wp-1',
      domain:               'mystore.com',
      crawled_at:           '2026-03-12T10:00:00.000Z',
      total_pages:          3,
      pages,
      woocommerce_products: 1,
      errors:               [],
      ...overrides,
    };
  }

  it('includes domain in output', () => {
    const s = summarizeCrawl(makeMockResult());
    assert.ok(s.includes('mystore.com'));
  });

  it('includes total page count', () => {
    const s = summarizeCrawl(makeMockResult());
    assert.ok(s.includes('3'));
  });

  it('includes woocommerce_products count', () => {
    const s = summarizeCrawl(makeMockResult());
    assert.ok(s.includes('WooCommerce products'));
    assert.ok(s.includes('1'));
  });

  it('reports missing meta description count', () => {
    const s = summarizeCrawl(makeMockResult());
    // 3 pages, none have meta_description
    assert.ok(s.includes('Missing meta description'));
    assert.ok(s.includes('3/3'));
  });

  it('reports missing schema count', () => {
    const s = summarizeCrawl(makeMockResult());
    // 2 of 3 pages missing schema
    assert.ok(s.includes('Missing JSON-LD schema'));
    assert.ok(s.includes('2/3'));
  });

  it('includes error list when errors present', () => {
    const s = summarizeCrawl(makeMockResult({ errors: ['posts: HTTP 500'] }));
    assert.ok(s.includes('Errors'));
    assert.ok(s.includes('posts: HTTP 500'));
  });

  it('does not include Errors line when no errors', () => {
    const s = summarizeCrawl(makeMockResult({ errors: [] }));
    assert.ok(!s.includes('Errors (0)'));
  });

  it('includes type breakdown in output', () => {
    const s = summarizeCrawl(makeMockResult());
    assert.ok(s.includes('page') || s.includes('product'));
  });

  it('includes crawl date', () => {
    const s = summarizeCrawl(makeMockResult());
    assert.ok(s.includes('2026-03-12'));
  });
});
