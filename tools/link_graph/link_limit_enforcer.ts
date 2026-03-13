/**
 * tools/link_graph/link_limit_enforcer.ts
 *
 * Detects pages exceeding the recommended 100-link limit
 * and provides severity + recommendations. Never throws.
 */

import type { InternalLink, ExternalLink } from './link_graph_types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LinkLimitViolation {
  url:                  string;
  title:                string | null;
  total_links:          number;
  internal_links:       number;
  external_links:       number;
  navigation_links:     number;
  footer_links:         number;
  body_content_links:   number;
  over_limit_by:        number;
  severity:             'critical' | 'high' | 'medium';
  recommendations:      string[];
}

export interface LinkLimitScanResult {
  violations:     LinkLimitViolation[];
  critical_count: number;
  high_count:     number;
  medium_count:   number;
  worst_page:     string | null;
}

export interface LinkLimitScanDeps {
  loadPagesFn?: (site_id: string) => Promise<Array<{ url: string; title: string | null }>>;
  loadLinksFn?: (site_id: string) => Promise<{ internal: InternalLink[]; external: ExternalLink[] }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const LINK_LIMITS = {
  soft_limit: 100,
  hard_limit: 200,
  external_nofollow_recommendation: 10,
} as const;

// ── detectLinkLimitViolation ─────────────────────────────────────────────────

export function detectLinkLimitViolation(
  page_url: string,
  page_title: string | null,
  outbound_internal: InternalLink[],
  outbound_external: ExternalLink[],
): LinkLimitViolation | null {
  try {
    if (!page_url) return null;
    const internal = Array.isArray(outbound_internal) ? outbound_internal : [];
    const external = Array.isArray(outbound_external) ? outbound_external : [];
    const total = internal.length + external.length;

    if (total <= LINK_LIMITS.soft_limit) return null;

    const nav = internal.filter((l) => l?.link_type === 'navigation').length;
    const footer = internal.filter((l) => l?.link_type === 'footer').length;
    const body = internal.filter((l) => l?.link_type === 'body_content').length;
    const overBy = total - LINK_LIMITS.soft_limit;

    let severity: 'critical' | 'high' | 'medium';
    if (total >= LINK_LIMITS.hard_limit) severity = 'critical';
    else if (total >= 150) severity = 'high';
    else severity = 'medium';

    const recommendations: string[] = [];
    if (nav > 50) {
      recommendations.push(`Review navigation structure — ${nav} nav links may indicate mega menu issue`);
    }
    if (footer > 30) {
      recommendations.push(`Simplify footer links — ${footer} footer links dilutes equity`);
    }
    if (external.length > LINK_LIMITS.external_nofollow_recommendation) {
      recommendations.push(`Add nofollow to external links to reduce equity leakage`);
    }
    if (overBy > 50) {
      const pct = total > 0 ? Math.round(100 / total) : 0;
      recommendations.push(`Remove ${overBy} low-value links — each link passes ~${pct}% equity`);
    }

    return {
      url: page_url,
      title: page_title,
      total_links: total,
      internal_links: internal.length,
      external_links: external.length,
      navigation_links: nav,
      footer_links: footer,
      body_content_links: body,
      over_limit_by: overBy,
      severity,
      recommendations,
    };
  } catch {
    return null;
  }
}

// ── scanAllPagesForLinkLimits ────────────────────────────────────────────────

export async function scanAllPagesForLinkLimits(
  site_id: string,
  deps?: LinkLimitScanDeps,
): Promise<LinkLimitScanResult> {
  const empty: LinkLimitScanResult = {
    violations: [],
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    worst_page: null,
  };
  try {
    if (!site_id) return empty;

    const loadPages = deps?.loadPagesFn ?? (async () => [] as Array<{ url: string; title: string | null }>);
    const loadLinks = deps?.loadLinksFn ?? (async () => ({ internal: [] as InternalLink[], external: [] as ExternalLink[] }));

    const [pages, links] = await Promise.all([loadPages(site_id), loadLinks(site_id)]);

    // Build per-page link maps
    const internalBySource = new Map<string, InternalLink[]>();
    const externalBySource = new Map<string, ExternalLink[]>();

    for (const l of (links.internal ?? [])) {
      if (!l?.source_url) continue;
      const arr = internalBySource.get(l.source_url) ?? [];
      arr.push(l);
      internalBySource.set(l.source_url, arr);
    }
    for (const l of (links.external ?? [])) {
      if (!l?.source_url) continue;
      const arr = externalBySource.get(l.source_url) ?? [];
      arr.push(l);
      externalBySource.set(l.source_url, arr);
    }

    const violations: LinkLimitViolation[] = [];
    for (const page of (pages ?? [])) {
      if (!page?.url) continue;
      const v = detectLinkLimitViolation(
        page.url,
        page.title,
        internalBySource.get(page.url) ?? [],
        externalBySource.get(page.url) ?? [],
      );
      if (v) violations.push(v);
    }

    violations.sort((a, b) => b.total_links - a.total_links);

    return {
      violations,
      critical_count: violations.filter((v) => v.severity === 'critical').length,
      high_count: violations.filter((v) => v.severity === 'high').length,
      medium_count: violations.filter((v) => v.severity === 'medium').length,
      worst_page: violations[0]?.url ?? null,
    };
  } catch {
    return empty;
  }
}
