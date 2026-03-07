/**
 * packages/crawler/src/index.ts
 *
 * Site discovery engine for Velocity AEO.
 * Uses CheerioCrawler from crawlee for static HTML extraction.
 *
 * Design rules:
 *   - Never throws — always returns CrawlSiteResult
 *   - Supabase is lazy-initialized via dynamic import of getConfig()
 *   - Crawler fn is injectable for unit tests (_injectCrawler)
 *   - Supabase client is injectable for unit tests (_injectSupabase)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageResult {
  src:    string;
  alt:    string | null;
  width:  number | null;
  height: number | null;
}

export interface CrawlResult {
  url:            string;
  status_code:    number;
  title:          string | null;
  meta_desc:      string | null;
  h1:             string[];
  h2:             string[];
  images:         ImageResult[];
  internal_links: string[];
  schema_blocks:  string[];
  canonical:      string | null;
  redirect_chain: string[];
  load_time_ms:   number;
}

export interface CrawlSiteRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  site_url:  string;
  max_urls?: number;
  depth?:    number;
}

export interface CrawlSiteResult {
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  urls_crawled: number;
  results:      CrawlResult[];
  status:       'completed' | 'failed' | 'partial';
  error?:       string;
}

// ── Injectable dependencies ───────────────────────────────────────────────────

type CrawlerFn = (opts: {
  startUrl: string;
  maxUrls:  number;
  maxDepth: number;
}) => Promise<CrawlResult[]>;

let _crawlerFn: CrawlerFn | undefined;
/** undefined = not yet attempted | null = failed (degraded mode) */
let _supabaseClient: SupabaseClient | null | undefined;

/** Replace the crawlee engine. Pass undefined to restore the default. */
export function _injectCrawler(fn: CrawlerFn): void {
  _crawlerFn = fn;
}

/** Inject a Supabase client (or null to skip DB writes). */
export function _injectSupabase(client: SupabaseClient | null): void {
  _supabaseClient = client;
}

/** Reset both injections — call in afterEach to isolate tests. */
export function _resetInjections(): void {
  _crawlerFn = undefined;
  _supabaseClient = undefined;
}

// ── Supabase lazy init ────────────────────────────────────────────────────────

async function getSupabase(): Promise<SupabaseClient | null> {
  if (_supabaseClient !== undefined) return _supabaseClient;
  try {
    const [{ createClient }, { getConfig }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('../../core/src/config.js'),
    ]);
    const cfg = getConfig();
    _supabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
    return _supabaseClient;
  } catch (err) {
    process.stderr.write(`[crawler] supabase:error — init failed: ${String(err)}\n`);
    _supabaseClient = null;
    return null;
  }
}

// ── Supabase write ────────────────────────────────────────────────────────────

async function writeResultsToSupabase(
  client: SupabaseClient,
  req: CrawlSiteRequest,
  results: CrawlResult[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const r of results) {
    try {
      const { error } = await client.from('crawl_results').insert({
        run_id:         req.run_id,
        tenant_id:      req.tenant_id,
        site_id:        req.site_id,
        url:            r.url,
        status_code:    r.status_code,
        title:          r.title,
        meta_desc:      r.meta_desc,
        h1:             r.h1,
        h2:             r.h2,
        images:         r.images,
        internal_links: r.internal_links,
        schema_blocks:  r.schema_blocks,
        canonical:      r.canonical,
        redirect_chain: r.redirect_chain,
        load_time_ms:   r.load_time_ms,
        crawled_at:     now,
      });
      if (error) {
        process.stderr.write(`[crawler] supabase:error — ${r.url}: ${error.message}\n`);
      }
    } catch (err) {
      process.stderr.write(`[crawler] supabase:error — ${r.url}: ${String(err)}\n`);
    }
  }
}

// ── Real crawler implementation ───────────────────────────────────────────────

