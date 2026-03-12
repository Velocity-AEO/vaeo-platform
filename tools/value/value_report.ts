/**
 * tools/value/value_report.ts
 *
 * Generates client-facing Proof of Value reports combining
 * metrics, before/after comparisons, and ranking snapshots.
 *
 * Never throws.
 */

import { randomUUID } from 'node:crypto';
import {
  calculateValue,
  formatValueSummary,
  defaultAssumptions,
  type ValueMetrics,
  type ValueAssumptions,
  type RankingSnapshot,
  type SiteStats,
} from './value_calculator.js';
import {
  buildComparisonReport,
  type BeforeAfterComparison,
  type FixHistoryEntry,
} from './before_after.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FixHistoryPage {
  entries: FixHistoryEntry[];
  total:   number;
}

export interface ValueReport {
  report_id:         string;
  site_id:           string;
  domain:            string;
  period_days:       number;
  period_label:      string;
  generated_at:      string;
  metrics:           ValueMetrics;
  top_comparisons:   BeforeAfterComparison[];
  ranking_snapshot:   RankingSnapshot;
  stats:             SiteStats;
  summary_paragraph: string;
  headline:          string;
  shareable:         boolean;
  share_token?:      string;
}

// ── Generate report ──────────────────────────────────────────────────────────

export function generateValueReport(
  site_id: string,
  domain: string,
  stats: SiteStats,
  rankings: RankingSnapshot,
  history: FixHistoryPage,
  assumptions?: ValueAssumptions,
): ValueReport {
  try {
    const effectiveAssumptions = assumptions ?? defaultAssumptions();
    const metrics = calculateValue(site_id, domain, stats, rankings, effectiveAssumptions);
    const allComparisons = buildComparisonReport(site_id, history.entries);
    const top_comparisons = allComparisons.slice(0, 5);
    const summary_paragraph = formatValueSummary(metrics);

    let headline: string;
    if (metrics.estimated_revenue_impact > 1000) {
      headline = `${domain} gained an estimated $${Math.round(metrics.estimated_revenue_impact)} in 30 days`;
    } else if (metrics.health_score_gain >= 10) {
      headline = `${domain} health score up ${metrics.health_score_gain} points this month`;
    } else {
      headline = `${metrics.fixes_applied} SEO fixes applied to ${domain} this month`;
    }

    return {
      report_id: randomUUID(),
      site_id,
      domain,
      period_days: 30,
      period_label: 'Last 30 Days',
      generated_at: new Date().toISOString(),
      metrics,
      top_comparisons,
      ranking_snapshot: rankings,
      stats,
      summary_paragraph,
      headline,
      shareable: true,
      share_token: randomUUID(),
    };
  } catch {
    return {
      report_id: randomUUID(),
      site_id,
      domain,
      period_days: 30,
      period_label: 'Last 30 Days',
      generated_at: new Date().toISOString(),
      metrics: calculateValue(site_id, domain, { fixes_applied: 0, issues_resolved: 0, schema_coverage_pct: 0, health_score_delta: 0 }, { site_id, keywords: [], taken_at: new Date().toISOString() }, defaultAssumptions()),
      top_comparisons: [],
      ranking_snapshot: { site_id, keywords: [], taken_at: new Date().toISOString() },
      stats: { fixes_applied: 0, issues_resolved: 0, schema_coverage_pct: 0, health_score_delta: 0 },
      summary_paragraph: '',
      headline: `0 SEO fixes applied to ${domain} this month`,
      shareable: true,
      share_token: randomUUID(),
    };
  }
}

// ── Export as text ────────────────────────────────────────────────────────────

export function exportReportAsText(report: ValueReport): string {
  try {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════════════');
    lines.push(`  PROOF OF VALUE — ${report.domain.toUpperCase()}`);
    lines.push(`  ${report.period_label}`);
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`  ${report.headline}`);
    lines.push('');
    lines.push('─── KEY METRICS ───────────────────────────────────────');
    lines.push(`  Fixes Applied:        ${report.metrics.fixes_applied}`);
    lines.push(`  Issues Resolved:      ${report.metrics.issues_resolved}`);
    lines.push(`  Pages Fixed:          ${report.metrics.pages_fixed}`);
    lines.push(`  Est. Traffic Gain:    +${Math.round(report.metrics.estimated_traffic_gain)} visitors/month`);
    lines.push(`  Est. Revenue Impact:  $${Math.round(report.metrics.estimated_revenue_impact)}`);
    lines.push(`  Health Score Gain:    +${report.metrics.health_score_gain} points`);
    lines.push(`  Time Saved:           ${report.metrics.time_saved_hours} hours`);
    lines.push(`  Schema Coverage Gain: +${report.metrics.schema_coverage_gain_pct}%`);
    lines.push('');

    if (report.top_comparisons.length > 0) {
      lines.push('─── TOP IMPROVEMENTS ──────────────────────────────────');
      for (const c of report.top_comparisons) {
        lines.push(`  ${c.fix_label} (${c.url})`);
        lines.push(`    Before: ${c.before_value || '(empty)'}`);
        lines.push(`    After:  ${c.after_value}`);
        lines.push(`    Quality: ${c.quality_score_before} → ${c.quality_score_after} (+${c.quality_delta})`);
        lines.push('');
      }
    }

    const improved = report.ranking_snapshot.keywords.filter((k) => k.position_delta > 0);
    if (improved.length > 0) {
      lines.push('─── RANKING IMPROVEMENTS ──────────────────────────────');
      for (const k of improved) {
        lines.push(`  "${k.keyword}": ${k.position_before} → ${k.position_after} (+${k.position_delta})`);
      }
      lines.push('');
    }

    lines.push('─── SUMMARY ───────────────────────────────────────────');
    lines.push(`  ${report.summary_paragraph}`);
    lines.push('');
    lines.push('  Generated by Velocity AEO');
    lines.push(`  ${report.generated_at}`);

    return lines.join('\n');
  } catch {
    return `Proof of Value — ${report.domain}\n\nReport generation error.`;
  }
}
