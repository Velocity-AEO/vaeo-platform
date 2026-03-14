/**
 * tools/stats/site_stats.ts
 */

// ── SiteStats interface ───────────────────────────────────────────────────────

export interface SiteStats {
  site_id:               string;
  domain:                string;
  health_score:          number;
  health_score_delta:    number;
  health_score_trend:    'improving' | 'declining' | 'stable';
  total_fixes_applied:   number;
  fixes_this_month:      number;
  fixes_this_week:       number;
  issues_detected:       number;
  issues_resolved:       number;
  issues_pending:        number;
  pages_crawled:         number;
  pages_with_issues:     number;
  schema_coverage_pct:   number;
  avg_title_length:      number;
  avg_meta_length:       number;
  last_run_at:           string;
  last_run_fixes:        number;
  computed_at:           string;
}

// ── buildSiteStats ────────────────────────────────────────────────────────────

export function buildSiteStats(
  site_id:   string,
  domain:    string,
  overrides?: Partial<SiteStats>,
): SiteStats {
  try {
    const defaults: SiteStats = {
      site_id,
      domain,
      health_score:        72,
      health_score_delta:  8,
      health_score_trend:  'improving',
      total_fixes_applied: 47,
      fixes_this_month:    12,
      fixes_this_week:     3,
      issues_detected:     61,
      issues_resolved:     47,
      issues_pending:      14,
      pages_crawled:       89,
      pages_with_issues:   31,
      schema_coverage_pct: 68,
      avg_title_length:    54,
      avg_meta_length:     148,
      last_run_at:         new Date(Date.now() - 3600_000).toISOString(),
      last_run_fixes:      3,
      computed_at:         new Date().toISOString(),
    };
    return { ...defaults, ...(overrides ?? {}) };
  } catch {
    return {
      site_id:               site_id ?? '',
      domain:                domain ?? '',
      health_score:          0,
      health_score_delta:    0,
      health_score_trend:    'stable',
      total_fixes_applied:   0,
      fixes_this_month:      0,
      fixes_this_week:       0,
      issues_detected:       0,
      issues_resolved:       0,
      issues_pending:        0,
      pages_crawled:         0,
      pages_with_issues:     0,
      schema_coverage_pct:   0,
      avg_title_length:      0,
      avg_meta_length:       0,
      last_run_at:           new Date().toISOString(),
      last_run_fixes:        0,
      computed_at:           new Date().toISOString(),
    };
  }
}

// ── computeStatsDelta ─────────────────────────────────────────────────────────

const NUMERIC_FIELDS = [
  'health_score', 'health_score_delta', 'total_fixes_applied', 'fixes_this_month',
  'fixes_this_week', 'issues_detected', 'issues_resolved', 'issues_pending',
  'pages_crawled', 'pages_with_issues', 'schema_coverage_pct',
  'avg_title_length', 'avg_meta_length', 'last_run_fixes',
] as const;

type NumericField = typeof NUMERIC_FIELDS[number];

export function computeStatsDelta(
  current:  SiteStats,
  previous: SiteStats,
): Partial<SiteStats> {
  try {
    const delta: Partial<SiteStats> = {};
    for (const field of NUMERIC_FIELDS) {
      const cur  = (current  as unknown as Record<string, unknown>)[field] as number ?? 0;
      const prev = (previous as unknown as Record<string, unknown>)[field] as number ?? 0;
      (delta as unknown as Record<string, unknown>)[field] = cur - prev;
    }
    return delta;
  } catch {
    return {};
  }
}

// ── simulateStatsHistory ──────────────────────────────────────────────────────

export function simulateStatsHistory(
  site_id: string,
  domain:  string,
  days     = 30,
): SiteStats[] {
  try {
    const safeDays   = Math.max(1, days);
    const finalScore = 72;
    const startScore = Math.max(20, finalScore - Math.floor(safeDays * 0.5));

    return Array.from({ length: safeDays }, (_, i) => {
      const daysAgo      = safeDays - 1 - i;           // 0 = most recent
      const progress     = safeDays > 1 ? i / (safeDays - 1) : 1;
      const health_score = Math.round(startScore + (finalScore - startScore) * progress);
      const fixes_applied = Math.round(47 * progress);

      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      return buildSiteStats(site_id, domain, {
        health_score,
        health_score_delta:  health_score > startScore ? 8 : 0,
        health_score_trend:  'improving',
        total_fixes_applied: fixes_applied,
        fixes_this_month:    Math.round(12 * progress),
        fixes_this_week:     Math.round(3 * progress),
        issues_resolved:     fixes_applied,
        issues_pending:      Math.max(0, 61 - fixes_applied),
        computed_at:         date.toISOString(),
        last_run_at:         new Date(date.getTime() - 3600_000).toISOString(),
      });
    });
  } catch {
    return [];
  }
}
