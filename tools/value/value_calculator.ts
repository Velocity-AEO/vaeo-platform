/**
 * tools/value/value_calculator.ts
 *
 * Calculates the monetary and SEO value VAEO has delivered to a site.
 * Traffic gain, revenue impact, time saved, health score improvement.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ValueMetrics {
  site_id:                     string;
  domain:                      string;
  fixes_applied:               number;
  estimated_traffic_gain:      number;
  estimated_traffic_gain_pct:  number;
  estimated_revenue_impact:    number;
  avg_position_improvement:    number;
  keywords_moved_to_top_10:   number;
  schema_coverage_gain_pct:   number;
  health_score_gain:           number;
  pages_fixed:                 number;
  issues_resolved:             number;
  time_saved_hours:            number;
  computed_at:                 string;
}

export interface ValueAssumptions {
  avg_order_value:                number;
  conversion_rate:                number;
  monthly_visitors_before:        number;
  avg_position_ctr_gain_per_rank: number;
}

export interface KeywordRanking {
  keyword:           string;
  position_before:   number;
  position_after:    number;
  position_delta:    number;
  impressions:       number;
  clicks_before:     number;
  clicks_after:      number;
}

export interface RankingSnapshot {
  site_id:   string;
  keywords:  KeywordRanking[];
  taken_at:  string;
}

export interface SiteStats {
  fixes_applied:         number;
  issues_resolved:       number;
  schema_coverage_pct:   number;
  health_score_delta:    number;
}

// ── Default assumptions ──────────────────────────────────────────────────────

export function defaultAssumptions(): ValueAssumptions {
  try {
    return {
      avg_order_value:                85,
      conversion_rate:                0.025,
      monthly_visitors_before:        1200,
      avg_position_ctr_gain_per_rank: 0.015,
    };
  } catch {
    return {
      avg_order_value: 85,
      conversion_rate: 0.025,
      monthly_visitors_before: 1200,
      avg_position_ctr_gain_per_rank: 0.015,
    };
  }
}

// ── Calculate value ──────────────────────────────────────────────────────────

export function calculateValue(
  site_id: string,
  domain: string,
  stats: SiteStats,
  rankings: RankingSnapshot,
  assumptions: ValueAssumptions,
): ValueMetrics {
  try {
    const improved = rankings.keywords.filter((k) => k.position_delta > 0);

    // Traffic gain: sum of (position_delta * ctr_gain_per_rank * impressions)
    const estimated_traffic_gain = improved.reduce(
      (sum, k) => sum + k.position_delta * assumptions.avg_position_ctr_gain_per_rank * k.impressions,
      0,
    );

    const estimated_traffic_gain_pct =
      assumptions.monthly_visitors_before > 0
        ? (estimated_traffic_gain / assumptions.monthly_visitors_before) * 100
        : 0;

    const estimated_revenue_impact =
      estimated_traffic_gain * assumptions.conversion_rate * assumptions.avg_order_value;

    const avg_position_improvement =
      improved.length > 0
        ? improved.reduce((sum, k) => sum + k.position_delta, 0) / improved.length
        : 0;

    const keywords_moved_to_top_10 = rankings.keywords.filter(
      (k) => k.position_before > 10 && k.position_after <= 10,
    ).length;

    const schema_coverage_gain_pct = Math.max(0, stats.schema_coverage_pct - 40);

    const time_saved_hours = stats.fixes_applied * 0.5;

    return {
      site_id,
      domain,
      fixes_applied: stats.fixes_applied,
      estimated_traffic_gain: Math.round(estimated_traffic_gain * 100) / 100,
      estimated_traffic_gain_pct: Math.round(estimated_traffic_gain_pct * 100) / 100,
      estimated_revenue_impact: Math.round(estimated_revenue_impact * 100) / 100,
      avg_position_improvement: Math.round(avg_position_improvement * 100) / 100,
      keywords_moved_to_top_10,
      schema_coverage_gain_pct,
      health_score_gain: stats.health_score_delta,
      pages_fixed: stats.issues_resolved,
      issues_resolved: stats.issues_resolved,
      time_saved_hours,
      computed_at: new Date().toISOString(),
    };
  } catch {
    return {
      site_id,
      domain,
      fixes_applied: 0,
      estimated_traffic_gain: 0,
      estimated_traffic_gain_pct: 0,
      estimated_revenue_impact: 0,
      avg_position_improvement: 0,
      keywords_moved_to_top_10: 0,
      schema_coverage_gain_pct: 0,
      health_score_gain: 0,
      pages_fixed: 0,
      issues_resolved: 0,
      time_saved_hours: 0,
      computed_at: new Date().toISOString(),
    };
  }
}

// ── Format value summary ─────────────────────────────────────────────────────

export function formatValueSummary(metrics: ValueMetrics): string {
  try {
    return `In the past 30 days, VAEO applied ${metrics.fixes_applied} fixes to ${metrics.domain}, resolving ${metrics.issues_resolved} SEO issues across ${metrics.pages_fixed} pages. Your health score improved by ${metrics.health_score_gain} points. We estimate an additional ${Math.round(metrics.estimated_traffic_gain)} monthly visitors and $${Math.round(metrics.estimated_revenue_impact)} in potential revenue impact. This saved approximately ${metrics.time_saved_hours} hours of manual SEO work.`;
  } catch {
    return '';
  }
}
