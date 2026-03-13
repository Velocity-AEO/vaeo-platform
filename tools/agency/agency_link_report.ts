/**
 * tools/agency/agency_link_report.ts
 *
 * Agency-level link health report across all roster sites.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgencyLinkHealthSummary {
  agency_id:                     string;
  period_days:                   number;
  total_sites:                   number;
  sites_with_graph:              number;
  total_orphaned_pages:          number;
  total_dead_ends:               number;
  total_broken_external:         number;
  total_canonical_conflicts:     number;
  total_link_opportunities:      number;
  sites_with_velocity_alerts:    number;
  worst_site_by_orphans:         string | null;
  worst_site_by_broken_external: string | null;
  most_opportunities:            string | null;
  generated_at:                  string;
}

interface SiteLinkGraph {
  site_id:                   string;
  orphaned_count:            number;
  dead_end_count:            number;
  broken_external_count:     number;
  canonical_conflict_count:  number;
  opportunity_count:         number;
  velocity_alert_count:      number;
}

export interface AgencyLinkReportDeps {
  loadSitesFn?:  (agency_id: string) => Promise<Array<{ site_id: string }>>;
  loadGraphsFn?: (site_ids: string[]) => Promise<SiteLinkGraph[]>;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultLoadSites(
  _agency_id: string,
): Promise<Array<{ site_id: string }>> {
  return [];
}

async function defaultLoadGraphs(
  _site_ids: string[],
): Promise<SiteLinkGraph[]> {
  return [];
}

// ── buildAgencyLinkReport ─────────────────────────────────────────────────────

export async function buildAgencyLinkReport(
  agency_id:   string,
  period_days: number,
  deps?:       AgencyLinkReportDeps,
): Promise<AgencyLinkHealthSummary> {
  const generated_at = new Date().toISOString();

  try {
    if (!agency_id) {
      return emptyLinkSummary(agency_id, period_days, generated_at);
    }

    const loadSites  = deps?.loadSitesFn  ?? defaultLoadSites;
    const loadGraphs = deps?.loadGraphsFn ?? defaultLoadGraphs;

    const sites = await loadSites(agency_id).catch(() => [] as Array<{ site_id: string }>);
    if (!Array.isArray(sites) || sites.length === 0) {
      return emptyLinkSummary(agency_id, period_days, generated_at);
    }

    const siteIds = sites.map((s) => s?.site_id).filter(Boolean) as string[];
    const graphs  = await loadGraphs(siteIds).catch(() => [] as SiteLinkGraph[]);
    const safeGraphs = Array.isArray(graphs) ? graphs : [];

    const sites_with_graph           = safeGraphs.length;
    const total_orphaned_pages        = safeGraphs.reduce((sum, g) => sum + (g?.orphaned_count ?? 0), 0);
    const total_dead_ends             = safeGraphs.reduce((sum, g) => sum + (g?.dead_end_count ?? 0), 0);
    const total_broken_external       = safeGraphs.reduce((sum, g) => sum + (g?.broken_external_count ?? 0), 0);
    const total_canonical_conflicts   = safeGraphs.reduce((sum, g) => sum + (g?.canonical_conflict_count ?? 0), 0);
    const total_link_opportunities    = safeGraphs.reduce((sum, g) => sum + (g?.opportunity_count ?? 0), 0);
    const sites_with_velocity_alerts  = safeGraphs.filter((g) => (g?.velocity_alert_count ?? 0) > 0).length;

    // Worst site by orphans
    let worst_site_by_orphans: string | null = null;
    let maxOrphans = 0;
    for (const g of safeGraphs) {
      if ((g?.orphaned_count ?? 0) > maxOrphans) {
        maxOrphans = g.orphaned_count;
        worst_site_by_orphans = g.site_id;
      }
    }
    if (maxOrphans === 0) worst_site_by_orphans = null;

    // Worst site by broken external
    let worst_site_by_broken_external: string | null = null;
    let maxBroken = 0;
    for (const g of safeGraphs) {
      if ((g?.broken_external_count ?? 0) > maxBroken) {
        maxBroken = g.broken_external_count;
        worst_site_by_broken_external = g.site_id;
      }
    }
    if (maxBroken === 0) worst_site_by_broken_external = null;

    // Most opportunities
    let most_opportunities: string | null = null;
    let maxOpp = 0;
    for (const g of safeGraphs) {
      if ((g?.opportunity_count ?? 0) > maxOpp) {
        maxOpp = g.opportunity_count;
        most_opportunities = g.site_id;
      }
    }
    if (maxOpp === 0) most_opportunities = null;

    return {
      agency_id,
      period_days:                   period_days ?? 30,
      total_sites:                   sites.length,
      sites_with_graph,
      total_orphaned_pages,
      total_dead_ends,
      total_broken_external,
      total_canonical_conflicts,
      total_link_opportunities,
      sites_with_velocity_alerts,
      worst_site_by_orphans,
      worst_site_by_broken_external,
      most_opportunities,
      generated_at,
    };
  } catch {
    return emptyLinkSummary(agency_id, period_days, generated_at);
  }
}

function emptyLinkSummary(
  agency_id:   string,
  period_days: number,
  generated_at: string,
): AgencyLinkHealthSummary {
  return {
    agency_id:                     agency_id ?? '',
    period_days:                   period_days ?? 30,
    total_sites:                   0,
    sites_with_graph:              0,
    total_orphaned_pages:          0,
    total_dead_ends:               0,
    total_broken_external:         0,
    total_canonical_conflicts:     0,
    total_link_opportunities:      0,
    sites_with_velocity_alerts:    0,
    worst_site_by_orphans:         null,
    worst_site_by_broken_external: null,
    most_opportunities:            null,
    generated_at,
  };
}
