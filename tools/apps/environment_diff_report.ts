/**
 * tools/apps/environment_diff_report.ts
 *
 * Builds an environment diff report from a scan, including
 * performance cost estimates, top offenders, recommendations,
 * and prioritized action items.
 *
 * Pure function — never throws.
 */

import type { EnvironmentScan, DetectedApp } from './environment_scanner.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnvironmentDiffReport {
  site_id:                string;
  generated_at:           string;
  detected_apps:          DetectedApp[];
  total_monthly_spend:    number;
  vaeo_replacement_savings: number;
  performance_cost_ms:    number;
  top_offenders:          {
    app_name:    string;
    impact:      string;
    monthly_cost: number;
    replaceable: boolean;
  }[];
  recommendation_summary: string;
  action_items:           {
    priority:              'high' | 'medium' | 'low';
    action:                string;
    potential_saving_ms?:  number;
    potential_saving_usd?: number;
  }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const IMPACT_MS: Record<string, number> = {
  critical: 500,
  high:     200,
  medium:   50,
  low:      10,
};

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

function impactMs(impact: string): number {
  return IMPACT_MS[impact] ?? 0;
}

// ── Report builder ───────────────────────────────────────────────────────────

export function buildEnvironmentDiffReport(
  scan: EnvironmentScan,
): EnvironmentDiffReport {
  const result: EnvironmentDiffReport = {
    site_id:                 scan.site_id,
    generated_at:            new Date().toISOString(),
    detected_apps:           [],
    total_monthly_spend:     0,
    vaeo_replacement_savings: 0,
    performance_cost_ms:     0,
    top_offenders:           [],
    recommendation_summary:  '',
    action_items:            [],
  };

  try {
    if (!scan?.detected_apps) return result;

    result.detected_apps           = scan.detected_apps;
    result.total_monthly_spend     = scan.estimated_monthly_spend;
    result.vaeo_replacement_savings = scan.vaeo_replacement_savings;

    // ── Performance cost ─────────────────────────────────────────────────
    result.performance_cost_ms = scan.detected_apps.reduce(
      (sum, d) => sum + impactMs(d.fingerprint.performance_impact),
      0,
    );

    // ── Top offenders (top 5 by impact, critical first) ──────────────────
    const sorted = [...scan.detected_apps].sort(
      (a, b) =>
        (IMPACT_ORDER[a.fingerprint.performance_impact] ?? 9) -
        (IMPACT_ORDER[b.fingerprint.performance_impact] ?? 9),
    );

    result.top_offenders = sorted.slice(0, 5).map((d) => ({
      app_name:     d.fingerprint.name,
      impact:       d.fingerprint.performance_impact,
      monthly_cost: d.estimated_monthly_cost,
      replaceable:  d.fingerprint.replaceable_by_vaeo,
    }));

    // ── Action items ─────────────────────────────────────────────────────
    for (const d of scan.detected_apps) {
      if (d.fingerprint.replaceable_by_vaeo) {
        result.action_items.push({
          priority:             'high',
          action:               `Replace ${d.fingerprint.name} with VAEO native component`,
          potential_saving_usd: d.estimated_monthly_cost,
          potential_saving_ms:  impactMs(d.fingerprint.performance_impact),
        });
      } else if (
        d.fingerprint.performance_impact === 'critical' ||
        d.fingerprint.performance_impact === 'high'
      ) {
        result.action_items.push({
          priority:            'medium',
          action:              `Review ${d.fingerprint.name} — adds ${impactMs(d.fingerprint.performance_impact)}ms to page load`,
          potential_saving_ms: impactMs(d.fingerprint.performance_impact),
        });
      }
    }

    // ── Recommendation summary ───────────────────────────────────────────
    const totalApps = scan.total_apps_detected;
    const costMs    = result.performance_cost_ms.toLocaleString();
    const parts: string[] = [
      `Your store has ${totalApps} installed app${totalApps !== 1 ? 's' : ''} adding an estimated ${costMs}ms to page load time.`,
    ];

    if (scan.replaceable_count > 0 && scan.vaeo_replacement_savings > 0) {
      parts.push(
        `VAEO can replace ${scan.replaceable_count} app${scan.replaceable_count !== 1 ? 's' : ''}, saving you $${scan.vaeo_replacement_savings.toFixed(0)}/month.`,
      );
    }

    result.recommendation_summary = parts.join(' ');
  } catch {
    // Never throws
  }

  return result;
}
