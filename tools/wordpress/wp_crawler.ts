/**
 * tools/wordpress/wp_crawler.ts
 *
 * WordPress REST API site crawler.
 * Fetches pages, posts, and WooCommerce products.
 * Never throws at the outer level.
 */

import { buildAuthHeader } from './wp_connection.js';
import type { WPConnectionConfig } from './wp_connection.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type FetchFn = (url: string, opts: RequestInit) => Promise<Response>;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface WPPage {
  url:               string;
  post_id:           number;
  post_type:         'page' | 'post' | 'product' | string;
  title:             string;
  meta_description?: string;
  has_schema:        boolean;
  image_count:       number;
  word_count:        number;
  status:            string;
}

export interface WPCrawlResult {
  site_id:                       string;
  domain:                        string;
  crawled_at:                    string;
  total_pages:                   number;
  pages:                         WPPage[];
  woocommerce_products:          number;
  errors:                        string[];
  noindex_pages_skipped:         number;
  redirect_chains_resolved:      number;
  circular_redirects_skipped:    number;
  max_hops_exceeded_skipped:     number;
  protected_pages_skipped:       number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  const t = stripHtml(text ?? '');
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function countImages(html: string): number {
  return (html.match(/<img[\s>]/gi) ?? []).length;
}

function detectSchema(content: string): boolean {
  return content.includes('"@context"') || content.includes("'@context'");
}

function extractMetaDescription(yoast?: Record<string, unknown>): string | undefined {
  if (!yoast) return undefined;
  const desc = yoast['yoast_head_json'];
  if (desc && typeof desc === 'object') {
    const d = (desc as Record<string, unknown>).description;
    if (typeof d === 'string' && d.trim()) return d.trim();
  }
  return undefined;
}

function rawToWPPage(
  raw: Record<string, unknown>,
  post_type: string,
  base: string,
): WPPage {
  const id       = typeof raw.id === 'number' ? raw.id : 0;
  const status   = typeof raw.status === 'string' ? raw.status : 'publish';
  const link     = typeof raw.link === 'string' ? raw.link : `${base}/?p=${id}`;

  const titleObj = raw.title as Record<string, unknown> | undefined;
  const title    = typeof titleObj?.rendered === 'string' ? stripHtml(titleObj.rendered) : '';

  const contentObj = raw.content as Record<string, unknown> | undefined;
  const contentHtml = typeof contentObj?.rendered === 'string' ? contentObj.rendered : '';

  const excerptObj = raw.excerpt as Record<string, unknown> | undefined;
  const excerptHtml = typeof excerptObj?.rendered === 'string' ? excerptObj.rendered : '';

  const combined  = contentHtml + excerptHtml;
  const yoast     = raw.yoast_head_json as Record<string, unknown> | undefined;
  const meta_desc = extractMetaDescription({ yoast_head_json: yoast });

  return {
    url:             link,
    post_id:         id,
    post_type,
    title,
    ...(meta_desc ? { meta_description: meta_desc } : {}),
    has_schema:      detectSchema(combined),
    image_count:     countImages(combined),
    word_count:      countWords(contentHtml),
    status,
  };
}

// ── fetchEndpoint ──────────────────────────────────────────────────────────────

async function fetchEndpoint(
  base: string,
  endpoint: string,
  authHeader: string,
  fetchFn: FetchFn,
  per_page = 100,
): Promise<{ items: Record<string, unknown>[]; error?: string }> {
  try {
    const url = `${base}/wp-json/wp/v2/${endpoint}?per_page=${per_page}&_fields=id,status,link,title,content,excerpt,yoast_head_json`;
    const res = await fetchFn(url, {
      method:  'GET',
      headers: {
        Authorization:  authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      return { items: [], error: `${endpoint}: HTTP ${res.status}` };
    }

    const data = await res.json() as unknown;
    if (!Array.isArray(data)) return { items: [] };
    return { items: data as Record<string, unknown>[] };
  } catch (err) {
    return { items: [], error: `${endpoint}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── crawlWPSite ───────────────────────────────────────────────────────────────

export interface WPCrawlerDeps {
  fetchFn?:   FetchFn;
  logFn?:     (msg: string) => void;
  /** Noindex check — injectable for testing */
  checkNoindexFn?: (url: string, html: string, headers: Record<string, string>) => { is_noindex: boolean; signal: string };
  /** Redirect resolve — injectable for testing */
  resolveRedirectFn?: (url: string) => Promise<{ final_url: string; is_redirect: boolean; circular_detected: boolean; max_hops_exceeded: boolean }>;
}

export async function crawlWPSite(
  config: WPConnectionConfig,
  deps?: WPCrawlerDeps,
): Promise<WPCrawlResult> {
  const emptyResult = (): WPCrawlResult => ({
    site_id:              config?.site_id ?? '',
    domain:               config?.domain  ?? '',
    crawled_at:           new Date().toISOString(),
    total_pages:          0,
    pages:                [],
    woocommerce_products: 0,
    errors:               [],
    noindex_pages_skipped:      0,
    redirect_chains_resolved:   0,
    circular_redirects_skipped: 0,
    max_hops_exceeded_skipped:  0,
    protected_pages_skipped:    0,
  });

  try {
    const base       = (config?.wp_url ?? '').replace(/\/$/, '');
    const authHeader = buildAuthHeader(config?.username ?? '', config?.app_password ?? '');
    const fetchFn    = deps?.fetchFn ?? globalThis.fetch;
    const log        = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
    const errors: string[] = [];
    const pages: WPPage[]  = [];
    let noindex_pages_skipped       = 0;
    let redirect_chains_resolved    = 0;
    let circular_redirects_skipped  = 0;
    let max_hops_exceeded_skipped   = 0;
    let protected_pages_skipped     = 0;

    // Fetch pages
    const { items: rawPages, error: pagesErr } = await fetchEndpoint(
      base, 'pages', authHeader, fetchFn,
    );
    if (pagesErr) errors.push(pagesErr);
    for (const raw of rawPages) {
      pages.push(rawToWPPage(raw, 'page', base));
    }

    // Fetch posts
    const { items: rawPosts, error: postsErr } = await fetchEndpoint(
      base, 'posts', authHeader, fetchFn,
    );
    if (postsErr) errors.push(postsErr);
    for (const raw of rawPosts) {
      pages.push(rawToWPPage(raw, 'post', base));
    }

    // Fetch WooCommerce products (may fail if WC not installed)
    let woocommerce_products = 0;
    const { items: rawProducts, error: productsErr } = await fetchEndpoint(
      base, 'products', authHeader, fetchFn,
    );
    if (!productsErr) {
      woocommerce_products = rawProducts.length;
      for (const raw of rawProducts) {
        pages.push(rawToWPPage(raw, 'product', base));
      }
    }
    // WC products endpoint 404/403 is expected on non-WC sites — skip silently

    // Noindex filtering
    if (deps?.checkNoindexFn) {
      const filtered: WPPage[] = [];
      for (const page of pages) {
        try {
          const result = deps.checkNoindexFn(page.url, '', {});
          if (result.is_noindex) {
            noindex_pages_skipped++;
            log(`[WP_CRAWLER] Skipping noindex page: ${page.url} signal=${result.signal}`);
            continue;
          }
        } catch {
          // fail open
        }
        filtered.push(page);
      }
      pages.length = 0;
      pages.push(...filtered);
    }

    // Redirect resolution
    if (deps?.resolveRedirectFn) {
      const resolved: WPPage[] = [];
      const seenFinals = new Set<string>();
      for (const page of pages) {
        try {
          const result = await deps.resolveRedirectFn(page.url);
          if (result.circular_detected) {
            circular_redirects_skipped++;
            log(`[WP_CRAWLER] Skipping redirect issue: ${page.url} reason=circular`);
            continue;
          }
          if (result.max_hops_exceeded) {
            max_hops_exceeded_skipped++;
            log(`[WP_CRAWLER] Skipping redirect issue: ${page.url} reason=max_hops_exceeded`);
            continue;
          }
          if (result.is_redirect) {
            redirect_chains_resolved++;
            page.url = result.final_url;
          }
          if (seenFinals.has(page.url)) {
            log(`[WP_CRAWLER] Deduped redirect: ${page.url}`);
            continue;
          }
          seenFinals.add(page.url);
        } catch {
          // fail open
        }
        resolved.push(page);
      }
      pages.length = 0;
      pages.push(...resolved);
    }

    return {
      site_id:              config?.site_id ?? '',
      domain:               config?.domain  ?? '',
      crawled_at:           new Date().toISOString(),
      total_pages:          pages.length,
      pages,
      woocommerce_products,
      errors,
      noindex_pages_skipped,
      redirect_chains_resolved,
      circular_redirects_skipped,
      max_hops_exceeded_skipped,
      protected_pages_skipped,
    };
  } catch (err) {
    const r = emptyResult();
    r.errors = [err instanceof Error ? err.message : String(err)];
    return r;
  }
}

// ── fetchPageWithStatusCheck ────────────────────────────────────────────────

export async function fetchPageWithStatusCheck(
  url: string,
  fetchFn: FetchFn,
  authHeader: string,
  deps?: { logFn?: (msg: string) => void },
): Promise<{ ok: boolean; html: string; status: number; skipped: boolean; skip_reason?: string }> {
  const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { Authorization: authHeader },
    });

    if (res.status === 401 || res.status === 403) {
      log(`[WP_CRAWLER] Skipping protected page: ${url} status=${res.status}`);
      return { ok: false, html: '', status: res.status, skipped: true, skip_reason: 'protected' };
    }

    if (res.status === 404) {
      log(`[WP_CRAWLER] Skipping 404: ${url}`);
      return { ok: false, html: '', status: 404, skipped: true, skip_reason: '404' };
    }

    if (res.status >= 500) {
      log(`[WP_CRAWLER] Skipping server error: ${url} status=${res.status}`);
      return { ok: false, html: '', status: res.status, skipped: true, skip_reason: 'server_error' };
    }

    const html = await res.text();
    return { ok: true, html, status: res.status, skipped: false };
  } catch {
    return { ok: false, html: '', status: 0, skipped: true, skip_reason: 'fetch_error' };
  }
}

// ── summarizeCrawl ────────────────────────────────────────────────────────────

export function summarizeCrawl(result: WPCrawlResult): string {
  const { domain, total_pages, pages, woocommerce_products, errors, crawled_at } = result;

  const missing_meta   = pages.filter(p => !p.meta_description).length;
  const missing_schema = pages.filter(p => !p.has_schema).length;
  const by_type        = pages.reduce<Record<string, number>>((acc, p) => {
    acc[p.post_type] = (acc[p.post_type] ?? 0) + 1;
    return acc;
  }, {});

  const typeBreakdown = Object.entries(by_type)
    .map(([t, n]) => `${t}: ${n}`)
    .join(', ');

  const lines = [
    `WP Crawl — ${domain} (${crawled_at.slice(0, 10)})`,
    `Total pages crawled: ${total_pages} (${typeBreakdown || 'none'})`,
    `WooCommerce products: ${woocommerce_products}`,
    `Missing meta description: ${missing_meta}/${total_pages}`,
    `Missing JSON-LD schema: ${missing_schema}/${total_pages}`,
  ];

  if (errors.length) {
    lines.push(`Errors (${errors.length}): ${errors.join('; ')}`);
  }

  return lines.join('\n');
}
