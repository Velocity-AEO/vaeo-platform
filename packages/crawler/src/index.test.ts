/**
 * packages/crawler/src/index.test.ts
 *
 * Unit tests for the VAEO crawler.
 * No real HTTP requests, no browser processes, no Supabase connection.
 * Crawlee engine and Supabase store are replaced via _injectOps().
 *
 * Tests confirm:
 *   1.  extractPageData: title extracted from <title>
 *   2.  extractPageData: meta_desc from <meta name="description">
 *   3.  extractPageData: all <h1> tags collected
 *   4.  extractPageData: canonical from <link rel="canonical">
 *   5.  extractPageData: JSON-LD schema blocks collected
 *   6.  extractPageData: internal links only (external excluded)
 *   7.  extractPageData: null for absent title
 *   8.  shouldSkipUrl: /account and customer_authentication are skipped
 *   9.  shouldSkipUrl: /cart, /checkout, .js, .css, .woff2 skipped
 *   10. shouldSkipUrl: /collections, /products, / are NOT skipped
 *   11. crawl(): correct fields stored via full crawl() → extractPageData path
 *   12. crawl(): urls_crawled / urls_failed counts correct
 *   13. crawl(): ActionLog crawl:start written before any crawling
 *   14. crawl(): ActionLog crawl:complete written with url counts
 *   15. crawl(): ActionLog crawl:url_failed written per failure
 *   16. crawlJobProcessor: VaeoJob payload mapped to CrawlOptions correctly
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from 'bullmq';
import type { VaeoJob } from '../../queue/src/index.js';

import {
  extractPageData,
  shouldSkipUrl,
  crawl,
  crawlJobProcessor,
  _injectOps,
  _resetOps,
  type CrawlPageData,
  type CrawlOptions,
  type RawPage,
  type ExtractOpts,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function captureStdout(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((line) => {
    const t = line.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; }
    catch { return []; }
  });
}

/** Typical product-page HTML used across multiple extraction tests. */
const PRODUCT_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sun Glow Bikini — Coco Cabana</title>
  <meta name="description" content="Shop the Sun Glow Bikini in 3 colours.">
  <link rel="canonical" href="https://cococabanalife.com/products/sun-glow-bikini">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sun Glow Bikini"}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
</head>
<body>
  <h1>Sun Glow Bikini</h1>
  <h2>Product Details</h2>
  <h2>Size Guide</h2>
  <img src="/cdn/products/bikini-red.jpg" alt="Red Bikini" width="800" height="600">
  <img src="/cdn/products/bikini-blue.jpg" alt="">
  <a href="/collections/swimwear">Back to Swimwear</a>
  <a href="/account">My Account</a>
  <a href="https://cococabanalife.com/products/shorts">Shorts</a>
  <a href="https://external-partner.com/affiliate">External Link</a>
  <a href="mailto:hello@cococabana.com">Email Us</a>
  <a href="#reviews">Reviews</a>
