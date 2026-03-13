/**
 * tools/link_graph/sitemap_loader.ts
 *
 * Loads sitemaps, handles sitemap index files, and finds discrepancies.
 * Never throws.
 */

import { isPaginationUrl } from './link_type_classifier.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SitemapLoadResult {
  urls:        string[];
  sitemap_url: string;
  found:       boolean;
  url_count:   number;
  loaded_at:   string;
}

// ── SITEMAP_PATHS ────────────────────────────────────────────────────────────

export const SITEMAP_PATHS: string[] = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml',
  '/pages-sitemap.xml',
  '/products-sitemap.xml',
  '/blogs-sitemap.xml',
  '/collections-sitemap.xml',
];

// ── loadSitemap ───────────────────────────────────────────────────────────────

export async function loadSitemap(
  site_domain: string,
  deps?:       { fetchFn?: (url: string) => Promise<string> },
): Promise<SitemapLoadResult> {
  try {
    const domain = normaliseDomain(site_domain ?? '');
    const fetchFn = deps?.fetchFn ?? defaultFetchFn;
    const loaded_at = new Date().toISOString();

    for (const path of SITEMAP_PATHS) {
      const sitemap_url = `https://${domain}${path}`;
      try {
        const xml = await fetchFn(sitemap_url);
        if (!xml) continue;

        const urls = await parseSitemapXml(xml, domain, fetchFn);
        if (urls.length === 0 && !xml.includes('<loc>')) continue;

        return { urls, sitemap_url, found: true, url_count: urls.length, loaded_at };
      } catch {
        // Try next path
      }
    }

    return { urls: [], sitemap_url: '', found: false, url_count: 0, loaded_at };
  } catch {
    return { urls: [], sitemap_url: '', found: false, url_count: 0, loaded_at: new Date().toISOString() };
  }
}

// ── parseSitemapXml ───────────────────────────────────────────────────────────

async function parseSitemapXml(
  xml:      string,
  domain:   string,
  fetchFn:  (url: string) => Promise<string>,
): Promise<string[]> {
  try {
    // Check if it's a sitemap index (contains <sitemapindex> or <sitemap> with <loc>)
    const isSitemapIndex = /<sitemapindex/i.test(xml) ||
      (/<sitemap>/i.test(xml) && /<loc>/i.test(xml) && !/<url>/i.test(xml));

    if (isSitemapIndex) {
      // Extract child sitemap URLs
      const childUrls = extractLocs(xml);
      const allUrls: string[] = [];

      for (const childUrl of childUrls) {
        try {
          const childXml = await fetchFn(childUrl);
          if (childXml) {
            const childUrls2 = extractLocs(childXml);
            allUrls.push(...childUrls2);
          }
        } catch {
          // Non-fatal — skip failed child sitemap
        }
      }
      return [...new Set(allUrls)];
    }

    // Regular sitemap — extract all <loc> values inside <url> tags
    return extractLocs(xml);
  } catch {
    return [];
  }
}

function extractLocs(xml: string): string[] {
  try {
    const locs: string[] = [];
    const re = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      locs.push(m[1]!.trim());
    }
    return [...new Set(locs)];
  } catch {
    return [];
  }
}

// ── findSitemapDiscrepancies ──────────────────────────────────────────────────

const PROTECTED_PATTERNS = [
  /\/account/i,
  /\/cart/i,
  /\/checkout/i,
  /\/login/i,
  /\/admin/i,
  /\/wp-admin/i,
  /\/my-account/i,
  /\/dashboard/i,
  /\/password/i,
  /\/logout/i,
];

export function findSitemapDiscrepancies(
  sitemap_urls:     string[],
  crawled_urls:     string[],
  exclude_patterns: string[],
): string[] {
  try {
    if (!Array.isArray(sitemap_urls)) return [];
    const crawledSet = new Set((crawled_urls ?? []).map(u => u.toLowerCase()));
    const userExclude = (exclude_patterns ?? []).map(p => {
      try { return new RegExp(p, 'i'); } catch { return null; }
    }).filter(Boolean) as RegExp[];

    return sitemap_urls.filter(url => {
      try {
        // Skip pagination URLs
        if (isPaginationUrl(url)) return false;
        // Skip protected routes
        if (PROTECTED_PATTERNS.some(p => p.test(url))) return false;
        // Skip user-supplied excludes
        if (userExclude.some(p => p.test(url))) return false;
        // Discrepancy = sitemap URL not in crawled set
        return !crawledSet.has(url.toLowerCase());
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseDomain(domain: string): string {
  try {
    return domain.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
  } catch {
    return domain ?? '';
  }
}

async function defaultFetchFn(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
