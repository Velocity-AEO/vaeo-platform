/**
 * tools/link_graph/link_type_classifier.ts
 *
 * Classifies link types and handles pagination URL patterns.
 * Never throws.
 */

import type { LinkType } from './link_graph_types.js';

// ── Selectors ────────────────────────────────────────────────────────────────

export const NAVIGATION_SELECTORS: string[] = [
  'nav a',
  'header a',
  '[role="navigation"] a',
  '.nav a',
  '.navbar a',
  '.menu a',
  '.site-header a',
  '.main-navigation a',
  '.primary-menu a',
];

export const FOOTER_SELECTORS: string[] = [
  'footer a',
  '.footer a',
  '.site-footer a',
  '[role="contentinfo"] a',
];

export const SIDEBAR_SELECTORS: string[] = [
  'aside a',
  '.sidebar a',
  '.widget a',
  '.side-nav a',
];

export const BREADCRUMB_SELECTORS: string[] = [
  '.breadcrumb a',
  '[aria-label="breadcrumb"] a',
  '.breadcrumbs a',
  'nav[aria-label="breadcrumb"] a',
];

// ── classifyLinkType ─────────────────────────────────────────────────────────

export interface AnchorElement {
  href:             string;
  selector_matches: string[];
  parent_selectors: string[];
  position_in_page: number;
  total_page_links: number;
}

export function classifyLinkType(
  anchor_element: AnchorElement,
  url: string,
): LinkType {
  try {
    const matches   = anchor_element?.selector_matches ?? [];
    const parents   = anchor_element?.parent_selectors ?? [];
    const allTokens = [...matches, ...parents];

    // Breadcrumb — highest priority
    for (const sel of BREADCRUMB_SELECTORS) {
      const token = selectorToToken(sel);
      if (allTokens.some(t => tokenMatches(t, token))) return 'breadcrumb';
    }

    // Navigation
    for (const sel of NAVIGATION_SELECTORS) {
      const token = selectorToToken(sel);
      if (allTokens.some(t => tokenMatches(t, token))) return 'navigation';
    }

    // Footer
    for (const sel of FOOTER_SELECTORS) {
      const token = selectorToToken(sel);
      if (allTokens.some(t => tokenMatches(t, token))) return 'footer';
    }

    // Sidebar
    for (const sel of SIDEBAR_SELECTORS) {
      const token = selectorToToken(sel);
      if (allTokens.some(t => tokenMatches(t, token))) return 'sidebar';
    }

    // Pagination — check URL
    const href = anchor_element?.href ?? url ?? '';
    if (isPaginationUrl(href)) return 'pagination';

    return 'body_content';
  } catch {
    return 'unknown';
  }
}

/** Convert CSS selector like 'nav a' or '.sidebar a' to a matchable token. */
function selectorToToken(sel: string): string {
  // Strip trailing ' a' and whitespace
  return sel.replace(/\s+a$/, '').trim();
}

function tokenMatches(candidate: string, token: string): boolean {
  if (!candidate || !token) return false;
  // Exact match or candidate contains the token
  return candidate === token || candidate.includes(token);
}

// ── isPaginationUrl ───────────────────────────────────────────────────────────

const PAGINATION_PATTERNS = [
  /[?&]page=/i,
  /\/page\//i,
  /[?&]paged=/i,
  /[?&]start=/i,
  /\/p\//i,
  /[?&]offset=/i,
];

export function isPaginationUrl(url: string): boolean {
  try {
    if (!url) return false;
    return PAGINATION_PATTERNS.some(p => p.test(url));
  } catch {
    return false;
  }
}

// ── extractPaginationRoot ─────────────────────────────────────────────────────

export function extractPaginationRoot(url: string): string {
  try {
    if (!url) return url ?? '';

    // Strip /page/N and /p/N path segments
    let result = url
      .replace(/\/page\/\d+\/?/i, '/')
      .replace(/\/p\/\d+\/?/i, '/');

    // Strip query parameters: page=, paged=, start=, offset=
    try {
      const parsed = new URL(result);
      parsed.searchParams.delete('page');
      parsed.searchParams.delete('paged');
      parsed.searchParams.delete('start');
      parsed.searchParams.delete('offset');
      result = parsed.toString();
    } catch {
      // URL may not be absolute — strip via regex
      result = result.replace(/[?&](page|paged|start|offset)=\d+/gi, '');
      result = result.replace(/\?&/, '?').replace(/&&/, '&').replace(/[?&]$/, '');
    }

    return result;
  } catch {
    return url ?? '';
  }
}

// ── groupPaginationUrls ───────────────────────────────────────────────────────

export function groupPaginationUrls(
  urls: string[],
): Array<{ root_url: string; paginated_urls: string[] }> {
  try {
    if (!Array.isArray(urls) || urls.length === 0) return [];

    const groups = new Map<string, string[]>();

    for (const url of urls) {
      if (!isPaginationUrl(url)) continue;
      const root = extractPaginationRoot(url);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(url);
    }

    const result: Array<{ root_url: string; paginated_urls: string[] }> = [];
    for (const [root_url, paginated_urls] of groups) {
      result.push({ root_url, paginated_urls });
    }
    return result;
  } catch {
    return [];
  }
}
