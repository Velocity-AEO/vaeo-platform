/**
 * tools/link_graph/platform_link_health.ts
 *
 * Platform-wide link health aggregator for admin dashboard.
 * Aggregates graph metrics across all sites, identifies sites
 * needing attention, tracks graph build staleness. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlatformLinkHealth {
  generated_at:              string;
  total_sites:               number;
  sites_with_graph:          number;
  sites_without_graph:       number;
  total_pages_mapped:        number;
  total_orphaned_pages:      number;
  total_dead_ends:           number;
  total_deep_pages:          number;
  total_broken_external:     number;
  total_canonical_conflicts: number;
  total_link_opportunities:  number;
  total_velocity_alerts:     number;
  avg_orphaned_per_site:     number;
  avg_authority_score:       number | null;
  sites_needing_attention:   SiteAttention[];
  graph_build_status:        GraphBuildEntry[];
}

export interface SiteAttention {
  site_id:              string;
  domain:               string;
  orphaned_count:       number;
  broken_external_count: number;
  velocity_alerts:      number;
  last_graph_built:     string | null;
  attention_reasons:    string[];
}

export interface GraphBuildEntry {
  site_id:         string;
  domain:          string;
  last_built:      string | null;
  pages_mapped:    number;
  build_age_hours: number | null;
  is_stale:        boolean;
}

export interface SiteGraphData {
  site_id:                string;
  domain:                 string;
  pages_mapped:           number;
  orphaned_count:         number;
  dead_end_count:         number;
  deep_page_count:        number;
  broken_external_count:  number;
  canonical_conflict_count: number;
  link_opportunity_count: number;
  avg_authority_score:    number | null;
  last_built:             string | null;
}

export interface PlatformLinkHealthDeps {
  loadSitesFn?:    () => Promise<Array<{ site_id: string; domain: string }>>;
  loadGraphsFn?:   (site_id: string) => Promise<SiteGraphData | null>;
  loadVelocityFn?: (site_id: string) => Promise<{ alert_count: number }>;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const STALE_GRAPH_THRESHOLD_HOURS = 25;

// ── isGraphStale ────────────────────────────────────────────────────────────

export function isGraphStale(
  last_built: string | null,
  threshold_hours: number,
): boolean {
  try {
    if (last_built === null || last_built === undefined) return true;
    const builtMs = new Date(last_built).getTime();
    if (isNaN(builtMs)) return true;
    const ageHours = (Date.now() - builtMs) / (1000 * 60 * 60);
    return ageHours > threshold_hours;
  } catch {
    return true;
  }
}

// ── buildAttentionReasons ───────────────────────────────────────────────────

export function buildAttentionReasons(
  site: {
    orphaned_count: number;
    broken_external_count: number;
    velocity_alerts: number;
    is_stale: boolean;
  },
): string[] {
  try {
    if (!site) return [];
    const reasons: string[] = [];

    if ((site.orphaned_count ?? 0) > 10) {
      reasons.push(`High orphan count (${site.orphaned_count} pages)`);
    }
    if ((site.broken_external_count ?? 0) > 5) {
      reasons.push(`${site.broken_external_count} broken external links`);
    }
    if ((site.velocity_alerts ?? 0) > 0) {
      reasons.push(`${site.velocity_alerts} link velocity alerts`);
    }
    if (site.is_stale) {
      reasons.push('Link graph not rebuilt in 25+ hours');
    }

    return reasons;
  } catch {
    return [];
  }
}

// ── buildPlatformLinkHealth ─────────────────────────────────────────────────

export async function buildPlatformLinkHealth(
  deps?: PlatformLinkHealthDeps,
): Promise<PlatformLinkHealth> {
  const empty: PlatformLinkHealth = {
    generated_at: new Date().toISOString(),
    total_sites: 0,
    sites_with_graph: 0,
    sites_without_graph: 0,
    total_pages_mapped: 0,
    total_orphaned_pages: 0,
    total_dead_ends: 0,
    total_deep_pages: 0,
    total_broken_external: 0,
    total_canonical_conflicts: 0,
    total_link_opportunities: 0,
    total_velocity_alerts: 0,
    avg_orphaned_per_site: 0,
    avg_authority_score: null,
    sites_needing_attention: [],
    graph_build_status: [],
  };

  try {
    const loadSites    = deps?.loadSitesFn ?? (async () => []);
    const loadGraphs   = deps?.loadGraphsFn ?? (async () => null);
    const loadVelocity = deps?.loadVelocityFn ?? (async () => ({ alert_count: 0 }));

    const allSites = await loadSites();
    if (!Array.isArray(allSites) || allSites.length === 0) return empty;

    let total_pages_mapped = 0;
    let total_orphaned_pages = 0;
    let total_dead_ends = 0;
    let total_deep_pages = 0;
    let total_broken_external = 0;
    let total_canonical_conflicts = 0;
    let total_link_opportunities = 0;
    let total_velocity_alerts = 0;
    let sites_with_graph = 0;
    let authority_sum = 0;
    let authority_count = 0;

    const attention: SiteAttention[] = [];
    const buildStatus: GraphBuildEntry[] = [];

    for (const site of allSites) {
      if (!site?.site_id) continue;

      try {
        const graph = await loadGraphs(site.site_id);
        let velocityAlerts = 0;
        try {
          const v = await loadVelocity(site.site_id);
          velocityAlerts = v?.alert_count ?? 0;
        } catch { /* non-fatal */ }

        const has_graph = graph?.last_built !== null && graph?.last_built !== undefined;
        if (has_graph) sites_with_graph++;

        const pages = graph?.pages_mapped ?? 0;
        const orphaned = graph?.orphaned_count ?? 0;
        const dead_ends = graph?.dead_end_count ?? 0;
        const deep = graph?.deep_page_count ?? 0;
        const broken = graph?.broken_external_count ?? 0;
        const canonical = graph?.canonical_conflict_count ?? 0;
        const opportunities = graph?.link_opportunity_count ?? 0;
        const avgAuth = graph?.avg_authority_score ?? null;

        total_pages_mapped += pages;
        total_orphaned_pages += orphaned;
        total_dead_ends += dead_ends;
        total_deep_pages += deep;
        total_broken_external += broken;
        total_canonical_conflicts += canonical;
        total_link_opportunities += opportunities;
        total_velocity_alerts += velocityAlerts;

        if (avgAuth !== null) {
          authority_sum += avgAuth;
          authority_count++;
        }

        const stale = isGraphStale(graph?.last_built ?? null, STALE_GRAPH_THRESHOLD_HOURS);

        // Build age
        let build_age_hours: number | null = null;
        if (graph?.last_built) {
          const builtMs = new Date(graph.last_built).getTime();
          if (!isNaN(builtMs)) {
            build_age_hours = Math.round((Date.now() - builtMs) / (1000 * 60 * 60));
          }
        }

        buildStatus.push({
          site_id: site.site_id,
          domain: site.domain ?? '',
          last_built: graph?.last_built ?? null,
          pages_mapped: pages,
          build_age_hours,
          is_stale: stale,
        });

        const reasons = buildAttentionReasons({
          orphaned_count: orphaned,
          broken_external_count: broken,
          velocity_alerts: velocityAlerts,
          is_stale: stale,
        });

        if (reasons.length > 0) {
          attention.push({
            site_id: site.site_id,
            domain: site.domain ?? '',
            orphaned_count: orphaned,
            broken_external_count: broken,
            velocity_alerts: velocityAlerts,
            last_graph_built: graph?.last_built ?? null,
            attention_reasons: reasons,
          });
        }
      } catch {
        // Skip failed site
      }
    }

    // Sort sites_needing_attention by total attention signals desc
    attention.sort((a, b) => {
      const aSignals = a.orphaned_count + a.broken_external_count + a.velocity_alerts;
      const bSignals = b.orphaned_count + b.broken_external_count + b.velocity_alerts;
      return bSignals - aSignals;
    });

    const total_sites = allSites.length;
    const avg_orphaned = sites_with_graph > 0
      ? Math.round((total_orphaned_pages / sites_with_graph) * 10) / 10
      : 0;
    const avg_authority = authority_count > 0
      ? Math.round((authority_sum / authority_count) * 100) / 100
      : null;

    return {
      generated_at: new Date().toISOString(),
      total_sites,
      sites_with_graph,
      sites_without_graph: total_sites - sites_with_graph,
      total_pages_mapped,
      total_orphaned_pages,
      total_dead_ends,
      total_deep_pages,
      total_broken_external,
      total_canonical_conflicts,
      total_link_opportunities,
      total_velocity_alerts,
      avg_orphaned_per_site: avg_orphaned,
      avg_authority_score: avg_authority,
      sites_needing_attention: attention,
      graph_build_status: buildStatus,
    };
  } catch {
    return empty;
  }
}

