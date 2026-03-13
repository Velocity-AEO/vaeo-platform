/**
 * tools/link_graph/graph_integrity_checker.ts
 *
 * Validates link graph data integrity — detects dangling references,
 * orphaned links, missing nodes, duplicate edges, and data staleness.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type IntegrityIssueType =
  | 'dangling_link'          // link points to a URL not in page_nodes
  | 'orphaned_node'          // page_node with zero inbound and zero outbound
  | 'duplicate_edge'         // same source→destination appears multiple times
  | 'self_loop'              // link where source === destination
  | 'missing_canonical_ref'  // canonical_url points to non-existent node
  | 'stale_data'             // graph data older than threshold
  | 'empty_graph';           // no pages or links at all

export type IntegritySeverity = 'critical' | 'warning' | 'info';

export interface IntegrityIssue {
  type:        IntegrityIssueType;
  severity:    IntegritySeverity;
  description: string;
  affected_urls: string[];
  count:       number;
}

export interface IntegrityCheckResult {
  site_id:          string;
  checked_at:       string;
  is_healthy:       boolean;
  total_issues:     number;
  critical_count:   number;
  warning_count:    number;
  info_count:       number;
  issues:           IntegrityIssue[];
  pages_checked:    number;
  links_checked:    number;
}

export interface IntegrityCheckDeps {
  loadPageUrlsFn?: (site_id: string) => Promise<string[]>;
  loadLinksFn?:    (site_id: string) => Promise<Array<{ source_url: string; destination_url: string }>>;
  loadCanonicalsFn?: (site_id: string) => Promise<Array<{ url: string; canonical_url: string | null }>>;
  getLastBuiltAtFn?: (site_id: string) => Promise<string | null>;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const STALE_HOURS_THRESHOLD = 48;

// ── checkGraphIntegrity ─────────────────────────────────────────────────────

export async function checkGraphIntegrity(
  site_id: string,
  deps?: IntegrityCheckDeps,
): Promise<IntegrityCheckResult> {
  const empty: IntegrityCheckResult = {
    site_id: site_id ?? '',
    checked_at: new Date().toISOString(),
    is_healthy: false,
    total_issues: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    issues: [],
    pages_checked: 0,
    links_checked: 0,
  };

  try {
    if (!site_id) return { ...empty, issues: [{ type: 'empty_graph', severity: 'critical', description: 'No site_id provided', affected_urls: [], count: 1 }], total_issues: 1, critical_count: 1 };

    const loadPageUrls   = deps?.loadPageUrlsFn ?? (async () => []);
    const loadLinks      = deps?.loadLinksFn ?? (async () => []);
    const loadCanonicals = deps?.loadCanonicalsFn ?? (async () => []);
    const getLastBuiltAt = deps?.getLastBuiltAtFn ?? (async () => null);

    const [pageUrls, links, canonicals, lastBuiltAt] = await Promise.all([
      loadPageUrls(site_id),
      loadLinks(site_id),
      loadCanonicals(site_id),
      getLastBuiltAt(site_id),
    ]);

    const safePages = Array.isArray(pageUrls) ? pageUrls.filter(Boolean) : [];
    const safeLinks = Array.isArray(links) ? links.filter((l) => l?.source_url && l?.destination_url) : [];

    const issues: IntegrityIssue[] = [];

    // 1. Empty graph check
    if (safePages.length === 0 && safeLinks.length === 0) {
      issues.push({
        type: 'empty_graph',
        severity: 'critical',
        description: 'Graph has no pages or links — needs initial build',
        affected_urls: [],
        count: 1,
      });
    }

    const pageSet = new Set(safePages);

    // 2. Dangling links — destination not in page set
    const danglingUrls: string[] = [];
    for (const link of safeLinks) {
      if (!pageSet.has(link.destination_url)) {
        danglingUrls.push(link.destination_url);
      }
    }
    if (danglingUrls.length > 0) {
      const unique = [...new Set(danglingUrls)];
      issues.push({
        type: 'dangling_link',
        severity: 'warning',
        description: `${unique.length} link(s) point to URLs not found in page nodes`,
        affected_urls: unique.slice(0, 20),
        count: unique.length,
      });
    }

    // 3. Orphaned nodes — no inbound and no outbound
    const hasInbound = new Set<string>();
    const hasOutbound = new Set<string>();
    for (const link of safeLinks) {
      hasOutbound.add(link.source_url);
      hasInbound.add(link.destination_url);
    }
    const orphanedUrls = safePages.filter((u) => !hasInbound.has(u) && !hasOutbound.has(u));
    if (orphanedUrls.length > 0) {
      issues.push({
        type: 'orphaned_node',
        severity: 'warning',
        description: `${orphanedUrls.length} page(s) have no inbound or outbound links`,
        affected_urls: orphanedUrls.slice(0, 20),
        count: orphanedUrls.length,
      });
    }

    // 4. Duplicate edges
    const edgeSet = new Set<string>();
    const duplicateEdges: string[] = [];
    for (const link of safeLinks) {
      const key = `${link.source_url}→${link.destination_url}`;
      if (edgeSet.has(key)) {
        duplicateEdges.push(key);
      } else {
        edgeSet.add(key);
      }
    }
    if (duplicateEdges.length > 0) {
      issues.push({
        type: 'duplicate_edge',
        severity: 'info',
        description: `${duplicateEdges.length} duplicate edge(s) found`,
        affected_urls: duplicateEdges.slice(0, 20),
        count: duplicateEdges.length,
      });
    }

    // 5. Self-loops
    const selfLoops = safeLinks.filter((l) => l.source_url === l.destination_url);
    if (selfLoops.length > 0) {
      issues.push({
        type: 'self_loop',
        severity: 'info',
        description: `${selfLoops.length} self-referencing link(s) found`,
        affected_urls: [...new Set(selfLoops.map((l) => l.source_url))].slice(0, 20),
        count: selfLoops.length,
      });
    }

    // 6. Missing canonical references
    const safeCanonicals = Array.isArray(canonicals) ? canonicals : [];
    const missingCanonicalRefs: string[] = [];
    for (const c of safeCanonicals) {
      if (c?.canonical_url && !pageSet.has(c.canonical_url)) {
        missingCanonicalRefs.push(c.canonical_url);
      }
    }
    if (missingCanonicalRefs.length > 0) {
      const unique = [...new Set(missingCanonicalRefs)];
      issues.push({
        type: 'missing_canonical_ref',
        severity: 'warning',
        description: `${unique.length} canonical URL(s) reference pages not in graph`,
        affected_urls: unique.slice(0, 20),
        count: unique.length,
      });
    }

    // 7. Stale data check
    if (lastBuiltAt) {
      const ageMs = Date.now() - new Date(lastBuiltAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours > STALE_HOURS_THRESHOLD) {
        issues.push({
          type: 'stale_data',
          severity: 'warning',
          description: `Graph data is ${Math.round(ageHours)} hours old (threshold: ${STALE_HOURS_THRESHOLD}h)`,
          affected_urls: [],
          count: 1,
        });
      }
    } else if (safePages.length > 0) {
      issues.push({
        type: 'stale_data',
        severity: 'warning',
        description: 'No build timestamp found — graph may be stale',
        affected_urls: [],
        count: 1,
      });
    }

    const critical_count = issues.filter((i) => i.severity === 'critical').length;
    const warning_count = issues.filter((i) => i.severity === 'warning').length;
    const info_count = issues.filter((i) => i.severity === 'info').length;

    return {
      site_id,
      checked_at: new Date().toISOString(),
      is_healthy: critical_count === 0 && warning_count === 0,
      total_issues: issues.length,
      critical_count,
      warning_count,
      info_count,
      issues,
      pages_checked: safePages.length,
      links_checked: safeLinks.length,
    };
  } catch {
    return empty;
  }
}

// ── Batch integrity check ───────────────────────────────────────────────────

export async function batchCheckIntegrity(
  site_ids: string[],
  deps?: IntegrityCheckDeps,
): Promise<IntegrityCheckResult[]> {
  try {
    const safe = Array.isArray(site_ids) ? site_ids.filter(Boolean) : [];
    const results: IntegrityCheckResult[] = [];
    for (const sid of safe) {
      results.push(await checkGraphIntegrity(sid, deps));
    }
    return results;
  } catch {
    return [];
  }
}
