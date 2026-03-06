/**
 * packages/crawler/src/index.ts
 *
 * Discovery engine for Velocity AEO.
 *
 * Visits every page on a client site, extracts raw SEO signals, and persists
 * the results to Supabase (crawl_results table) so downstream components work
 * from a complete before-snapshot.
 *
 * Framework: Crawlee
 *   PlaywrightCrawler — Shopify (JS-rendered Liquid themes, SPAs)
 *   CheerioCrawler    — WordPress (faster, server-rendered HTML)
 *
 * Crawlee handles:
 *   - robots.txt compliance           - rate limiting
 *   - retry logic + exponential back-off  - URL deduplication
 *   - request queue management         - concurrency control
 *
 * Exports:
 *   crawl()            — main entry point
 *   crawlJobProcessor  — BullMQ job processor for vaeo:crawl queue
 *   extractPageData()  — pure HTML-to-struct extraction (exported for tests)
 *   shouldSkipUrl()    — URL filter predicate (exported for tests)
 *   SKIP_PATTERNS      — compiled regex array
 *   _injectOps()       — replace engine + store for unit tests
 *   _resetOps()        — restore defaults after each test
 */

import { load } from 'cheerio';
import type { Job } from 'bullmq';
import type { CmsType } from '../../core/types.js';
import type { VaeoJob } from '../../queue/src/index.js';
import { createLogger } from '../../action-log/src/index.js';

// Crawlee is a peer dependency — imported statically so TypeScript resolves types.
// The real crawler is only invoked when no runCrawler override is injected,
// so tests never launch a browser.
import { PlaywrightCrawler, CheerioCrawler } from 'crawlee';

// ── Skip patterns ─────────────────────────────────────────────────────────────

/**
 * URL patterns that must never be enqueued or crawled.
 * Matches Shopify account/auth flows, cart/checkout, CDN asset paths,
 * and static file extensions.
 */
