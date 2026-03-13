/**
 * tools/link_graph/graph_integrity_checker.ts
 *
 * Validates link graph data integrity — missing homepage, duplicate nodes,
 * orphaned link references, invalid depths, disconnected components.
 * Never throws.
 */

import type { PageNode, InternalLink } from './link_graph_types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type IntegrityIssueType =
  | 'missing_homepage'
  | 'duplicate_page_nodes'
  | 'orphaned_link_references'
  | 'invalid_depth_values'
  | 'missing_authority_scores'
  | 'stale_external_checks'
  | 'disconnected_graph_components';

export interface GraphIntegrityReport {
  site_id:                  string;
  checked_at:               string;
  is_valid:                 boolean;
  issues:                   Array<{
    type:           IntegrityIssueType;
    description:    string;
    affected_count: number;
    severity:       'critical' | 'warning' | 'info';
  }>;
  page_count:               number;
  internal_link_count:      number;
  external_link_count:      number;
  orphaned_count:           number;
  duplicate_nodes:          number;
  missing_homepage:         boolean;
  disconnected_components:  number;
}

export interface GraphIntegrityDeps {
  loadGraphFn?: (site_id: string) => Promise<{
    pages: PageNode[];
    internal_links: InternalLink[];
    external_link_count: number;
    site_domain: string;
  } | null>;
}

// ── checkForMissingHomepage ─────────────────────────────────────────────────

export function checkForMissingHomepage(
  nodes: PageNode[],
  site_domain: string,
): boolean {
  try {
    if (!Array.isArray(nodes) || !site_domain) return true;

    const normalized = site_domain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    const homePatterns = [
      `https://${normalized}`,
      `https://${normalized}/`,
      `http://${normalized}`,
      `http://${normalized}/`,
      `https://www.${normalized}`,
      `https://www.${normalized}/`,
    ];

    for (const node of nodes) {
      if (!node?.url) continue;
      const nodeUrl = node.url.toLowerCase().replace(/\/+$/, '');
      for (const pattern of homePatterns) {
        if (nodeUrl === pattern.replace(/\/+$/, '')) return false;
      }
    }

    return true;
  } catch {
    return true;
  }
}

// ── checkForDuplicateNodes ──────────────────────────────────────────────────

export function checkForDuplicateNodes(
  nodes: PageNode[],
): number {
  try {
    if (!Array.isArray(nodes)) return 0;
    const seen = new Set<string>();
    let dupes = 0;
    for (const node of nodes) {
      if (!node?.url) continue;
      if (seen.has(node.url)) {
        dupes++;
      } else {
        seen.add(node.url);
      }
    }
    return dupes;
  } catch {
    return 0;
  }
}

// ── checkForOrphanedLinkRefs ────────────────────────────────────────────────

export function checkForOrphanedLinkRefs(
  links: InternalLink[],
  nodes: PageNode[],
): number {
  try {
    if (!Array.isArray(links) || !Array.isArray(nodes)) return 0;
    const nodeUrls = new Set(nodes.map((n) => n?.url).filter(Boolean));
    let orphaned = 0;
    for (const link of links) {
      if (!link?.destination_url) continue;
      if (!nodeUrls.has(link.destination_url)) {
        orphaned++;
      }
    }
    return orphaned;
  } catch {
    return 0;
  }
}

// ── checkForInvalidDepths ───────────────────────────────────────────────────

export function checkForInvalidDepths(
  nodes: PageNode[],
): number {
  try {
    if (!Array.isArray(nodes)) return 0;
    let invalid = 0;
    for (const node of nodes) {
      if (node?.depth_from_homepage === null || node?.depth_from_homepage === undefined) continue;
      // -1 means unreachable, which is valid
      if (node.depth_from_homepage === -1) continue;
      if (node.depth_from_homepage < 0) {
        invalid++;
      }
    }
    return invalid;
  } catch {
    return 0;
  }
}

// ── countDisconnectedComponents ─────────────────────────────────────────────