// ── getGraphBuildStatus ─────────────────────────────────────────────────────

export async function getGraphBuildStatus(
  deps?: Pick<PlatformLinkHealthDeps, 'loadSitesFn' | 'loadGraphsFn'>,
): Promise<PlatformLinkHealth['graph_build_status']> {
  try {
    const loadSites  = deps?.loadSitesFn ?? (async () => []);
    const loadGraphs = deps?.loadGraphsFn ?? (async () => null);

    const allSites = await loadSites();
    if (!Array.isArray(allSites) || allSites.length === 0) return [];

    const entries: GraphBuildEntry[] = [];

    for (const site of allSites) {
      if (!site?.site_id) continue;
      try {
        const graph = await loadGraphs(site.site_id);
        const last_built = graph?.last_built ?? null;
        let build_age_hours: number | null = null;
        if (last_built) {
          const builtMs = new Date(last_built).getTime();
          if (!isNaN(builtMs)) {
            build_age_hours = Math.round((Date.now() - builtMs) / (1000 * 60 * 60));
          }
        }
        entries.push({
          site_id: site.site_id,
          domain: site.domain ?? '',
          last_built,
          pages_mapped: graph?.pages_mapped ?? 0,
          build_age_hours,
          is_stale: isGraphStale(last_built, STALE_GRAPH_THRESHOLD_HOURS),
        });
      } catch { /* skip */ }
    }

    // Sort: stale first, then by last_built asc (null = oldest)
    entries.sort((a, b) => {
      if (a.is_stale !== b.is_stale) return a.is_stale ? -1 : 1;
      if (a.last_built === null && b.last_built === null) return 0;
      if (a.last_built === null) return -1;
      if (b.last_built === null) return 1;
      return new Date(a.last_built).getTime() - new Date(b.last_built).getTime();
    });

    return entries;
  } catch {
    return [];
  }
}
