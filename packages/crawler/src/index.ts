/**
 * packages/crawler/src/index.ts
 *
 * Site discovery engine for Velocity AEO.
 * Uses CheerioCrawler from crawlee for static HTML extraction.
 * Seeds the crawl queue from /sitemap.xml when available so that
 * JS-rendered Shopify pages (not reachable via <a> links alone) are covered.
 *
 * Design rules:
 *   - Never throws — always returns CrawlSiteResult
 *   - Supabase is lazy-initialized via dynamic import of getConfig()
 *   - Crawler fn is injectable for unit tests (_injectCrawler)
 *   - Supabase client is injectable for unit tests (_injectSupabase)
 *   - Sitemap fetcher is injectable for unit tests (_injectSitemapFetcher)
 *   - fetchSitemapUrls is exported for direct unit testing
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Re-export SupabaseClient type so tests can import it from this module.
export type { SupabaseClient };

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
  /** Maximum BFS link depth for the Crawlee crawler. Default: 3. */
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

/**
 * CrawlerFn receives the full list of seed URLs (from sitemap or [homepage]).
 * startUrls may contain many URLs when seeded from a sitemap.
 */
type CrawlerFn = (opts: {
  startUrls: string[];
  maxUrls:   number;
  maxDepth:  number;
}) => Promise<CrawlResult[]>;

/** Injectable sitemap fetcher — replaces the real fetchSitemapUrls() in crawlSite(). */
type SitemapFetcherFn = (siteUrl: string) => Promise<string[]>;

let _crawlerFn:        CrawlerFn         | undefined;
let _sitemapFetcherFn: SitemapFetcherFn  | undefined;
/** undefined = not yet attempted | null = failed (degraded mode) */
let _supabaseClient:   SupabaseClient | null | undefined;

/** Replace the crawlee engine. Call with no arg to restore the default. */
export function _injectCrawler(fn: CrawlerFn): void {
  _crawlerFn = fn;
}

/** Replace the sitemap fetcher used inside crawlSite(). */
export function _injectSitemapFetcher(fn: SitemapFetcherFn): void {
  _sitemapFetcherFn = fn;
}

/** Inject a Supabase client (or null to skip DB writes). */
export function _injectSupabase(client: SupabaseClient | null): void {
  _supabaseClient = client;
}

