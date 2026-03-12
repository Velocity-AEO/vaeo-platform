/**
 * tools/detect/resource_hint_detect.ts
 *
 * Detects third-party domains loaded by a page and identifies
 * which ones are missing <link rel="preconnect"> / <link rel="dns-prefetch"> hints.
 *
 * Pure function — never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResourceHintSignals {
  external_domains:    string[];
  has_preconnect:      string[];
  has_dns_prefetch:    string[];
  missing_preconnect:  string[];
  missing_dns_prefetch: string[];
  needs_hints:         boolean;
}

// ── Priority domains worth hinting ───────────────────────────────────────────

export const PRIORITY_DOMAINS: Record<string, string> = {
  'fonts.googleapis.com':         'Google Fonts CSS',
  'fonts.gstatic.com':            'Google Fonts files',
  'cdn.shopify.com':              'Shopify CDN',
  'monorail-edge.shopifysvc.com': 'Shopify analytics',
  'connect.facebook.net':         'Facebook pixel',
  'www.googletagmanager.com':     'Google Tag Manager',
  'www.google-analytics.com':     'Google Analytics',
  'static.klaviyo.com':           'Klaviyo',
  'fast.fonts.net':               'Font CDN',
  'use.typekit.net':              'Adobe Fonts',
  'js.hs-scripts.com':            'HubSpot',
  'widget.intercom.io':           'Intercom',
};

// ── Regex patterns ────────────────────────────────────────────────────────────

// Match src, href, action attributes with external URLs (https:// or //)
const EXTERNAL_URL_RE = /(?:src|href|action)\s*=\s*["']((?:https?:)?\/\/[^"'\s>?#]+)/gi;

// Match entire <link ...> tags
const LINK_TAG_RE     = /<link[^>]+>/gi;

// Extract rel and href from link tags
const REL_RE          = /\brel\s*=\s*["']([^"']+)["']/i;
const HREF_ATTR_RE    = /\bhref\s*=\s*["']([^"']+)["']/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hostnameFromUrl(raw: string): string {
  try {
    const href = raw.startsWith('//') ? 'https:' + raw : raw;
    return new URL(href).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pageHostname(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectResourceHints(html: string, url: string): ResourceHintSignals {
  try {
    if (!html || typeof html !== 'string') return emptySignals();

    const origin = pageHostname(url);

    // 1. Collect all external domains from src/href/action attributes
    const externalSet = new Set<string>();
    EXTERNAL_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXTERNAL_URL_RE.exec(html)) !== null) {
      const hostname = hostnameFromUrl(m[1] ?? '');
      if (hostname && hostname !== origin) {
        externalSet.add(hostname);
      }
    }
    const external_domains = [...externalSet];

    // 2. Scan existing <link> tags for preconnect / dns-prefetch
    const preconnectSet   = new Set<string>();
    const dnsPrefetchSet  = new Set<string>();
    LINK_TAG_RE.lastIndex = 0;
    while ((m = LINK_TAG_RE.exec(html)) !== null) {
      const tag  = m[0];
      const rel  = REL_RE.exec(tag)?.[1]?.toLowerCase().trim() ?? '';
      const href = HREF_ATTR_RE.exec(tag)?.[1] ?? '';
      const hn   = hostnameFromUrl(href);
      if (!hn) continue;
      if (rel === 'preconnect')   preconnectSet.add(hn);
      if (rel === 'dns-prefetch') dnsPrefetchSet.add(hn);
    }
    const has_preconnect  = [...preconnectSet];
    const has_dns_prefetch = [...dnsPrefetchSet];

    // 3. Compute missing hints for priority domains that appear on this page
    const priorityOnPage = external_domains.filter((d) => d in PRIORITY_DOMAINS);

    const missing_preconnect  = priorityOnPage.filter((d) => !preconnectSet.has(d));
    const missing_dns_prefetch = priorityOnPage.filter((d) => !dnsPrefetchSet.has(d));

    const needs_hints = missing_preconnect.length > 0 || missing_dns_prefetch.length > 0;

    return {
      external_domains,
      has_preconnect,
      has_dns_prefetch,
      missing_preconnect,
      missing_dns_prefetch,
      needs_hints,
    };
  } catch {
    return emptySignals();
  }
}

function emptySignals(): ResourceHintSignals {
  return {
    external_domains:     [],
    has_preconnect:       [],
    has_dns_prefetch:     [],
    missing_preconnect:   [],
    missing_dns_prefetch: [],
    needs_hints:          false,
  };
}
