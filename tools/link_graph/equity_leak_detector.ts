/**
 * tools/link_graph/equity_leak_detector.ts
 *
 * Detects pages that leak link equity through excessive outbound links
 * or followed external links.
 *
 * Never throws.
 */

import type { InternalLink, ExternalLink } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EquityLeak {
  url:                      string;
  total_outbound_links:     number;
  internal_outbound:        number;
  external_outbound:        number;
  nofollow_links:           number;
  followed_external_links:  number;
  equity_per_link:          number;
  leak_severity:            'critical' | 'high' | 'medium' | 'low' | 'none';
  recommendations:          string[];
}

export const EQUITY_THRESHOLDS = {
  critical: 150,
  high:     100,
  medium:   50,
  low:      25,
};

// ── detectEquityLeak ─────────────────────────────────────────────────────────

export function detectEquityLeak(
  page_url:          string,
  outbound_internal: InternalLink[],
  outbound_external: ExternalLink[],
  authority_score:   number,
): EquityLeak {
  const empty: EquityLeak = {
    url: page_url ?? '',
    total_outbound_links: 0,
    internal_outbound: 0,
    external_outbound: 0,
    nofollow_links: 0,
    followed_external_links: 0,
    equity_per_link: 0,
    leak_severity: 'none',
    recommendations: [],
  };

  try {
    const internal = Array.isArray(outbound_internal) ? outbound_internal : [];
    const external = Array.isArray(outbound_external) ? outbound_external : [];

    const internal_outbound = internal.length;
    const external_outbound = external.length;
    const total_outbound_links = internal_outbound + external_outbound;

    const nofollow_internal = internal.filter(l => l?.is_nofollow).length;
    const nofollow_external = external.filter(l => l?.is_nofollow).length;
    const nofollow_links = nofollow_internal + nofollow_external;

    const followed_external_links = external_outbound - nofollow_external;
    const equity_per_link = total_outbound_links > 0
      ? Math.round((100 / total_outbound_links) * 100) / 100
      : 0;

    // Severity
    let leak_severity: EquityLeak['leak_severity'] = 'none';
    if (total_outbound_links >= EQUITY_THRESHOLDS.critical) leak_severity = 'critical';
    else if (total_outbound_links >= EQUITY_THRESHOLDS.high) leak_severity = 'high';
    else if (total_outbound_links >= EQUITY_THRESHOLDS.medium) leak_severity = 'medium';
    else if (total_outbound_links >= EQUITY_THRESHOLDS.low) leak_severity = 'low';

    // Recommendations
    const recommendations: string[] = [];
    if (total_outbound_links > 150) {
      recommendations.push('Remove or nofollow low-value links — page is severely over-linked');
    }
    if (followed_external_links > 10) {
      recommendations.push('Add nofollow to external links to retain internal equity');
    }
    if (total_outbound_links > 50 && total_outbound_links <= 150) {
      recommendations.push('Reduce outbound links to focus equity on priority pages');
    }

    return {
      url: page_url ?? '',
      total_outbound_links,
      internal_outbound,
      external_outbound,
      nofollow_links,
      followed_external_links,
      equity_per_link,
      leak_severity,
      recommendations,
    };
  } catch {
    return empty;
  }
}

// ── detectAllEquityLeaks ─────────────────────────────────────────────────────

export interface EquityLeakDeps {
  loadLinksFn?:  (site_id: string) => Promise<{ internal: InternalLink[]; external: ExternalLink[] }>;
  loadScoresFn?: (site_id: string) => Promise<Map<string, number>>;
}

export async function detectAllEquityLeaks(
  site_id: string,
  deps?:   EquityLeakDeps,
): Promise<EquityLeak[]> {
  try {
    if (!site_id) return [];

    const loadLinks  = deps?.loadLinksFn ?? (async () => ({ internal: [] as InternalLink[], external: [] as ExternalLink[] }));
    const loadScores = deps?.loadScoresFn ?? (async () => new Map<string, number>());

    const { internal, external } = await loadLinks(site_id);
    const scores = await loadScores(site_id);

    if (!Array.isArray(internal)) return [];

    // Group by source_url
    const internalBySource = new Map<string, InternalLink[]>();
    for (const link of internal) {
      if (!link?.source_url) continue;
      const existing = internalBySource.get(link.source_url);
      if (existing) existing.push(link);
      else internalBySource.set(link.source_url, [link]);
    }

    const externalBySource = new Map<string, ExternalLink[]>();
    if (Array.isArray(external)) {
      for (const link of external) {
        if (!link?.source_url) continue;
        const existing = externalBySource.get(link.source_url);
        if (existing) existing.push(link);
        else externalBySource.set(link.source_url, [link]);
      }
    }

    // Detect leaks per page
    const allSourceUrls = new Set([...internalBySource.keys(), ...externalBySource.keys()]);
    const leaks: EquityLeak[] = [];

    for (const url of allSourceUrls) {
      const leak = detectEquityLeak(
        url,
        internalBySource.get(url) ?? [],
        externalBySource.get(url) ?? [],
        scores.get(url) ?? 0,
      );
      leaks.push(leak);
    }

    leaks.sort((a, b) => b.total_outbound_links - a.total_outbound_links);
    return leaks;
  } catch {
    return [];
  }
}