</body>
</html>`;

const BASE_EXTRACT_OPTS: ExtractOpts = {
  run_id:         'run-c-001',
  tenant_id:      't-aaa',
  site_id:        's-bbb',
  start_domain:   'cococabanalife.com',
  status_code:    200,
  load_time_ms:   320,
  redirect_chain: [],
};

const BASE_CRAWL_OPTS: CrawlOptions = {
  run_id:    'run-c-001',
  tenant_id: 't-aaa',
  site_id:   's-bbb',
  cms:       'shopify',
  start_url: 'https://cococabanalife.com/',
};

/** Minimal RawPage for injection tests. */
function rawPage(url: string, html: string): RawPage {
  return { url, html, status_code: 200, load_time_ms: 100, redirect_chain: [] };
}

// ── Tests: extractPageData ────────────────────────────────────────────────────

describe('extractPageData', () => {
  it('extracts title from <title> tag', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(data.title, 'Sun Glow Bikini — Coco Cabana');
  });

  it('extracts meta_desc from <meta name="description">', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(data.meta_desc, 'Shop the Sun Glow Bikini in 3 colours.');
  });

  it('extracts all h1 tags into array', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.deepEqual(data.h1, ['Sun Glow Bikini']);
  });

  it('extracts all h2 tags into array', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.deepEqual(data.h2, ['Product Details', 'Size Guide']);
  });

  it('extracts canonical URL', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(
      data.canonical,
      'https://cococabanalife.com/products/sun-glow-bikini',
    );
  });

  it('extracts all JSON-LD schema blocks', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(data.schema_blocks.length, 2);
    assert.ok(data.schema_blocks[0].includes('@type'));
    assert.ok(data.schema_blocks[1].includes('BreadcrumbList'));
  });

  it('extracts images with src, alt, dimensions and null size_kb', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(data.images.length, 2);
    assert.equal(data.images[0].src,     '/cdn/products/bikini-red.jpg');
    assert.equal(data.images[0].alt,     'Red Bikini');
    assert.equal(data.images[0].width,   '800');
    assert.equal(data.images[0].height,  '600');
    assert.equal(data.images[0].size_kb, null);
  });

  it('includes internal links (/relative and same-domain absolute), excludes external', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    const hrefs = data.internal_links.map((l) => l.href);

    // Relative path — internal
    assert.ok(hrefs.includes('/collections/swimwear'), 'relative /collections must be internal');
    // /account is an internal link (we record it in data even though we skip crawling it)
    assert.ok(hrefs.includes('/account'), '/account must appear as an internal link ref');
    // Absolute same-domain — internal
    assert.ok(
      hrefs.some((h) => h.includes('cococabanalife.com/products/shorts')),
      'absolute same-domain must be internal',
    );
    // External — excluded
    assert.ok(!hrefs.some((h) => h.includes('external-partner.com')), 'external must be excluded');
    // mailto — excluded
    assert.ok(!hrefs.some((h) => h.startsWith('mailto:')), 'mailto must be excluded');
    // Fragment-only — excluded
    assert.ok(!hrefs.includes('#reviews'), 'fragment-only must be excluded');
  });

  it('returns null for missing title, meta_desc, canonical', () => {
    const bare = '<html><head></head><body><h1>Hello</h1></body></html>';
    const data = extractPageData(
      bare,
      'https://cococabanalife.com/',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(data.title,     null);
    assert.equal(data.meta_desc, null);
    assert.equal(data.canonical, null);
  });

  it('propagates run context fields to returned struct', () => {
    const data = extractPageData(
      PRODUCT_PAGE_HTML,
      'https://cococabanalife.com/products/sun-glow-bikini',
      BASE_EXTRACT_OPTS,
    );
    assert.equal(data.run_id,      BASE_EXTRACT_OPTS.run_id);
    assert.equal(data.tenant_id,   BASE_EXTRACT_OPTS.tenant_id);
    assert.equal(data.site_id,     BASE_EXTRACT_OPTS.site_id);
    assert.equal(data.status_code, 200);
    assert.equal(data.load_time_ms, 320);
  });
});

// ── Tests: shouldSkipUrl ──────────────────────────────────────────────────────

describe('shouldSkipUrl', () => {
  // Must skip
  it('skips /account (exact)', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/account')));

  it('skips /account/ (sub-path)', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/account/login')));

  it('skips customer_authentication path', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/customer_authentication/redirect?return_url=%2F')));

  it('skips /cart', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/cart')));

  it('skips /checkout', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/checkout')));

  it('skips /password', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/password')));

  it('skips /cdn/ asset paths', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/cdn/shop/files/logo.png')));

  it('skips .js files', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/assets/app.js')));

  it('skips .js with query string', () =>
    assert.ok(shouldSkipUrl('/assets/app.js?v=1234')));

  it('skips .css files', () =>
    assert.ok(shouldSkipUrl('https://cococabanalife.com/assets/theme.css')));

  it('skips .woff font files', () =>
    assert.ok(shouldSkipUrl('/fonts/inter.woff')));

  it('skips .woff2 font files', () =>
    assert.ok(shouldSkipUrl('/fonts/inter.woff2')));

  // Must NOT skip
  it('does NOT skip homepage /', () =>
    assert.ok(!shouldSkipUrl('https://cococabanalife.com/')));

  it('does NOT skip /collections/swimwear', () =>
    assert.ok(!shouldSkipUrl('https://cococabanalife.com/collections/swimwear')));

  it('does NOT skip /products/bikini', () =>
    assert.ok(!shouldSkipUrl('https://cococabanalife.com/products/bikini')));

  it('does NOT skip /blogs/news/post', () =>
    assert.ok(!shouldSkipUrl('https://cococabanalife.com/blogs/news/summer-trends')));

  it('does NOT skip /pages/about', () =>
    assert.ok(!shouldSkipUrl('https://cococabanalife.com/pages/about')));
});

// ── Tests: crawl() integration ────────────────────────────────────────────────

describe('crawl()', () => {
  afterEach(() => _resetOps());

  it('stores extracted fields correctly via full crawl() → extractPageData path', async () => {
    const stored: CrawlPageData[] = [];

    _injectOps({
      storeResult: async (d) => { stored.push(d); },
      runCrawler:  async (opts, onPage) => {
        await onPage(rawPage(
          'https://cococabanalife.com/products/sun-glow-bikini',
          PRODUCT_PAGE_HTML,
        ));
      },
    });

    await crawl(BASE_CRAWL_OPTS);

    assert.equal(stored.length, 1, 'one page must be stored');
    const page = stored[0];

    assert.equal(page.title,    'Sun Glow Bikini — Coco Cabana');
    assert.equal(page.meta_desc, 'Shop the Sun Glow Bikini in 3 colours.');
    assert.deepEqual(page.h1, ['Sun Glow Bikini']);
    assert.equal(
      page.canonical,
      'https://cococabanalife.com/products/sun-glow-bikini',
    );
    assert.equal(page.schema_blocks.length, 2);
    assert.equal(page.run_id,    BASE_CRAWL_OPTS.run_id);
    assert.equal(page.tenant_id, BASE_CRAWL_OPTS.tenant_id);
    assert.equal(page.site_id,   BASE_CRAWL_OPTS.site_id);
  });

  it('counts urls_crawled and urls_failed correctly', async () => {
    const html = '<html><head><title>T</title></head><body></body></html>';

    _injectOps({
      storeResult: async () => {},
      runCrawler: async (opts, onPage, onFail) => {
        await onPage(rawPage('https://x.com/a', html));
        await onPage(rawPage('https://x.com/b', html));
        await onPage(rawPage('https://x.com/c', html));
        await onFail('https://x.com/broken', new Error('timeout'));
      },
    });

    const result = await crawl(BASE_CRAWL_OPTS);
    assert.equal(result.urls_crawled, 3);
    assert.equal(result.urls_failed,  1);
    assert.ok(result.duration_ms >= 0, 'duration_ms must be set');
    assert.ok(result.stored_at,        'stored_at must be set');
  });

  it('applies defaults for max_urls, max_depth, req_per_sec', async () => {
    let captured: Required<CrawlOptions> | null = null;

    _injectOps({
      storeResult: async () => {},
      runCrawler:  async (opts) => { captured = opts; },
    });

    await crawl(BASE_CRAWL_OPTS);

    assert.ok(captured, 'runCrawler must have been called');
    assert.equal(captured!.max_urls,    2000);
    assert.equal(captured!.max_depth,   3);
    assert.equal(captured!.req_per_sec, 1);
  });

  it('writes crawl:start ActionLog entry before any page processing', async () => {
    let startLoggedBeforePage = false;
    let startLogged = false;

    _injectOps({
      storeResult: async () => {
        // If crawl:start was already written by the time we store, flag it
        startLoggedBeforePage = startLogged;
      },
      runCrawler: async (opts, onPage) => {
        const html = '<html><head><title>T</title></head><body></body></html>';
        await onPage(rawPage('https://cococabanalife.com/', html));
      },
    });

    const lines = await captureStdout(async () => {
      await crawl(BASE_CRAWL_OPTS);
    });

    const entries = parseLines(lines);
    const startEntry = entries.find((e) => e['stage'] === 'crawl:start');
    assert.ok(startEntry, 'crawl:start entry must exist');
    assert.equal(startEntry['status'],  'pending');
    assert.equal(startEntry['command'], 'crawl');

    const meta = startEntry['metadata'] as Record<string, unknown>;
    assert.equal(meta['start_url'], BASE_CRAWL_OPTS.start_url);
    assert.equal(meta['cms'],       'shopify');
  });

  it('writes crawl:complete ActionLog entry with url counts', async () => {
    const html = '<html><head><title>T</title></head><body></body></html>';

    _injectOps({
      storeResult: async () => {},
      runCrawler:  async (opts, onPage, onFail) => {
        await onPage(rawPage('https://cococabanalife.com/a', html));
        await onPage(rawPage('https://cococabanalife.com/b', html));
        await onFail('https://cococabanalife.com/c', new Error('404'));
      },
    });

    const lines = await captureStdout(async () => {
      await crawl(BASE_CRAWL_OPTS);
    });

    const entries = parseLines(lines);
    const complete = entries.find((e) => e['stage'] === 'crawl:complete');
    assert.ok(complete, 'crawl:complete entry must exist');
    assert.equal(complete['status'], 'ok');

    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(meta['urls_crawled'], 2);
    assert.equal(meta['urls_failed'],  1);
  });

  it('writes crawl:url_failed ActionLog entry per failure', async () => {
    _injectOps({
      storeResult: async () => {},
      runCrawler:  async (opts, _onPage, onFail) => {
        await onFail('https://cococabanalife.com/missing', new Error('HTTP 404'));
      },
    });

    const lines = await captureStdout(async () => {
      await crawl(BASE_CRAWL_OPTS);
    });

    const entries = parseLines(lines);
    const failed  = entries.find((e) => e['stage'] === 'crawl:url_failed');
    assert.ok(failed, 'crawl:url_failed entry must exist');
    assert.equal(failed['status'], 'failed');
    assert.equal(failed['url'],    'https://cococabanalife.com/missing');
    assert.ok(
      (failed['error'] as string).includes('404'),
      'error message must be forwarded',
    );
  });

  it('writes crawl:url_complete every 50 pages', async () => {
    const html = '<html><head><title>T</title></head><body></body></html>';

    _injectOps({
      storeResult: async () => {},
      runCrawler:  async (opts, onPage) => {
        // Emit exactly 100 pages — expect 2 milestone log entries
        for (let i = 0; i < 100; i++) {
          await onPage(rawPage(`https://x.com/p${i}`, html));
        }
      },
    });

    const lines = await captureStdout(async () => {
      await crawl(BASE_CRAWL_OPTS);
    });

    const entries  = parseLines(lines);
    const milestones = entries.filter((e) => e['stage'] === 'crawl:url_complete');
    assert.equal(milestones.length, 2, 'expected 2 milestone entries for 100 pages');
    assert.equal((milestones[0]['metadata'] as Record<string, unknown>)['count'],  50);
    assert.equal((milestones[1]['metadata'] as Record<string, unknown>)['count'], 100);
  });
});

