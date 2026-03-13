/**
 * tools/link_graph/admin_graph_status.ts
 *
 * Platform-wide link graph health visibility for admin dashboard.
 * Aggregates link graph status across all sites. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteGraphStatus {
  site_id:                    string;
  domain:                     string;
  page_count:                 number;
  internal_link_count:        number;
  external_link_count:        number;
  orphaned_count:             number;
  dead_end_count:             number;
  redirect_chain_count:       number;
  canonical_conflict_count:   number;
  link_limit_violation_count: number;
  equity_leak_count:          number;
  last_built_at:              string | null;
  build_age_hours:            number | null;
  health_grade:               'A' | 'B' | 'C' | 'D' | 'F';
}

export interface PlatformGraphStatus {
  sites:                     SiteGraphStatus[];
  total_sites:               number;
  sites_with_graph:          number;
  sites_needing_rebuild:     number;
  total_pages:               number;
  total_internal_links:      number;
  total_orphaned:            number;
  total_canonical_conflicts: number;
  total_link_limit_violations: number;
  avg_health_grade:          string;
  worst_sites:               SiteGraphStatus[];
  stale_sites:               SiteGraphStatus[];
}

export interface AdminGraphStatusDeps {
  loadAllSitesFn?: () => Promise<Array<{ site_id: string; domain: string }>>;
  loadGraphStatusFn?: (site_id: string) => Promise<Omit<SiteGraphStatus, 'site_id' | 'domain' | 'health_grade'> | null>;
}

// ── Health grading ──────────────────────────────────────────────────────────

export function gradeGraphHealth(status: {
  orphaned_count: number;
  dead_end_count: number;
  canonical_conflict_count: number;
  link_limit_violation_count: number;
  redirect_chain_count: number;
  page_count: number;
}): 'A' | 'B' | 'C' | 'D' | 'F' {
  try {
    if (!status || status.page_count <= 0) return 'F';

    const total_issues =
      (status.orphaned_count ?? 0) +
      (status.dead_end_count ?? 0) +
      (status.canonical_conflict_count ?? 0) +
      (status.link_limit_violation_count ?? 0) +
      (status.redirect_chain_count ?? 0);

    const issue_rate = total_issues / status.page_count;

    if (issue_rate <= 0.02) return 'A';
    if (issue_rate <= 0.05) return 'B';
    if (issue_rate <= 0.10) return 'C';
    if (issue_rate <= 0.20) return 'D';
    return 'F';
  } catch {
    return 'F';
  }
}

// ── Build age calculation ───────────────────────────────────────────────────

export function calculateBuildAgeHours(last_built_at: string | null): number | null {
  try {
    if (!last_built_at) return null;
    const built = new Date(last_built_at).getTime();
    if (isNaN(built)) return null;
    return Math.round((Date.now() - built) / (1000 * 60 * 60));
  } catch {
    return null;
  }
}

// ── Stale threshold (24 hours) ──────────────────────────────────────────────

export const STALE_THRESHOLD_HOURS = 24;

export function isSiteStale(build_age_hours: number | null): boolean {
  try {
    if (build_age_hours === null) return true;
    return build_age_hours > STALE_THRESHOLD_HOURS;
  } catch {
    return true;
  }
}

// ── Platform-wide status ────────────────────────────────────────────────────

export async function getPlatformGraphStatus(
  deps?: AdminGraphStatusDeps,
): Promise<PlatformGraphStatus> {
  const empty: PlatformGraphStatus = {
    sites: [],
    total_sites: 0,
    sites_with_graph: 0,
    sites_needing_rebuild: 0,
    total_pages: 0,
    total_internal_links: 0,
    total_orphaned: 0,
    total_canonical_conflicts: 0,
    total_link_limit_violations: 0,
    avg_health_grade: 'F',
    worst_sites: [],
    stale_sites: [],
  };

  try {
    const loadAllSites = deps?.loadAllSitesFn ?? (async () => []);
    const loadGraphStatus = deps?.loadGraphStatusFn ?? (async () => null);

    const allSites = await loadAllSites();
    if (!Array.isArray(allSites) || allSites.length === 0) return empty;

    const sites: SiteGraphStatus[] = [];

    for (const site of allSites) {
      if (!site?.site_id) continue;
      try {
        const raw = await loadGraphStatus(site.site_id);
        if (!raw) {
          sites.push({
            site_id: site.site_id,
            domain: site.domain ?? '',
            page_count: 0,
            internal_link_count: 0,
            external_link_count: 0,
            orphaned_count: 0,
            dead_end_count: 0,
            redirect_chain_count: 0,
            canonical_conflict_count: 0,
            link_limit_violation_count: 0,
            equity_leak_count: 0,
            last_built_at: null,
            build_age_hours: null,
            health_grade: 'F',
          });
          continue;
        }

        const build_age_hours = calculateBuildAgeHours(raw.last_built_at);
        const health_grade = gradeGraphHealth(raw);

        sites.push({
          site_id: site.site_id,
          domain: site.domain ?? '',
          ...raw,
          build_age_hours,
          health_grade,
        });
      } catch {
        // Skip failed sites
      }
    }

    // Aggregate
    const total_pages = sites.reduce((s, x) => s + x.page_count, 0);
    const total_internal_links = sites.reduce((s, x) => s + x.internal_link_count, 0);
    const total_orphaned = sites.reduce((s, x) => s + x.orphaned_count, 0);
    const total_canonical_conflicts = sites.reduce((s, x) => s + x.canonical_conflict_count, 0);
    const total_link_limit_violations = sites.reduce((s, x) => s + x.link_limit_violation_count, 0);

    const sites_with_graph = sites.filter((s) => s.last_built_at !== null).length;
    const stale_sites = sites.filter((s) => isSiteStale(s.build_age_hours));

    // Average health grade
    const gradeValues: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const gradeSum = sites.reduce((s, x) => s + (gradeValues[x.health_grade] ?? 0), 0);
    const avgGradeNum = sites.length > 0 ? gradeSum / sites.length : 0;
    const avgGrade = avgGradeNum >= 3.5 ? 'A' : avgGradeNum >= 2.5 ? 'B' : avgGradeNum >= 1.5 ? 'C' : avgGradeNum >= 0.5 ? 'D' : 'F';

    // Worst sites (grade D or F, sorted by issue count desc)
    const worst_sites = sites
      .filter((s) => s.health_grade === 'D' || s.health_grade === 'F')
      .sort((a, b) => {
        const aIssues = a.orphaned_count + a.canonical_conflict_count + a.link_limit_violation_count;
        const bIssues = b.orphaned_count + b.canonical_conflict_count + b.link_limit_violation_count;
        return bIssues - aIssues;
      })
      .slice(0, 5);

    return {
      sites,
      total_sites: sites.length,
      sites_with_graph,
      sites_needing_rebuild: stale_sites.length,
      total_pages,
      total_internal_links,
      total_orphaned,
      total_canonical_conflicts,
      total_link_limit_violations,
      avg_health_grade: avgGrade,
      worst_sites,
      stale_sites: stale_sites.slice(0, 10),
    };
  } catch {
    return empty;
  }
}
