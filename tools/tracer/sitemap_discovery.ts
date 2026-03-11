/**
 * tools/tracer/sitemap_discovery.ts
 *
 * Discovers URLs from a site's sitemap.xml for tracer crawling.
 *
 * Handles:
 *   - Regular <urlset> sitemaps
 *   - <sitemapindex> with recursive child fetching (max 3 levels)
 *   - Shopify-specific sitemap query params
 *   - System URL filtering (cart, checkout, account, etc.)
 *   - Configurable max URL limit
 *
 * Injectable fetch for testing. Never throws.
 */

import { isSystemUrl } from '../../packages/core/src/triage/triage_engine.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SitemapURL {
  url:          string;
  lastmod?:     string;
  priority?:    number;
  changefreq?:  string;
}

export interface DiscoverOptions {
  maxUrls?:        number;
  includeImages?:  boolean;
  fetch?:          typeof globalThis.fetch;
}

// ── XML parsing ───────────────────────────────────────────────────────────────

/** Extract <loc> values from XML. */
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

/** Extract full <url> entries with optional lastmod/priority/changefreq. */
function extractUrlEntries(xml: string): SitemapURL[] {
  const entries: SitemapURL[] = [];
  const re = /<url>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]!;
    const locMatch       = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/i.exec(block);
    if (!locMatch?.[1]) continue;

    const lastmodMatch   = /<lastmod>\s*([^<]+)\s*<\/lastmod>/i.exec(block);
    const priorityMatch  = /<priority>\s*([^<]+)\s*<\/priority>/i.exec(block);
    const changefreqMatch = /<changefreq>\s*([^<]+)\s*<\/changefreq>/i.exec(block);

    const entry: SitemapURL = { url: locMatch[1].trim() };
    if (lastmodMatch?.[1])    entry.lastmod    = lastmodMatch[1].trim();
    if (priorityMatch?.[1])   entry.priority   = parseFloat(priorityMatch[1].trim());
    if (changefreqMatch?.[1]) entry.changefreq = changefreqMatch[1].trim();
    entries.push(entry);
  }
  return entries;
}

/** Check if XML is a sitemap index. */
function isSitemapIndex(xml: string): boolean {
  return xml.includes('<sitemapindex');
}

// ── Core fetching ─────────────────────────────────────────────────────────────

async function fetchXml(
  url: string,
  fetchFn: typeof globalThis.fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchSitemapRecursive(
  url: string,
  fetchFn: typeof globalThis.fetch,
  depth: number,
  maxDepth: number,
): Promise<SitemapURL[]> {
  if (depth > maxDepth) return [];

  const xml = await fetchXml(url, fetchFn);
  if (!xml) return [];

  if (isSitemapIndex(xml)) {
    const childUrls = extractLocs(xml);
    const results: SitemapURL[] = [];
    for (const childUrl of childUrls) {
      results.push(...await fetchSitemapRecursive(childUrl, fetchFn, depth + 1, maxDepth));
    }
    return results;
  }

  return extractUrlEntries(xml);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Discover URLs from a site's sitemap.
 * Tries /sitemap.xml first, falls back to /sitemap_index.xml.
 * Filters system URLs. Respects maxUrls limit.
 */
export async function discoverURLs(
  siteUrl: string,
  options?: DiscoverOptions,
): Promise<SitemapURL[]> {
  const maxUrls = options?.maxUrls ?? 500;
  const fetchFn = options?.fetch ?? globalThis.fetch;

  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return [];
  }

  // Try /sitemap.xml first
  let entries = await fetchSitemapRecursive(`${origin}/sitemap.xml`, fetchFn, 0, 3);

  // Fallback to /sitemap_index.xml
  if (entries.length === 0) {
    entries = await fetchSitemapRecursive(`${origin}/sitemap_index.xml`, fetchFn, 0, 3);
  }

  // Filter system URLs and deduplicate
  const seen = new Set<string>();
  const filtered: SitemapURL[] = [];
  for (const entry of entries) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    if (isSystemUrl(entry.url)) continue;
    // Filter to same origin
    try {
      if (new URL(entry.url).origin !== origin) continue;
    } catch { continue; }
    filtered.push(entry);
    if (filtered.length >= maxUrls) break;
  }

  return filtered;
}

/**
 * Shopify-specific URL discovery.
 * Also checks Shopify sitemap query params for products and collections.
 */
export async function discoverShopifyURLs(
  storeUrl: string,
  options?: { fetch?: typeof globalThis.fetch },
): Promise<SitemapURL[]> {
  const fetchFn = options?.fetch ?? globalThis.fetch;

  let origin: string;
  try {
    origin = new URL(storeUrl).origin;
  } catch {
    return [];
  }

  // Fetch main sitemap + Shopify-specific sitemaps
  const urls = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap.xml?sitemap=products`,
    `${origin}/sitemap.xml?sitemap=collections`,
  ];

  const allEntries: SitemapURL[] = [];
  for (const url of urls) {
    allEntries.push(...await fetchSitemapRecursive(url, fetchFn, 0, 3));
  }

  // Deduplicate and filter
  const seen = new Set<string>();
  const filtered: SitemapURL[] = [];
  for (const entry of allEntries) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    if (isSystemUrl(entry.url)) continue;
    try {
      if (new URL(entry.url).origin !== origin) continue;
    } catch { continue; }
    filtered.push(entry);
  }

  return filtered;
}
