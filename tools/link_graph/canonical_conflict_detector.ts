/**
 * tools/link_graph/canonical_conflict_detector.ts
 *
 * Detects internal links pointing to non-canonical URLs,
 * canonical chains, and missing canonicals. Never throws.
 */

import type { InternalLink, PageNode } from './link_graph_types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type CanonicalConflictType =
  | 'links_to_non_canonical'
  | 'canonical_chain'
  | 'self_canonical_mismatch'
  | 'missing_canonical_on_target';

export interface CanonicalConflict {
  source_url:    string;
  linked_url:    string;
  canonical_url: string | null;
  conflict_type: CanonicalConflictType;
  equity_impact: 'high' | 'medium' | 'low';
  fix_action:    'update_link_to_canonical' | 'add_canonical_to_target' | 'investigate';
  fix_href:      string | null;
  description:   string;
}

export interface CanonicalScanResult {
  conflicts:        CanonicalConflict[];
  total_conflicts:  number;
  high_impact_count: number;
  fixable_count:    number;
  summary_by_type:  Record<CanonicalConflictType, number>;
}

export interface CanonicalScanDeps {
  loadLinksFn?: (site_id: string) => Promise<InternalLink[]>;
  loadPagesFn?: (site_id: string) => Promise<PageNode[]>;
}

// ── resolveCanonicalChain ────────────────────────────────────────────────────

export function resolveCanonicalChain(
  start_url: string,
  page_nodes: PageNode[],
  max_depth: number = 5,
): string {
  try {
    if (!start_url || !Array.isArray(page_nodes)) return start_url ?? '';
    const nodeMap = new Map<string, PageNode>();
    for (const p of page_nodes) {
      if (p?.url) nodeMap.set(p.url, p);
    }

    let current = start_url;
    const visited = new Set<string>();
    for (let i = 0; i < max_depth; i++) {
      if (visited.has(current)) break;
      visited.add(current);
      const node = nodeMap.get(current);
      if (!node?.canonical_url || node.canonical_url === current) break;
      current = node.canonical_url;
    }
    return current;
  } catch {
    return start_url ?? '';
  }
}

// ── detectCanonicalConflicts ─────────────────────────────────────────────────