export function countDisconnectedComponents(
  nodes: PageNode[],
  links: InternalLink[],
): number {
  try {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;

    const safeNodes = nodes.filter((n) => n?.url);
    if (safeNodes.length === 0) return 0;

    // Build union-find
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    function find(x: string): string {
      if (!parent.has(x)) {
        parent.set(x, x);
        rank.set(x, 0);
      }
      let root = x;
      while (parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      // Path compression
      let curr = x;
      while (curr !== root) {
        const next = parent.get(curr)!;
        parent.set(curr, root);
        curr = next;
      }
      return root;
    }

    function union(a: string, b: string): void {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      const rankA = rank.get(ra) ?? 0;
      const rankB = rank.get(rb) ?? 0;
      if (rankA < rankB) {
        parent.set(ra, rb);
      } else if (rankA > rankB) {
        parent.set(rb, ra);
      } else {
        parent.set(rb, ra);
        rank.set(ra, rankA + 1);
      }
    }

    // Initialize all nodes
    for (const node of safeNodes) {
      find(node.url);
    }

    // Union linked nodes
    const safeLinks = Array.isArray(links) ? links : [];
    for (const link of safeLinks) {
      if (!link?.source_url || !link?.destination_url) continue;
      if (parent.has(link.source_url) || parent.has(link.destination_url)) {
        find(link.source_url);
        find(link.destination_url);
        union(link.source_url, link.destination_url);
      }
    }

    // Count distinct roots
    const roots = new Set<string>();
    for (const node of safeNodes) {
      roots.add(find(node.url));
    }

    return roots.size;
  } catch {
    return 0;
  }
}

// ── checkGraphIntegrity ─────────────────────────────────────────────────────

export async function checkGraphIntegrity(
  site_id: string,
  deps?: GraphIntegrityDeps,
): Promise<GraphIntegrityReport> {
  const empty: GraphIntegrityReport = {
    site_id: site_id ?? '',
    checked_at: new Date().toISOString(),
    is_valid: false,
    issues: [],
    page_count: 0,
    internal_link_count: 0,
    external_link_count: 0,
    orphaned_count: 0,
    duplicate_nodes: 0,
    missing_homepage: true,
    disconnected_components: 0,
  };

  try {
    if (!site_id) return empty;

    const loadGraph = deps?.loadGraphFn ?? (async () => null);
    const graph = await loadGraph(site_id);

    if (!graph) {
      return {
        ...empty,
        issues: [{
          type: 'missing_homepage',
          description: 'No graph data found for site',
          affected_count: 0,
          severity: 'critical',
        }],
      };
    }

    const pages = Array.isArray(graph.pages) ? graph.pages : [];
    const links = Array.isArray(graph.internal_links) ? graph.internal_links : [];

    const issues: GraphIntegrityReport['issues'] = [];

    // 1. Missing homepage
    const missingHomepage = checkForMissingHomepage(pages, graph.site_domain);
    if (missingHomepage) {
      issues.push({
        type: 'missing_homepage',
        description: `No homepage node found for ${graph.site_domain}`,
        affected_count: 1,
        severity: 'critical',
      });
    }

    // 2. Duplicate nodes
    const duplicateCount = checkForDuplicateNodes(pages);
    if (duplicateCount > 0) {
      issues.push({
        type: 'duplicate_page_nodes',
        description: `${duplicateCount} duplicate page URL(s) in graph`,
        affected_count: duplicateCount,
        severity: 'warning',
      });
    }

    // 3. Orphaned link references
    const orphanedRefs = checkForOrphanedLinkRefs(links, pages);
    if (orphanedRefs > 0) {
      issues.push({
        type: 'orphaned_link_references',
        description: `${orphanedRefs} link(s) reference URLs not in page nodes`,
        affected_count: orphanedRefs,
        severity: 'warning',
      });
    }

    // 4. Invalid depths
    const invalidDepths = checkForInvalidDepths(pages);
    if (invalidDepths > 0) {
      issues.push({
        type: 'invalid_depth_values',
        description: `${invalidDepths} page(s) have invalid depth values`,
        affected_count: invalidDepths,
        severity: 'warning',
      });
    }

    // 5. Missing authority scores
    const missingScores = pages.filter((p) => p?.link_equity_score === null || p?.link_equity_score === undefined).length;
    if (missingScores > 0 && pages.length > 0) {
      const pct = Math.round((missingScores / pages.length) * 100);
      if (pct > 50) {
        issues.push({
          type: 'missing_authority_scores',
          description: `${missingScores} page(s) (${pct}%) missing authority scores`,
          affected_count: missingScores,
          severity: 'info',
        });
      }
    }

    // 6. Disconnected components
    const components = countDisconnectedComponents(pages, links);
    if (components > 1) {
      issues.push({
        type: 'disconnected_graph_components',
        description: `Graph has ${components} disconnected components (ideal: 1)`,
        affected_count: components,
        severity: components > 3 ? 'warning' : 'info',
      });
    }

    // Determine validity: no critical issues
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const orphaned = pages.filter((p) => p?.is_orphaned).length;

    return {
      site_id,
      checked_at: new Date().toISOString(),
      is_valid: !hasCritical,
      issues,
      page_count: pages.length,
      internal_link_count: links.length,
      external_link_count: graph.external_link_count ?? 0,
      orphaned_count: orphaned,
      duplicate_nodes: duplicateCount,
      missing_homepage: missingHomepage,
      disconnected_components: components,
    };
  } catch {
    return empty;
  }
}
