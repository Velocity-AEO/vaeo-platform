/**
 * tools/link_graph/link_extractor.ts
 *
 * Extracts internal and external links from HTML and (optionally) Playwright.
 * Never throws.
 */

import type { InternalLink, ExternalLink, LinkSource } from './link_graph_types.js';
import {
  classifyLinkType,
  isPaginationUrl,
} from './link_type_classifier.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const LINK_LIMIT_PER_PAGE = 100;

export function exceedsLinkLimit(total_links: number): boolean {
  try {
    return (total_links ?? 0) > LINK_LIMIT_PER_PAGE;
  } catch {
    return false;
  }
}

export function countLinksPerPage(links: InternalLink[], external: ExternalLink[]): number {
  try {
    return (links?.length ?? 0) + (external?.length ?? 0);
  } catch {
    return 0;
  }
}

// ── LinkExtractionResult ─────────────────────────────────────────────────────

export interface LinkExtractionResult {
  url:              string;
  internal_links:   InternalLink[];
  external_links:   ExternalLink[];
  extraction_source: LinkSource;
  extracted_at:     string;
}

function emptyResult(url: string, source: LinkSource): LinkExtractionResult {
  return {
    url,
    internal_links:   [],
    external_links:   [],
    extraction_source: source,
    extracted_at:     new Date().toISOString(),
  };
}

// ── extractLinksFromHTML ─────────────────────────────────────────────────────

