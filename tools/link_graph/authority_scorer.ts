/**
 * tools/link_graph/authority_scorer.ts
 *
 * Scores internal pages by link authority using weighted inbound link analysis.
 * Never throws.
 */

import type { InternalLink, PageNode } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthorityScore {
  url:                    string;
  raw_score:              number;
  normalized_score:       number;
  inbound_count:          number;
  body_content_inbound:   number;
  navigation_inbound:     number;
  depth_from_homepage:    number | null;
  authority_tier:         'hub' | 'strong' | 'average' | 'weak' | 'isolated';
}

export const AUTHORITY_WEIGHTS: Record<string, number> = {
  body_content_link: 3.0,
  breadcrumb_link:   2.0,
  sidebar_link:      1.5,
  navigation_link:   0.5,
  footer_link:       0.3,
  pagination_link:   0.1,
};

// ── calculateRawAuthority ────────────────────────────────────────────────────

export function calculateRawAuthority(
  url:           string,
  inbound_links: InternalLink[],
): number {
  try {
    if (!url || !Array.isArray(inbound_links)) return 0;
    let score = 0;
    for (const link of inbound_links) {
      if (link?.destination_url !== url) continue;
      const lt = link.link_type ?? '';
      const weightKey = `${lt}_link`;
      const weight = AUTHORITY_WEIGHTS[weightKey] ?? 1.0;
      score += weight;
    }
    return Math.round(score * 100) / 100;
  } catch {
    return 0;
  }
}

// ── normalizeAuthorityScores ─────────────────────────────────────────────────

export function normalizeAuthorityScores(
  raw_scores: Map<string, number>,
): Map<string, number> {
  try {
    const result = new Map<string, number>();
    if (!raw_scores || typeof raw_scores.entries !== 'function') return result;

    let maxScore = 0;
    for (const [, score] of raw_scores) {
      if (score > maxScore) maxScore = score;
    }
    if (maxScore === 0) {
      for (const [url] of raw_scores) result.set(url, 0);
      return result;
    }

    for (const [url, score] of raw_scores) {
      result.set(url, Math.round((score / maxScore) * 100 * 100) / 100);
    }
    return result;
  } catch {
    return new Map();
  }
}

// ── classifyAuthorityTier ────────────────────────────────────────────────────

export function classifyAuthorityTier(
  normalized_score: number,
  inbound_count:    number,
): AuthorityScore['authority_tier'] {
  try {
    const s = typeof normalized_score === 'number' ? normalized_score : 0;
    const c = typeof inbound_count === 'number' ? inbound_count : 0;
    if (s === 0 && c === 0) return 'isolated';
    if (s >= 80) return 'hub';
    if (s >= 60) return 'strong';
    if (s >= 30) return 'average';
    return 'weak';
  } catch {
    return 'isolated';
  }
}

// ── scoreAllPages ────────────────────────────────────────────────────────────

export interface AuthorityScorerDeps {
  loadLinksFn?: (site_id: string) => Promise<InternalLink[]>;
  loadPagesFn?: (site_id: string) => Promise<PageNode[]>;
}

export async function scoreAllPages(
  site_id: string,
  deps?:   AuthorityScorerDeps,
): Promise<AuthorityScore[]> {
  try {
    if (!site_id) return [];

    const loadLinks = deps?.loadLinksFn ?? (async () => [] as InternalLink[]);
    const loadPages = deps?.loadPagesFn ?? (async () => [] as PageNode[]);

    const links = await loadLinks(site_id);
    const pages = await loadPages(site_id);

    if (!Array.isArray(links) || !Array.isArray(pages)) return [];

    // Collect all destination URLs
    const allUrls = new Set<string>();
    for (const p of pages) if (p?.url) allUrls.add(p.url);
    for (const l of links) {
      if (l?.destination_url) allUrls.add(l.destination_url);
      if (l?.source_url) allUrls.add(l.source_url);
    }

    // Calculate raw scores
    const rawScores = new Map<string, number>();
    for (const url of allUrls) {
      rawScores.set(url, calculateRawAuthority(url, links));
    }

    // Normalize
    const normalized = normalizeAuthorityScores(rawScores);

    // Build AuthorityScore objects
    const results: AuthorityScore[] = [];
    for (const url of allUrls) {
      const inbound = links.filter(l => l?.destination_url === url);
      const inbound_count = inbound.length;
      const body_content_inbound = inbound.filter(l => l?.link_type === 'body_content').length;
      const navigation_inbound = inbound.filter(l => l?.link_type === 'navigation').length;
      const norm = normalized.get(url) ?? 0;
      const page = pages.find(p => p?.url === url);

      results.push({
        url,
        raw_score: rawScores.get(url) ?? 0,
        normalized_score: norm,
        inbound_count,
        body_content_inbound,
        navigation_inbound,
        depth_from_homepage: page?.depth_from_homepage ?? null,
        authority_tier: classifyAuthorityTier(norm, inbound_count),
      });
    }

    results.sort((a, b) => b.normalized_score - a.normalized_score);
    return results;
  } catch {
    return [];
  }
}

// ── getTopAuthorityPages ─────────────────────────────────────────────────────

export function getTopAuthorityPages(
  scores: AuthorityScore[],
  limit:  number,
): AuthorityScore[] {
  try {
    if (!Array.isArray(scores)) return [];
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : 10;
    return [...scores]
      .sort((a, b) => b.normalized_score - a.normalized_score)
      .slice(0, safeLimit);
  } catch {
    return [];
  }
}
