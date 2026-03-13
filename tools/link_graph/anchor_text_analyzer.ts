/**
 * tools/link_graph/anchor_text_analyzer.ts
 *
 * Analyzes anchor text distribution for internal links.
 * Detects generic anchors, over-optimization, and diversity issues.
 *
 * Never throws.
 */

import type { InternalLink } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type AnchorClassification =
  | 'exact_match'
  | 'partial_match'
  | 'branded'
  | 'generic'
  | 'naked_url'
  | 'image_link'
  | 'descriptive';

export interface AnchorDistributionEntry {
  text:           string;
  count:          number;
  percentage:     number;
  classification: AnchorClassification;
}

export interface AnchorTextProfile {
  destination_url:      string;
  total_inbound_links:  number;
  unique_anchor_texts:  number;
  anchor_distribution:  AnchorDistributionEntry[];
  has_generic_anchors:  boolean;
  generic_anchor_count: number;
  is_over_optimized:    boolean;
  dominant_anchor:      string | null;
  diversity_score:      number;
}

export const GENERIC_ANCHORS: string[] = [
  'click here', 'here', 'read more',
  'learn more', 'more', 'this',
  'link', 'click', 'visit', 'go here',
  'this page', 'this post',
  'this article', 'continue reading',
];

// ── classifyAnchorText ───────────────────────────────────────────────────────

export function classifyAnchorText(
  anchor:           string | null,
  destination_url:  string,
  target_keywords?: string[],
): AnchorClassification {
  try {
    if (anchor == null || anchor.trim() === '') return 'image_link';

    const lower = anchor.toLowerCase().trim();

    if (GENERIC_ANCHORS.includes(lower)) return 'generic';

    // Naked URL check
    const destLower = (destination_url ?? '').toLowerCase();
    if (lower === destLower || lower === destLower.replace(/\/$/, '') || destLower.includes(lower.replace(/^https?:\/\//, ''))) {
      if (lower.startsWith('http') || lower.includes('.com') || lower.includes('.org') || lower.includes('/')) {
        return 'naked_url';
      }
    }

    // Keyword matching
    if (Array.isArray(target_keywords) && target_keywords.length > 0) {
      for (const kw of target_keywords) {
        const kwLower = (kw ?? '').toLowerCase().trim();
        if (!kwLower) continue;
        if (lower === kwLower) return 'exact_match';
        if (lower.includes(kwLower) || kwLower.includes(lower)) return 'partial_match';
      }
    }

    return 'descriptive';
  } catch {
    return 'descriptive';
  }
}

// ── calculateDiversityScore ──────────────────────────────────────────────────

export function calculateDiversityScore(
  anchor_distribution: Array<{ text: string; count: number }>,
): number {
  try {
    if (!Array.isArray(anchor_distribution) || anchor_distribution.length === 0) return 0;

    const total = anchor_distribution.reduce((s, e) => s + (e?.count ?? 0), 0);
    if (total === 0) return 0;

    // Shannon entropy
    let entropy = 0;
    for (const entry of anchor_distribution) {
      const p = (entry?.count ?? 0) / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Max entropy for this number of anchors
    const maxEntropy = Math.log2(anchor_distribution.length);
    if (maxEntropy === 0) return 0;

    // Normalize to 0-100
    return Math.round((entropy / maxEntropy) * 100);
  } catch {
    return 0;
  }
}

// ── isOverOptimized ──────────────────────────────────────────────────────────

export function isOverOptimized(
  anchor_distribution: AnchorDistributionEntry[],
): boolean {
  try {
    if (!Array.isArray(anchor_distribution) || anchor_distribution.length === 0) return false;

    const total = anchor_distribution.reduce((s, e) => s + (e?.count ?? 0), 0);
    if (total === 0) return false;

    let exactMatchCount = 0;
    for (const entry of anchor_distribution) {
      if (entry?.classification === 'exact_match') {
        exactMatchCount += entry.count ?? 0;
      }
    }

    return (exactMatchCount / total) > 0.5;
  } catch {
    return false;
  }
}

// ── buildAnchorProfile ───────────────────────────────────────────────────────

export function buildAnchorProfile(
  destination_url: string,
  inbound_links:   InternalLink[],
): AnchorTextProfile {
  const empty: AnchorTextProfile = {
    destination_url: destination_url ?? '',
    total_inbound_links: 0,
    unique_anchor_texts: 0,
    anchor_distribution: [],
    has_generic_anchors: false,
    generic_anchor_count: 0,
    is_over_optimized: false,
    dominant_anchor: null,
    diversity_score: 0,
  };

  try {
    if (!destination_url || !Array.isArray(inbound_links)) return empty;

    const relevant = inbound_links.filter(l => l?.destination_url === destination_url);
    if (relevant.length === 0) return empty;

    // Count anchors
    const anchorCounts = new Map<string, number>();
    for (const link of relevant) {
      const text = (link.anchor_text ?? '').trim() || '[image]';
      anchorCounts.set(text, (anchorCounts.get(text) ?? 0) + 1);
    }

    // Build distribution
    const distribution: AnchorDistributionEntry[] = [];
    for (const [text, count] of anchorCounts) {
      const percentage = Math.round((count / relevant.length) * 100 * 10) / 10;
      distribution.push({
        text,
        count,
        percentage,
        classification: classifyAnchorText(text === '[image]' ? null : text, destination_url),
      });
    }
    distribution.sort((a, b) => b.count - a.count);

    const generic_anchor_count = distribution
      .filter(e => e.classification === 'generic')
      .reduce((s, e) => s + e.count, 0);

    const dominant = distribution.length > 0 ? distribution[0].text : null;

    return {
      destination_url,
      total_inbound_links: relevant.length,
      unique_anchor_texts: anchorCounts.size,
      anchor_distribution: distribution,
      has_generic_anchors: generic_anchor_count > 0,
      generic_anchor_count,
      is_over_optimized: isOverOptimized(distribution),
      dominant_anchor: dominant,
      diversity_score: calculateDiversityScore(
        distribution.map(e => ({ text: e.text, count: e.count })),
      ),
    };
  } catch {
    return empty;
  }
}

// ── analyzeAllAnchors ────────────────────────────────────────────────────────

export interface AnchorAnalyzerDeps {
  loadLinksFn?: (site_id: string) => Promise<InternalLink[]>;
}

export async function analyzeAllAnchors(
  site_id: string,
  deps?:   AnchorAnalyzerDeps,
): Promise<AnchorTextProfile[]> {
  try {
    if (!site_id) return [];

    const loadFn = deps?.loadLinksFn ?? (async () => [] as InternalLink[]);
    const links = await loadFn(site_id);
    if (!Array.isArray(links) || links.length === 0) return [];

    // Collect unique destination URLs
    const destinations = new Set<string>();
    for (const link of links) {
      if (link?.destination_url) destinations.add(link.destination_url);
    }

    const profiles: AnchorTextProfile[] = [];
    for (const destUrl of destinations) {
      profiles.push(buildAnchorProfile(destUrl, links));
    }

    // Sort by generic_anchor_count desc (worst first)
    profiles.sort((a, b) => b.generic_anchor_count - a.generic_anchor_count);
    return profiles;
  } catch {
    return [];
  }
}