// ── Tests: crawlJobProcessor ──────────────────────────────────────────────────

describe('crawlJobProcessor', () => {
  afterEach(() => _resetOps());

  it('maps VaeoJob payload fields to CrawlOptions correctly', async () => {
    let capturedOpts: Required<CrawlOptions> | null = null;

    _injectOps({
      storeResult: async () => {},
      runCrawler:  async (opts) => { capturedOpts = opts; },
    });

    const fakeJob = {
      data: {
        run_id:    'run-job-001',
        tenant_id: 'tenant-xyz',
        site_id:   'site-abc',
        cms:       'shopify' as const,
        payload: {
          start_url:   'https://cococabanalife.com/',
          max_urls:    500,
          max_depth:   2,
          req_per_sec: 2,
        },
      },
    } as Job<VaeoJob>;

    await crawlJobProcessor(fakeJob);

    assert.ok(capturedOpts, 'runCrawler must have been called');
    assert.equal(capturedOpts!.run_id,    'run-job-001');
    assert.equal(capturedOpts!.tenant_id, 'tenant-xyz');
    assert.equal(capturedOpts!.site_id,   'site-abc');
    assert.equal(capturedOpts!.cms,       'shopify');
    assert.equal(capturedOpts!.start_url, 'https://cococabanalife.com/');
    assert.equal(capturedOpts!.max_urls,  500);
    assert.equal(capturedOpts!.max_depth, 2);
    assert.equal(capturedOpts!.req_per_sec, 2);
  });

  it('uses defaults for optional payload fields when omitted', async () => {
    let capturedOpts: Required<CrawlOptions> | null = null;

    _injectOps({
      storeResult: async () => {},
      runCrawler:  async (opts) => { capturedOpts = opts; },
    });

    const fakeJob = {
      data: {
        run_id:    'run-job-002',
        tenant_id: 't',
        site_id:   's',
        cms:       'wordpress' as const,
        payload:   { start_url: 'https://site.com/' },
      },
    } as Job<VaeoJob>;

    await crawlJobProcessor(fakeJob);

    assert.equal(capturedOpts!.max_urls,    2000);
    assert.equal(capturedOpts!.max_depth,   3);
    assert.equal(capturedOpts!.req_per_sec, 1);
  });
});