export const SKIP_PATTERNS: RegExp[] = [
  /\/customer_authentication/,
  /\/account(\/|$|\?|#)/,
  /\/password(\/|$|\?|#)/,
  /\/cart(\/|$|\?|#)/,
  /\/checkout(\/|$|\?|#)/,
  /\/cdn\//,
  /\.js(\?|#|$)/,
  /\.css(\?|#|$)/,
  /\.woff2?(\?|#|$)/,
];

/** Returns true if the URL matches any SKIP_PATTERN and should not be crawled. */
export function shouldSkipUrl(url: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(url));
}

// ── Data types ────────────────────────────────────────────────────────────────

export interface ImageRef {
  src:     string;
  alt:     string;
  width:   string | null;
  height:  string | null;
  /** Filled by image detector (C14) — null during crawl. */
  size_kb: null;
}

export interface LinkRef {
  href:        string;
  anchor_text: string;
  /** null during crawl — can be joined from crawl_results by URL later. */
  status_code: number | null;
}

/** Full per-URL payload written to Supabase crawl_results. */
export interface CrawlPageData {
  run_id:         string;
  tenant_id:      string;
  site_id:        string;
  url:            string;
  status_code:    number | null;
  title:          string | null;
  meta_desc:      string | null;
  h1:             string[];
  h2:             string[];
  images:         ImageRef[];
  internal_links: LinkRef[];
  schema_blocks:  string[];
  canonical:      string | null;
  redirect_chain: string[];
  load_time_ms:   number | null;
}

export interface CrawlOptions {
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  cms:          CmsType;
  /** Homepage URL to start crawling from. */
  start_url:    string;
  /** Maximum pages to visit. Default: 2000. */
  max_urls?:    number;
  /** Maximum link depth from start_url. Default: 3. */
  max_depth?:   number;
  /** Target requests per second per domain. Default: 1. */
  req_per_sec?: number;
}

export interface CrawlResult {
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  urls_crawled: number;
  urls_failed:  number;
  duration_ms:  number;
  stored_at:    string;
}

/** Raw page data produced by the crawl engine before field extraction. */
export interface RawPage {
  url:            string;
  html:           string;
  status_code:    number;
  load_time_ms:   number;
  redirect_chain: string[];
}

/** Context passed to extractPageData() alongside the raw HTML. */
export interface ExtractOpts {
  run_id:         string;
  tenant_id:      string;
  site_id:        string;
  /** Hostname of start_url, used to classify links as internal. */
  start_domain:   string;
  status_code:    number;
  load_time_ms:   number;
  redirect_chain: string[];
}

// ── Pure extraction ───────────────────────────────────────────────────────────

/**
 * Pure function: parses raw HTML and extracts all SEO-relevant fields.
 *
 * No I/O, no side effects. Exported so unit tests can call it directly
 * with fixture HTML strings without running a real crawl.
 *
 * Internal link classification:
 *   - href starts with "/"               → internal (relative path)
 *   - href contains start_domain         → internal (absolute same-domain)
 *   - everything else                    → external, excluded
 */
export function extractPageData(
  html:   string,
  url:    string,
  opts:   ExtractOpts,
): CrawlPageData {
  const $ = load(html);

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = $('title').first().text().trim() || null;

  // ── Meta description ───────────────────────────────────────────────────────
  const meta_desc =
    $('meta[name="description"]').first().attr('content')?.trim() ?? null;

  // ── Headings ───────────────────────────────────────────────────────────────
  const h1 = $('h1')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const h2 = $('h2')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  // ── Images ─────────────────────────────────────────────────────────────────
  const images: ImageRef[] = $('img')
    .map((_, el) => ({
      src:     $(el).attr('src')    ?? '',
      alt:     $(el).attr('alt')    ?? '',
      width:   $(el).attr('width')  ?? null,
      height:  $(el).attr('height') ?? null,
      size_kb: null,
    }))
    .get();

  // ── JSON-LD schema blocks ──────────────────────────────────────────────────
  const schema_blocks: string[] = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).html() ?? '')
    .get()
    .filter(Boolean);

  // ── Canonical ──────────────────────────────────────────────────────────────
  const canonical =
    $('link[rel="canonical"]').first().attr('href')?.trim() ?? null;

  // ── Internal links ─────────────────────────────────────────────────────────
  const internal_links: LinkRef[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) return;

    const isInternal =
      href.startsWith('/') ||
      href.includes(opts.start_domain);

    if (isInternal) {
      internal_links.push({
        href,
        anchor_text: $(el).text().trim(),
        status_code: null,
      });
    }
  });

  return {
    run_id:         opts.run_id,
    tenant_id:      opts.tenant_id,
    site_id:        opts.site_id,
    url,
    status_code:    opts.status_code,
    title,
    meta_desc,
    h1,
    h2,
    images,
    internal_links,
    schema_blocks,
    canonical,
    redirect_chain: opts.redirect_chain,
    load_time_ms:   opts.load_time_ms,
  };
}

// ── Supabase storage ──────────────────────────────────────────────────────────

type SupabaseClient = Awaited<
  ReturnType<typeof import('@supabase/supabase-js')['createClient']>
>;

/** undefined = not yet attempted | null = failed / degraded mode */
let _supabase: SupabaseClient | undefined | null;

async function getSupabase(): Promise<SupabaseClient | null> {
  if (_supabase !== undefined) return _supabase;
  try {
    const [{ createClient }, { config }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('../../core/config.js'),
    ]);
    _supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
    return _supabase;
  } catch (err) {
    process.stderr.write(
      `[crawler] Supabase init failed — results not stored: ${String(err)}\n`,
    );
    _supabase = null;
    return null;
  }
}

async function defaultStoreResult(data: CrawlPageData): Promise<void> {
  const client = await getSupabase();
  if (!client) return;

  const { error } = await client.from('crawl_results').insert({
    run_id:         data.run_id,
    tenant_id:      data.tenant_id,
    site_id:        data.site_id,
    url:            data.url,
    status_code:    data.status_code   ?? null,
    title:          data.title         ?? null,
    meta_desc:      data.meta_desc     ?? null,
    h1:             data.h1,
    h2:             data.h2,
    images:         data.images,
    internal_links: data.internal_links,
    schema_blocks:  data.schema_blocks,
    canonical:      data.canonical     ?? null,
    redirect_chain: data.redirect_chain,
    load_time_ms:   data.load_time_ms  ?? null,
  });

  if (error) {
    process.stderr.write(
      `[crawler] Supabase insert failed (${data.url}): ${error.message}\n`,
    );
  }
}

// ── Injectable ops (for unit tests) ──────────────────────────────────────────

export interface CrawlerOps {
  /**
   * Replace the Crawlee engine.
   * The function receives fully-resolved options plus two callbacks:
   *   onPage  — call for each successfully crawled page
   *   onFail  — call for each permanently failed URL
   */
  runCrawler: (
    opts:   Required<CrawlOptions>,
    onPage: (raw: RawPage) => Promise<void>,
    onFail: (url: string, err: Error) => Promise<void>,
  ) => Promise<void>;

  /** Replace Supabase insert — receives fully assembled CrawlPageData. */
  storeResult: (data: CrawlPageData) => Promise<void>;
}

let _ops: Partial<CrawlerOps> | null = null;

/**
 * Overrides the Crawlee engine and/or Supabase store for unit testing.
 * Always call _resetOps() in afterEach.
 */
export function _injectOps(ops: Partial<CrawlerOps>): void {
  _ops = ops;
}

/** Restores real Crawlee + Supabase implementations. */
export function _resetOps(): void {
  _ops = null;
}

// ── Real Crawlee engine ───────────────────────────────────────────────────────

async function runRealCrawler(
  opts:   Required<CrawlOptions>,
  onPage: (raw: RawPage) => Promise<void>,
  onFail: (url: string, err: Error) => Promise<void>,
): Promise<void> {
  const { cms, start_url, max_urls, max_depth, req_per_sec } = opts;

  // maxRequestsPerMinute translates req_per_sec to Crawlee's rate-limit option.
  const maxRequestsPerMinute = req_per_sec * 60;

  const baseOpts = {
    maxRequestsPerCrawl:  max_urls,
    maxRequestRetries:    3,
    maxConcurrency:       1,
    maxRequestsPerMinute,
  };

  /** Enqueue depth-aware, skip-filtered links from the current page. */
  function makeTransform(depth: number) {
    return (req: { url: string; userData?: Record<string, unknown> }) => {
      if (shouldSkipUrl(req.url)) return false as const;
      if (depth >= max_depth)     return false as const;
      req.userData = { ...req.userData, depth: depth + 1 };
      return req;
    };
  }

  if (cms === 'shopify') {
    const crawler = new PlaywrightCrawler({
      ...baseOpts,
      async requestHandler({ page, request, response, enqueueLinks }) {
        const t0   = Date.now();
        const html = await page.content();

        await onPage({
          url:            request.loadedUrl ?? request.url,
          html,
          status_code:    response?.status() ?? 200,
          load_time_ms:   Date.now() - t0,
          redirect_chain: [],
        });

        const depth = (request.userData['depth'] as number) ?? 0;
        await enqueueLinks({
          strategy:                'same-hostname',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transformRequestFunction: makeTransform(depth) as any,
        });
      },
      async failedRequestHandler({ request, error }) {
        await onFail(request.url, error as Error);
      },
    });

    await crawler.run([{ url: start_url, userData: { depth: 0 } }]);

  } else {
    // WordPress — faster CheerioCrawler (no browser)
    const crawler = new CheerioCrawler({
      ...baseOpts,
      async requestHandler({ $, request, response, enqueueLinks }) {
        const t0   = Date.now();
        const html = $.html();

        await onPage({
          url:            request.loadedUrl ?? request.url,
          html,
          status_code:    (response as unknown as { statusCode?: number }).statusCode ?? 200,
          load_time_ms:   Date.now() - t0,
          redirect_chain: [],
        });

        const depth = (request.userData['depth'] as number) ?? 0;
        await enqueueLinks({
          strategy:                'same-hostname',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transformRequestFunction: makeTransform(depth) as any,
        });
      },
      async failedRequestHandler({ request, error }) {
        await onFail(request.url, error as Error);
      },
    });

    await crawler.run([{ url: start_url, userData: { depth: 0 } }]);
  }
}

// ── crawl ─────────────────────────────────────────────────────────────────────

/**
 * Crawls a site from start_url, extracts per-page SEO fields, and stores
 * results to Supabase.
 *
 * ActionLog events emitted:
 *   crawl:start        — once at the beginning (status=pending)
 *   crawl:url_complete — every 50 pages (status=ok)
 *   crawl:url_failed   — per permanently-failed URL (status=failed)
 *   crawl:complete     — once at the end (status=ok, includes counts)
 *
 * @param opts  Crawl options (run context + site config + tuning).
 * @returns     Summary of the crawl run.
 */
export async function crawl(opts: CrawlOptions): Promise<CrawlResult> {
  const {
    run_id, tenant_id, site_id, cms,
    start_url,
    max_urls    = 2000,
    max_depth   = 3,
    req_per_sec = 1,
  } = opts;

  const resolvedOpts: Required<CrawlOptions> = {
    run_id, tenant_id, site_id, cms,
    start_url, max_urls, max_depth, req_per_sec,
  };

  const startedAt    = Date.now();
  const start_domain = new URL(start_url).hostname;
  const log = createLogger({ run_id, tenant_id, site_id, cms, command: 'crawl' });

  const storeResult = _ops?.storeResult ?? defaultStoreResult;
  const runCrawler  = _ops?.runCrawler  ?? runRealCrawler;

  let urlsCrawled = 0;
  let urlsFailed  = 0;

  log({
    stage:    'crawl:start',
    status:   'pending',
    metadata: { start_url, max_urls, max_depth, cms },
  });

  async function onPage(raw: RawPage): Promise<void> {
    const data = extractPageData(raw.html, raw.url, {
      run_id, tenant_id, site_id,
      start_domain,
      status_code:    raw.status_code,
      load_time_ms:   raw.load_time_ms,
      redirect_chain: raw.redirect_chain,
    });
    await storeResult(data);
    urlsCrawled++;

    if (urlsCrawled % 50 === 0) {
      log({
        stage:    'crawl:url_complete',
        status:   'ok',
        url:      raw.url,
        metadata: { count: urlsCrawled },
      });
    }
  }

  async function onFail(url: string, error: Error): Promise<void> {
    urlsFailed++;
    log({
      stage:  'crawl:url_failed',
      status: 'failed',
      url,
      error:  error.message,
    });
  }

  await runCrawler(resolvedOpts, onPage, onFail);

  const storedAt   = new Date().toISOString();
  const durationMs = Date.now() - startedAt;

  log({
    stage:       'crawl:complete',
    status:      'ok',
    duration_ms: durationMs,
    metadata:    { urls_crawled: urlsCrawled, urls_failed: urlsFailed },
  });

  return {
    run_id,
    tenant_id,
    site_id,
    urls_crawled: urlsCrawled,
    urls_failed:  urlsFailed,
    duration_ms:  durationMs,
    stored_at:    storedAt,
  };
}

// ── BullMQ job processor ──────────────────────────────────────────────────────

/**
 * BullMQ job processor for the vaeo:crawl queue.
 *
 * Usage:
 *   import { createWorker, QUEUES } from '@vaeo/queue';
 *   import { crawlJobProcessor } from '@vaeo/crawler';
 *   createWorker(QUEUES.CRAWL, crawlJobProcessor);
 *
 * VaeoJob.payload must contain:
 *   start_url:    string   (required)
 *   max_urls?:    number
 *   max_depth?:   number
 *   req_per_sec?: number
 */
export async function crawlJobProcessor(
  job: Job<VaeoJob>,
): Promise<CrawlResult> {
  const { run_id, tenant_id, site_id, cms, payload } = job.data;
  return crawl({
    run_id,
    tenant_id,
    site_id,
    cms,
    start_url:   payload['start_url']   as string,
    max_urls:    payload['max_urls']    as number | undefined,
    max_depth:   payload['max_depth']   as number | undefined,
    req_per_sec: payload['req_per_sec'] as number | undefined,
  });
}