async function runRealCrawler(opts: {
  startUrl: string;
  maxUrls:  number;
  maxDepth: number;
}): Promise<CrawlResult[]> {
  const { CheerioCrawler } = await import('crawlee');
  const results: CrawlResult[] = [];

  let baseOrigin: string;
  try {
    baseOrigin = new URL(opts.startUrl).origin;
  } catch {
    baseOrigin = opts.startUrl;
  }

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl:      opts.maxUrls,
    maxCrawlDepth:            opts.maxDepth,
    maxConcurrency:           1,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ $, request, response, enqueueLinks }) {
      const start = Date.now();
      const url   = request.loadedUrl ?? request.url;

      const title     = $('title').first().text().trim() || null;
      const meta_desc = $('meta[name="description"]').attr('content')?.trim() ?? null;
      const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? null;

      const h1 = $('h1').map((_i, el) => $(el).text().trim()).get().filter(Boolean);
      const h2 = $('h2').map((_i, el) => $(el).text().trim()).get().filter(Boolean);

      const images: ImageResult[] = $('img').map((_i, el) => {
        const src = $(el).attr('src') ?? '';
        if (!src) return null;
        const w = $(el).attr('width');
        const h = $(el).attr('height');
        return {
          src,
          alt:    $(el).attr('alt') ?? null,
          width:  w != null ? parseInt(w, 10) : null,
          height: h != null ? parseInt(h, 10) : null,
        };
      }).get().filter(Boolean) as ImageResult[];

      const linkSet = new Set<string>();
      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        try {
          const resolved = new URL(href, url);
          if (resolved.origin === baseOrigin) linkSet.add(resolved.href);
        } catch { /* skip malformed */ }
      });

      const schema_blocks: string[] = $('script[type="application/ld+json"]')
        .map((_i, el) => $(el).html() ?? '')
        .get()
        .filter(Boolean);

      results.push({
        url,
        status_code:    response.statusCode ?? 200,
        title,
        meta_desc,
        h1,
        h2,
        images,
        internal_links: [...linkSet],
        schema_blocks,
        canonical,
        redirect_chain: [],
        load_time_ms:   Date.now() - start,
      });

      await enqueueLinks({ strategy: 'same-origin' });
    },

    async failedRequestHandler({ request }) {
      results.push({
        url:            request.url,
        status_code:    0,
        title:          null,
        meta_desc:      null,
        h1:             [],
        h2:             [],
        images:         [],
        internal_links: [],
        schema_blocks:  [],
        canonical:      null,
        redirect_chain: [],
        load_time_ms:   0,
      });
    },
  });

  await crawler.run([opts.startUrl]);
  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Crawls a site and returns structured SEO data for every page found.
 * Persists results to Supabase crawl_results table (non-blocking on failure).
 * Never throws — always returns CrawlSiteResult.
 */
export async function crawlSite(request: CrawlSiteRequest): Promise<CrawlSiteResult> {
  // Validate URL early
  let startUrl: string;
  try {
    startUrl = new URL(request.site_url ?? '').href;
  } catch {
    return {
      run_id:       request.run_id,
      tenant_id:    request.tenant_id,
      site_id:      request.site_id,
      urls_crawled: 0,
      results:      [],
      status:       'failed',
      error:        `Invalid site_url: "${String(request.site_url)}"`,
    };
  }

  const maxUrls = request.max_urls ?? 2000;
  const depth   = request.depth    ?? 3;

  process.stderr.write(`[crawler] crawl:start — ${startUrl}, max_urls=${maxUrls}\n`);

  // Run crawler
  let results: CrawlResult[];
  try {
    const fn = _crawlerFn ?? runRealCrawler;
    results = await fn({ startUrl, maxUrls, maxDepth: depth });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[crawler] crawl:error — ${error}\n`);
    return {
      run_id:       request.run_id,
      tenant_id:    request.tenant_id,
      site_id:      request.site_id,
      urls_crawled: 0,
      results:      [],
      status:       'failed',
      error,
    };
  }

  // Persist to Supabase — non-blocking, never fails the crawl
  try {
    const client = await getSupabase();
    if (client) await writeResultsToSupabase(client, request, results);
  } catch (err) {
    process.stderr.write(`[crawler] supabase:error — ${String(err)}\n`);
  }

  // Derive status
  const failedCount = results.filter(r => r.status_code === 0 || r.status_code >= 400).length;
  const status: 'completed' | 'failed' | 'partial' =
    results.length === 0 ? 'failed'    :
    failedCount    === 0 ? 'completed' :
                           'partial';

  process.stderr.write(`[crawler] crawl:complete — urls_crawled=${results.length}, status=${status}\n`);

  return {
    run_id:       request.run_id,
    tenant_id:    request.tenant_id,
    site_id:      request.site_id,
    urls_crawled: results.length,
    results,
    status,
  };
}
