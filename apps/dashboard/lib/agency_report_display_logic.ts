/**
 * apps/dashboard/lib/agency_report_display_logic.ts
 *
 * Display helpers for the agency report page.
 * Never throws.
 */

// ── getBarWidth ──────────────────────────────────────────────────────────────

export function getBarWidth(value: number, max: number): number {
  try {
    if (!max || max <= 0 || value < 0) return 0;
    const pct = (value / max) * 100;
    return Math.min(Math.round(pct), 100);
  } catch {
    return 0;
  }
}

// ── getPeriodLabel ───────────────────────────────────────────────────────────

export function getPeriodLabel(period: string): string {
  try {
    switch (period) {
      case 'last_7_days':  return 'Last 7 Days';
      case 'last_30_days': return 'Last 30 Days';
      case 'last_90_days': return 'Last 90 Days';
      default:             return period ?? 'Unknown';
    }
  } catch {
    return 'Unknown';
  }
}

// ── getImprovementLabel ──────────────────────────────────────────────────────

export function getImprovementLabel(
  improved: number,
  declined: number,
  total: number,
): string {
  try {
    if (total <= 0) return 'No sites';
    if (improved === total) return 'All sites improved';
    if (declined === 0) return `${improved} of ${total} sites improved`;
    return `${improved} improved, ${declined} declined`;
  } catch {
    return 'No data';
  }
}

// ── generateDownloadContent ──────────────────────────────────────────────────

export interface AgencyReportData {
  agency_id:            string;
  period:               string;
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

export function generateDownloadContent(report: AgencyReportData): string {
  try {
    if (!report) return '';
    const lines: string[] = [
      `Agency Report: ${report.agency_id}`,
      `Period: ${getPeriodLabel(report.period)}`,
      `Generated: ${report.generated_at}`,
      '',
      `Total Sites: ${report.total_sites}`,
      `Fixes Applied: ${report.total_fixes_applied}`,
      `Issues Resolved: ${report.total_issues_resolved}`,
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
    return '';
  }
}

// ── getHealthScoreColor ──────────────────────────────────────────────────────

export function getHealthScoreColor(score: number | null): string {
  try {
    if (score == null) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  } catch {
    return 'text-gray-400';
  }
}

// ── getMaxFixCount ───────────────────────────────────────────────────────────

export function getMaxFixCount(fixTypes: Array<{ fix_type: string; count: number }>): number {
  try {
    if (!Array.isArray(fixTypes) || fixTypes.length === 0) return 0;
    return Math.max(...fixTypes.map(t => t.count));
  } catch {
    return 0;
  }
}