export function extractLinksFromHTML(
  html:        string,
  page_url:    string,
  site_domain: string,
): LinkExtractionResult {
  try {
    const h = html ?? '';
    const now = new Date().toISOString();

    // Normalise site_domain (strip protocol, trailing slash)
    const domain = normaliseDomain(site_domain ?? '');

    // Collect all <a href="..."> occurrences
    const anchorRe = /<a\s([^>]*)>/gi;
    const internal_links: InternalLink[] = [];
    const external_links: ExternalLink[] = [];
    const seenPairs = new Set<string>();

    let match: RegExpExecArray | null;
    let position = 0;

    while ((match = anchorRe.exec(h)) !== null) {
      const attrs = match[1] ?? '';

      const href = extractAttr(attrs, 'href');
      if (!href) continue;

      // Skip fragment-only, mailto, tel, javascript
      if (href.startsWith('#')) continue;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;

      const absolute = resolveUrl(href, page_url);
      if (!absolute) continue;

      // Deduplicate by source+destination
      const pairKey = `${page_url}::${absolute}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const anchor_text = extractInnerText(h, match.index) || null;
      const is_nofollow = hasNofollow(attrs);
      const is_internal = isInternalUrl(absolute, domain);

      if (is_internal) {
        const selector_matches = guessSelectorMatches(h, match.index);
        const link_type = classifyLinkType(
          {
            href:             absolute,
            selector_matches,
            parent_selectors: selector_matches,
            position_in_page: position,
            total_page_links: 0,
          },
          absolute,
        );

        internal_links.push({
          source_url:           page_url,
          destination_url:      absolute,
          anchor_text,
          link_type,
          link_source:          'html_static',
          is_nofollow,
          is_redirect:          false,
          redirect_destination: null,
          position_in_page:     position,
          discovered_at:        now,
        });
      } else {
        external_links.push({
          source_url:         page_url,
          destination_url:    absolute,
          destination_domain: extractDomain(absolute),
          anchor_text,
          is_nofollow,
          status_code:        null,
          is_broken:          false,
          discovered_at:      now,
        });
      }

      position++;
    }

    return { url: page_url, internal_links, external_links, extraction_source: 'html_static', extracted_at: now };
  } catch {
    return emptyResult(page_url ?? '', 'html_static');
  }
}

// ── extractLinksWithPlaywright ────────────────────────────────────────────────

export async function extractLinksWithPlaywright(
  url:         string,
  site_domain: string,
  deps?:       { launchFn?: (...args: any[]) => any },
): Promise<LinkExtractionResult> {
  try {
    // If a launchFn is injected (for testing), use it
    if (deps?.launchFn) {
      const html = await deps.launchFn(url);
      return extractLinksFromHTML(html ?? '', url, site_domain);
    }

    // Real Playwright path — import dynamically to avoid hard dep at module load
    const playwright = await import('playwright').catch(() => null);
    if (!playwright) return emptyResult(url, 'js_rendered');

    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      const html = await page.content();
      await browser.close();

      const result = extractLinksFromHTML(html, url, site_domain);
      // Mark all as js_rendered
      return {
        ...result,
        extraction_source: 'js_rendered',
        internal_links: result.internal_links.map(l => ({ ...l, link_source: 'js_rendered' as LinkSource })),
        external_links: result.external_links,
      };
    } catch {
      await browser.close().catch(() => {});
      return emptyResult(url, 'js_rendered');
    }
  } catch {
    return emptyResult(url ?? '', 'js_rendered');
  }
}

// ── mergeExtractionResults ────────────────────────────────────────────────────

export function mergeExtractionResults(
  html_result: LinkExtractionResult,
  js_result:   LinkExtractionResult,
): LinkExtractionResult {
  try {
    const now = new Date().toISOString();
    const url = html_result?.url ?? js_result?.url ?? '';

    // Build a set of pairs already known from HTML
    const htmlPairs = new Set(
      (html_result?.internal_links ?? []).map(l => `${l.source_url}::${l.destination_url}`),
    );
    const htmlExtPairs = new Set(
      (html_result?.external_links ?? []).map(l => `${l.source_url}::${l.destination_url}`),
    );

    // JS-only internal links
    const jsOnlyInternal = (js_result?.internal_links ?? []).filter(
      l => !htmlPairs.has(`${l.source_url}::${l.destination_url}`),
    ).map(l => ({ ...l, link_source: 'js_rendered' as LinkSource }));

    const jsOnlyExternal = (js_result?.external_links ?? []).filter(
      l => !htmlExtPairs.has(`${l.source_url}::${l.destination_url}`),
    );

    return {
      url,
      internal_links:   [...(html_result?.internal_links ?? []), ...jsOnlyInternal],
      external_links:   [...(html_result?.external_links ?? []), ...jsOnlyExternal],
      extraction_source: 'html_static', // primary source
      extracted_at:     now,
    };
  } catch {
    return html_result ?? emptyResult('', 'html_static');
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function normaliseDomain(domain: string): string {
  try {
    return domain.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
  } catch {
    return domain ?? '';
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isInternalUrl(absolute: string, domain: string): boolean {
  try {
    const parsed = new URL(absolute);
    return parsed.hostname.toLowerCase() === domain || parsed.hostname.toLowerCase().endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function resolveUrl(href: string, page_url: string): string | null {
  try {
    if (/^https?:\/\//i.test(href)) return href;
    if (!page_url) return null;
    return new URL(href, page_url).toString();
  } catch {
    return null;
  }
}

function extractAttr(attrs: string, name: string): string | null {
  try {
    const re = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i');
    const m = attrs.match(re);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

function hasNofollow(attrs: string): boolean {
  try {
    const rel = extractAttr(attrs, 'rel') ?? '';
    return rel.toLowerCase().includes('nofollow');
  } catch {
    return false;
  }
}

function extractInnerText(html: string, anchorStart: number): string {
  try {
    // Find the closing > of the opening <a tag
    const openTagEnd = html.indexOf('>', anchorStart);
    if (openTagEnd === -1) return '';
    const closeTag = html.indexOf('</a>', openTagEnd);
    if (closeTag === -1) return '';
    const inner = html.slice(openTagEnd + 1, closeTag);
    // Strip tags
    return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/** Best-effort: guess CSS selector tokens based on surrounding HTML context. */
function guessSelectorMatches(html: string, anchorStart: number): string[] {
  try {
    const tokens: string[] = [];
    // Look back up to 2000 chars for enclosing tags
    const context = html.slice(Math.max(0, anchorStart - 2000), anchorStart);
    const tagRe = /<(nav|header|footer|aside|[a-z]+)\s([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(context)) !== null) {
      const tag = m[1]!.toLowerCase();
      const attrs = m[2] ?? '';
      // Check class
      const classMatch = attrs.match(/\bclass=["']([^"']*)["']/i);
      if (classMatch) {
        for (const cls of classMatch[1]!.split(/\s+/)) {
          if (cls) tokens.push(`.${cls}`);
        }
      }
      // Check role
      const roleMatch = attrs.match(/\brole=["']([^"']*)["']/i);
      if (roleMatch) tokens.push(`[role="${roleMatch[1]}"]`);
      // Check aria-label
      const ariaMatch = attrs.match(/\baria-label=["']([^"']*)["']/i);
      if (ariaMatch) tokens.push(`[aria-label="${ariaMatch[1]}"]`);
      tokens.push(tag);
    }
    return tokens;
  } catch {
    return [];
  }
}
