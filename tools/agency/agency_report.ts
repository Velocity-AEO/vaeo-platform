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
    return lines.join('\n');
  } catch {
    return 'No report data available.';
  }
}