export function detectCanonicalConflicts(
  internal_links: InternalLink[],
  page_nodes: PageNode[],
): CanonicalConflict[] {
  try {
    if (!Array.isArray(internal_links) || !Array.isArray(page_nodes)) return [];

    const nodeMap = new Map<string, PageNode>();
    for (const p of page_nodes) {
      if (p?.url) nodeMap.set(p.url, p);
    }

    const seen = new Set<string>();
    const conflicts: CanonicalConflict[] = [];

    for (const link of internal_links) {
      if (!link?.source_url || !link?.destination_url) continue;
      const key = `${link.source_url}|${link.destination_url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const dest = nodeMap.get(link.destination_url);
      if (!dest) continue;

      // Case 1: links_to_non_canonical
      if (dest.is_canonical === false && dest.canonical_url && dest.canonical_url !== dest.url) {
        // Check for canonical chain (Case 2)
        const finalCanonical = resolveCanonicalChain(dest.canonical_url, page_nodes, 5);
        if (finalCanonical !== dest.canonical_url) {
          conflicts.push({
            source_url: link.source_url,
            linked_url: link.destination_url,
            canonical_url: finalCanonical,
            conflict_type: 'canonical_chain',
            equity_impact: 'high',
            fix_action: 'update_link_to_canonical',
            fix_href: finalCanonical,
            description: `Link goes through a canonical chain: ${link.destination_url} → ${dest.canonical_url} → ${finalCanonical}`,
          });
        } else {
          conflicts.push({
            source_url: link.source_url,
            linked_url: link.destination_url,
            canonical_url: dest.canonical_url,
            conflict_type: 'links_to_non_canonical',
            equity_impact: 'high',
            fix_action: 'update_link_to_canonical',
            fix_href: dest.canonical_url,
            description: `Internal link points to non-canonical URL. Canonical is ${dest.canonical_url}`,
          });
        }
        continue;
      }

      // Case 3: self_canonical_mismatch
      if (dest.canonical_url && dest.canonical_url !== dest.url) {
        try {
          const destDomain = new URL(dest.url).hostname;
          const canonDomain = new URL(dest.canonical_url).hostname;
          if (destDomain === canonDomain) {
            conflicts.push({
              source_url: link.source_url,
              linked_url: link.destination_url,
              canonical_url: dest.canonical_url,
              conflict_type: 'self_canonical_mismatch',
              equity_impact: 'medium',
              fix_action: 'update_link_to_canonical',
              fix_href: dest.canonical_url,
              description: `Page declares a different canonical on the same domain: ${dest.canonical_url}`,
            });
            continue;
          }
        } catch {
          // URL parsing failed, skip
        }
      }

      // Case 4: missing_canonical_on_target
      if (!dest.canonical_url && !dest.is_noindex && dest.inbound_internal_count > 1) {
        conflicts.push({
          source_url: link.source_url,
          linked_url: link.destination_url,
          canonical_url: null,
          conflict_type: 'missing_canonical_on_target',
          equity_impact: 'low',
          fix_action: 'add_canonical_to_target',
          fix_href: null,
          description: `Target page has no canonical tag and ${dest.inbound_internal_count} inbound links`,
        });
      }
    }

    return conflicts;
  } catch {
    return [];
  }
}

// ── groupConflictsByType ─────────────────────────────────────────────────────

export function groupConflictsByType(
  conflicts: CanonicalConflict[],
): Record<CanonicalConflictType, CanonicalConflict[]> {
  const result: Record<CanonicalConflictType, CanonicalConflict[]> = {
    links_to_non_canonical: [],
    canonical_chain: [],
    self_canonical_mismatch: [],
    missing_canonical_on_target: [],
  };
  try {
    if (!Array.isArray(conflicts)) return result;
    for (const c of conflicts) {
      if (c?.conflict_type && result[c.conflict_type]) {
        result[c.conflict_type].push(c);
      }
    }
    return result;
  } catch {
    return result;
  }
}

// ── prioritizeConflicts ──────────────────────────────────────────────────────

const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const TYPE_ORDER: Record<string, number> = {
  links_to_non_canonical: 0,
  canonical_chain: 1,
  self_canonical_mismatch: 2,
  missing_canonical_on_target: 3,
};

export function prioritizeConflicts(
  conflicts: CanonicalConflict[],
): CanonicalConflict[] {
  try {
    if (!Array.isArray(conflicts)) return [];
    return [...conflicts].sort((a, b) => {
      const impactDiff = (IMPACT_ORDER[a.equity_impact] ?? 2) - (IMPACT_ORDER[b.equity_impact] ?? 2);
      if (impactDiff !== 0) return impactDiff;
      return (TYPE_ORDER[a.conflict_type] ?? 3) - (TYPE_ORDER[b.conflict_type] ?? 3);
    });
  } catch {
    return [];
  }
}

// ── scanSiteForCanonicalConflicts ────────────────────────────────────────────

export async function scanSiteForCanonicalConflicts(
  site_id: string,
  deps?: CanonicalScanDeps,
): Promise<CanonicalScanResult> {
  const empty: CanonicalScanResult = {
    conflicts: [],
    total_conflicts: 0,
    high_impact_count: 0,
    fixable_count: 0,
    summary_by_type: {
      links_to_non_canonical: 0,
      canonical_chain: 0,
      self_canonical_mismatch: 0,
      missing_canonical_on_target: 0,
    },
  };
  try {
    if (!site_id) return empty;
    const loadLinks = deps?.loadLinksFn ?? (async () => [] as InternalLink[]);
    const loadPages = deps?.loadPagesFn ?? (async () => [] as PageNode[]);

    const [links, pages] = await Promise.all([loadLinks(site_id), loadPages(site_id)]);
    const conflicts = prioritizeConflicts(detectCanonicalConflicts(links, pages));

    const grouped = groupConflictsByType(conflicts);
    const summary_by_type: Record<CanonicalConflictType, number> = {
      links_to_non_canonical: grouped.links_to_non_canonical.length,
      canonical_chain: grouped.canonical_chain.length,
      self_canonical_mismatch: grouped.self_canonical_mismatch.length,
      missing_canonical_on_target: grouped.missing_canonical_on_target.length,
    };

    return {
      conflicts,
      total_conflicts: conflicts.length,
      high_impact_count: conflicts.filter((c) => c.equity_impact === 'high').length,
      fixable_count: conflicts.filter((c) => c.fix_action === 'update_link_to_canonical').length,
      summary_by_type,
    };
  } catch {
    return empty;
  }
}