/** Reset all injections — call in afterEach to isolate tests. */
export function _resetInjections(): void {
  _crawlerFn        = undefined;
  _sitemapFetcherFn = undefined;
  _supabaseClient   = undefined;
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

// ── Sitemap helpers ───────────────────────────────────────────────────────────

/** Extract all <loc>https://...</loc> values from an XML string. */
function extractLocs(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}

/** Deduplicate and filter URLs to same origin. */
function filterSameOrigin(urls: string[], origin: string): string[] {
  const seen   = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    try {
      if (new URL(url).origin !== origin) continue;
    } catch {
      continue;
    }
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

// ── Sitemap fetching ──────────────────────────────────────────────────────────

/**
 * Fetches /sitemap.xml from the site's origin and returns all page URLs.
 *
 * Handles two formats:
 *   - <urlset>      — regular sitemap, extracts <loc> entries directly
 *   - <sitemapindex> — index sitemap; fetches each child sitemap and merges
 *
 * Never throws. Returns [] on any failure so the crawl continues from homepage.
 *
 * @param siteUrl  Any URL on the target site (origin is extracted automatically)
 * @param fetchFn  Injectable HTTP fetch (default: globalThis.fetch)
 */
export async function fetchSitemapUrls(
  siteUrl: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string[]> {
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    process.stderr.write(`[crawler] sitemap:warn — invalid siteUrl: ${String(siteUrl)}\n`);
    return [];
  }

  const sitemapUrl = `${origin}/sitemap.xml`;

  try {
    const res = await fetchFn(sitemapUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      process.stderr.write(
        `[crawler] sitemap:warn — ${sitemapUrl} returned HTTP ${res.status}\n`,
      );
      return [];
    }

    const text = await res.text();

    // ── Sitemap index: fetch each child sitemap ───────────────────────────────
    if (text.includes('<sitemapindex')) {
      const childUrls = extractLocs(text);
      const allUrls:  string[] = [];

      for (const childUrl of childUrls) {
        try {
          const childRes = await fetchFn(childUrl, { signal: AbortSignal.timeout(15_000) });
          if (childRes.ok) {
            allUrls.push(...extractLocs(await childRes.text()));
          } else {
            process.stderr.write(
              `[crawler] sitemap:warn — child ${childUrl} returned HTTP ${childRes.status}\n`,
            );
          }
        } catch (err) {
          process.stderr.write(
            `[crawler] sitemap:warn — child ${childUrl} failed: ${String(err)}\n`,
          );
        }
      }

      return filterSameOrigin(allUrls, origin);
    }

    // ── Regular urlset ────────────────────────────────────────────────────────
    return filterSameOrigin(extractLocs(text), origin);

  } catch (err) {
    process.stderr.write(
      `[crawler] sitemap:warn — failed to fetch ${sitemapUrl}: ${String(err)}\n`,
    );
    return [];
  }
}

// ── Real crawler implementation ───────────────────────────────────────────────

async function runRealCrawler(opts: {
  startUrls: string[];
  maxUrls:   number;
  maxDepth:  number;
}): Promise<CrawlResult[]> {
  const { CheerioCrawler } = await import('crawlee');
  const results: CrawlResult[] = [];

  let baseOrigin: string;
  try {
    baseOrigin = new URL(opts.startUrls[0] ?? '').origin;
  } catch {
    baseOrigin = opts.startUrls[0] ?? '';
  }

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl:       opts.maxUrls,
    maxCrawlDepth:             opts.maxDepth,
    maxConcurrency:            3,
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

  await crawler.run(opts.startUrls);
  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Crawls a site and returns structured SEO data for every page found.
 *
 * Seed strategy:
 *   1. Fetch /sitemap.xml — if found, seed Crawlee with all sitemap URLs
 *      (capped at max_urls). This reaches JS-rendered Shopify product pages.
 *   2. If sitemap returns empty or fails, fall back to [site_url] homepage.
 *
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

  process.stderr.write(`[crawler] crawl:start — ${startUrl}, max_urls=${maxUrls}, depth=${depth}\n`);

  // ── Sitemap seeding ───────────────────────────────────────────────────────
  let seedUrls: string[];
  try {
    const fetcher    = _sitemapFetcherFn ?? ((url: string) => fetchSitemapUrls(url));
    const sitemapUrls = await fetcher(startUrl);

    if (sitemapUrls.length > 0) {
      process.stderr.write(
        `[crawler] sitemap found — ${sitemapUrls.length} URLs seeded\n`,
      );
      seedUrls = sitemapUrls.slice(0, maxUrls);
      process.stderr.write(
        `[crawler] seeding ${seedUrls.length} URLs (capped at max_urls: ${maxUrls})\n`,
      );
    } else {
      process.stderr.write(`[crawler] no sitemap — starting from homepage\n`);
      seedUrls = [startUrl];
    }
  } catch {
    // Should never happen (fetchSitemapUrls never throws), but guard anyway
    process.stderr.write(`[crawler] sitemap:warn — unexpected error, falling back to homepage\n`);
    seedUrls = [startUrl];
  }

  // ── Run crawler ───────────────────────────────────────────────────────────
  let results: CrawlResult[];
  try {
    const fn = _crawlerFn ?? runRealCrawler;
    results = await fn({ startUrls: seedUrls, maxUrls, maxDepth: depth });
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

  // ── Persist to Supabase ───────────────────────────────────────────────────
  try {
    const client = await getSupabase();
    if (client) await writeResultsToSupabase(client, request, results);
  } catch (err) {
    process.stderr.write(`[crawler] supabase:error — ${String(err)}\n`);
  }

  // ── Derive status ─────────────────────────────────────────────────────────
  const failedCount = results.filter(r => r.status_code === 0 || r.status_code >= 400).length;
  const status: 'completed' | 'failed' | 'partial' =
    results.length === 0 ? 'failed'    :
    failedCount    === 0 ? 'completed' :
                           'partial';

  process.stderr.write(
    `[crawler] crawl:complete — urls_crawled=${results.length}, status=${status}\n`,
  );

  return {
    run_id:       request.run_id,
    tenant_id:    request.tenant_id,
    site_id:      request.site_id,
    urls_crawled: results.length,
    results,
    status,
  };
}

// ── Legacy compatibility (packages/commands/src/crawl.ts) ─────────────────────

/** Options passed to the legacy crawl() entry point. */
export interface CrawlOptions {
  run_id:     string;
  tenant_id:  string;
  site_id:    string;
  cms:        string;
  start_url:  string;
  max_urls?:  number;
  max_depth?: number;
}

/** Aggregate summary returned by the legacy crawl() entry point. */
export interface LegacyCrawlResult {
  urls_crawled: number;
  urls_failed:  number;
  duration_ms:  number;
}

/**
 * Legacy entry point — wraps crawlSite() so packages/commands/src/crawl.ts
 * continues to work without modification.
 */
export async function crawl(opts: CrawlOptions): Promise<LegacyCrawlResult> {
  const startMs = Date.now();
  const result  = await crawlSite({
    run_id:    opts.run_id,
    tenant_id: opts.tenant_id,
    site_id:   opts.site_id,
    site_url:  opts.start_url,
    max_urls:  opts.max_urls,
    depth:     opts.max_depth,
  });
  const urls_failed = result.results.filter(
    r => r.status_code === 0 || r.status_code >= 400,
  ).length;
  return {
    urls_crawled: result.urls_crawled,
    urls_failed,
    duration_ms:  Date.now() - startMs,
  };
}
