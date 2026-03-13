/**
 * tools/agency/agency_report.ts
 *
 * Agency-level reporting across all client sites.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgencyReportPeriod = 'last_7_days' | 'last_30_days' | 'last_90_days';

export interface AgencyClientHealth {
  site_id:       string;
  domain:        string;
  health_score:  number | null;
  fixes_applied: number;
  improved:      boolean;
  gsc_connected: boolean;
}

export interface AgencyReport {
  agency_id:            string;
  period:               AgencyReportPeriod;
  generated_at:         string;
  total_sites:          number;
  total_fixes_applied:  number;
  total_issues_resolved: number;
  average_health_score: number | null;
  top_fix_types:        Array<{ fix_type: string; count: number }>;
  sites_improved:       number;
  sites_declined:       number;
  gsc_connected_count:  number;
  drift_summary?:       AgencyDriftSummary;
}

// ── getTopFixTypes ────────────────────────────────────────────────────────────

export function getTopFixTypes(
  fixes: Array<{ fix_type: string }>,
): Array<{ fix_type: string; count: number }> {
  try {
    if (!Array.isArray(fixes)) return [];
    const counts = new Map<string, number>();
    for (const f of fixes) {
      const t = f?.fix_type ?? 'unknown';
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([fix_type, count]) => ({ fix_type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ── getAverageHealthScore ─────────────────────────────────────────────────────

export function getAverageHealthScore(
  sites: Array<{ health_score: number | null }>,
): number | null {
  try {
    if (!Array.isArray(sites)) return null;
    const scores = sites
      .map((s) => s?.health_score)
      .filter((s): s is number => s != null && !isNaN(s));
    if (scores.length === 0) return null;
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return Math.round(avg * 10) / 10;
  } catch {
    return null;
  }
}

// ── buildAgencyReport ─────────────────────────────────────────────────────────

export function buildAgencyReport(
  agency_id: string,
  period: AgencyReportPeriod,
  site_data: AgencyClientHealth[],
  fix_data: Array<{ fix_type: string; site_id: string; applied_at: string }>,
): AgencyReport {
  try {
    const sites = Array.isArray(site_data) ? site_data : [];
    const fixes = Array.isArray(fix_data) ? fix_data : [];

    return {
      agency_id: agency_id ?? '',
      period: period ?? 'last_30_days',
      generated_at: new Date().toISOString(),
      total_sites: sites.length,
      total_fixes_applied: fixes.length,
      total_issues_resolved: fixes.length,
      average_health_score: getAverageHealthScore(sites),
      top_fix_types: getTopFixTypes(fixes),
      sites_improved: sites.filter((s) => s?.improved).length,
      sites_declined: sites.filter((s) => s && !s.improved).length,
      gsc_connected_count: sites.filter((s) => s?.gsc_connected).length,
    };
  } catch {
    return {
      agency_id: agency_id ?? '',
      period: period ?? 'last_30_days',
      generated_at: new Date().toISOString(),
      total_sites: 0,
      total_fixes_applied: 0,
      total_issues_resolved: 0,
      average_health_score: null,
      top_fix_types: [],
      sites_improved: 0,
      sites_declined: 0,
      gsc_connected_count: 0,
    };
  }
}

// ── Agency drift summary ──────────────────────────────────────────────────────

export interface AgencyDriftSummary {
  total_drift_events_7d: number;
  sites_with_drift:      number;
  most_affected_site:    string | null;
  most_common_cause:     string | null;
  fixes_requeued:        number;
}

export interface AgencyDriftDeps {
  loadFn?: (agency_id: string, period_days: number) => Promise<Array<{
    site_id: string;
    domain?: string;
    probable_cause: string;
    requeued: boolean;
  }>>;
}

export async function loadAgencyDriftSummary(
  agency_id: string,
  period_days: number = 7,
  deps?: AgencyDriftDeps,
): Promise<AgencyDriftSummary> {
  try {
    if (!agency_id) return emptyDriftSummary();
    const load = deps?.loadFn ?? defaultLoadDriftEvents;
    const events = await load(agency_id, period_days);
    if (!events || events.length === 0) return emptyDriftSummary();

    const siteSet = new Set(events.map(e => e.site_id));
    const causeCounts = new Map<string, number>();
    const siteCounts = new Map<string, number>();
    let requeued = 0;

    for (const e of events) {
      const cause = e.probable_cause || 'unknown';
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
      siteCounts.set(e.site_id, (siteCounts.get(e.site_id) ?? 0) + 1);
      if (e.requeued) requeued++;
    }

    let most_affected_site: string | null = null;
    let maxCount = 0;
    for (const [site, count] of siteCounts) {
      if (count > maxCount) { most_affected_site = site; maxCount = count; }
    }

    let most_common_cause: string | null = null;
    let maxCause = 0;
    for (const [cause, count] of causeCounts) {
      if (count > maxCause) { most_common_cause = cause; maxCause = count; }
    }

    return {
      total_drift_events_7d: events.length,
      sites_with_drift: siteSet.size,
      most_affected_site,
      most_common_cause,
      fixes_requeued: requeued,
    };
  } catch {
    return emptyDriftSummary();
  }
}

function emptyDriftSummary(): AgencyDriftSummary {
  return {
    total_drift_events_7d: 0,
    sites_with_drift: 0,
    most_affected_site: null,
    most_common_cause: null,
    fixes_requeued: 0,
  };
}

async function defaultLoadDriftEvents(
  _agency_id: string, _period_days: number,
): Promise<Array<{ site_id: string; domain?: string; probable_cause: string; requeued: boolean }>> {
  return [];
}

// ── formatAgencyReport ────────────────────────────────────────────────────────

export function formatAgencyReport(report: AgencyReport): string {
  try {
    if (!report) return 'No report data available.';
    const lines: string[] = [
      `Agency Report: ${report.agency_id}`,
      `Period: ${report.period}`,
      `Generated: ${report.generated_at}`,
      '',
      `Total Sites: ${report.total_sites}`,
      `Total Fixes Applied: ${report.total_fixes_applied}`,
      `Average Health Score: ${report.average_health_score ?? 'N/A'}`,
      `Sites Improved: ${report.sites_improved}`,
      `Sites Declined: ${report.sites_declined}`,
      `GSC Connected: ${report.gsc_connected_count}`,
      '',
      'Top Fix Types:',
    ];
    for (const t of (report.top_fix_types ?? [])) {
      lines.push(`  ${t.fix_type}: ${t.count}`);
    }
    if (report.drift_summary && report.drift_summary.total_drift_events_7d > 0) {
      lines.push('');
      lines.push('Drift Events This Period:');
      lines.push(`  Total Drift Events: ${report.drift_summary.total_drift_events_7d}`);
      lines.push(`  Sites With Drift: ${report.drift_summary.sites_with_drift}`);
      if (report.drift_summary.most_affected_site) {
        lines.push(`  Most Affected Site: ${report.drift_summary.most_affected_site}`);
      }
      if (report.drift_summary.most_common_cause) {
        lines.push(`  Most Common Cause: ${report.drift_summary.most_common_cause}`);
      }
      lines.push(`  Fixes Requeued: ${report.drift_summary.fixes_requeued}`);
    }
    return lines.join('\n');
  } catch {
    return 'No report data available.';
  }
}
