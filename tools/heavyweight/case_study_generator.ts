// tools/heavyweight/case_study_generator.ts — Case study generator
// Turns heavyweight sandbox results into publishable proof.
// Never throws.

import type { PerformanceAnalysis } from './performance_analyzer.js';
import type { FixValidationResult } from './fix_validator.js';
import type { LighthouseScore } from './fix_validator.js';
import type { ProductionSimulationResult } from './production_simulator.js';
import type { RegressionCheckResult } from './regression_guard.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScoreComparison {
  performance_delta: number;
  seo_delta: number;
  lcp_delta_ms: number;
  cls_delta: number;
  grade_before: string;
  grade_after: string;
}

export interface HeavyweightRun {
  run_id: string;
  site_id: string;
  url: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  score_before: LighthouseScore;
  score_after?: LighthouseScore;
  detected_apps: string[];
  fix_types_applied: string[];
  comparison?: ScoreComparison;
  simulation_result?: ProductionSimulationResult;
  regression_check?: RegressionCheckResult;
  recommendation?: string;
  duration_ms: number;
  started_at: string;
  completed_at?: string;
}

export interface CaseStudyInput {
  site_id: string;
  site_domain: string;
  run: HeavyweightRun;
  performance_analysis: PerformanceAnalysis;
  fix_validation: FixValidationResult;
}

export interface CaseStudySection {
  heading: string;
  body: string;
  data_points: { label: string; value: string }[];
}

export interface CaseStudyMetrics {
  performance_before: number;
  performance_after: number;
  performance_delta: number;
  lcp_before_ms: number;
  lcp_after_ms: number;
  lcp_delta_ms: number;
  apps_detected: number;
  fixes_applied: number;
  monthly_savings_usd: number;
}

export interface CaseStudy {
  site_id: string;
  site_domain: string;
  generated_at: string;
  headline: string;
  subheadline: string;
  sections: CaseStudySection[];
  metrics_snapshot: CaseStudyMetrics;
  pullquote: string;
  cta: string;
  shareable_summary: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

function pctChange(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round(((before - after) / before) * 100);
}

// ── Generator ────────────────────────────────────────────────────────────────

export function generateCaseStudy(input: CaseStudyInput): CaseStudy {
  const { run, performance_analysis, fix_validation, site_domain, site_id } = input;

  const isComplete = run.status === 'complete' && run.comparison && run.score_after;

  const perfBefore = run.score_before.performance;
  const perfAfter = isComplete ? run.score_after!.performance : perfBefore;
  const perfDelta = perfAfter - perfBefore;

  const lcpBefore = run.score_before.lcp_ms;
  const lcpAfter = isComplete ? run.score_after!.lcp_ms : lcpBefore;
  const lcpDelta = lcpBefore - lcpAfter;

  const appCount = run.detected_apps.length;
  const fixCount = fix_validation.fixes_applied.filter((f) => f.success).length;
  const savings = performance_analysis.vaeo_replaceable_savings_usd;

  const gradeBefore = gradeFromScore(perfBefore);
  const gradeAfter = gradeFromScore(perfAfter);

  // Build metrics
  const metrics: CaseStudyMetrics = {
    performance_before: perfBefore,
    performance_after: perfAfter,
    performance_delta: perfDelta,
    lcp_before_ms: lcpBefore,
    lcp_after_ms: lcpAfter,
    lcp_delta_ms: lcpDelta,
    apps_detected: appCount,
    fixes_applied: fixCount,
    monthly_savings_usd: savings,
  };

  if (!isComplete) {
    return {
      site_id,
      site_domain,
      generated_at: new Date().toISOString(),
      headline: `${site_domain}: VAEO Analysis In Progress`,
      subheadline: 'Run has not completed yet.',
      sections: [],
      metrics_snapshot: metrics,
      pullquote: '',
      cta: 'Ready to see these results on your store? Start your VAEO trial at vaeo.app',
      shareable_summary: `${site_domain} is being analyzed by VAEO's automated SEO platform.`,
    };
  }

  // Full case study
  const headline = `${site_domain}: +${perfDelta} Lighthouse Points in One VAEO Run`;
  const subheadline = `From ${perfBefore} to ${perfAfter} performance score with ${appCount} third-party apps running`;

  const sections: CaseStudySection[] = [];

  // Section 1: The Challenge
  const totalLoadMs = performance_analysis.total_third_party_load_ms;
  sections.push({
    heading: 'The Challenge',
    body: `${site_domain} was running ${appCount} third-party apps including ${run.detected_apps.join(', ')}. ` +
      `These apps were adding ${totalLoadMs}ms to every page load, ` +
      `resulting in a Lighthouse performance score of just ${perfBefore} and an LCP of ${(lcpBefore / 1000).toFixed(1)}s.`,
    data_points: [
      { label: 'Performance Score', value: String(perfBefore) },
      { label: 'LCP', value: `${(lcpBefore / 1000).toFixed(1)}s` },
      { label: 'Third-Party Apps', value: String(appCount) },
      { label: 'Estimated Load Cost', value: `${totalLoadMs}ms` },
    ],
  });

  // Section 2: What VAEO Found
  const offenderNames = performance_analysis.top_offenders.map((o) => o.app_name).join(', ');
  sections.push({
    heading: 'What VAEO Found',
    body: `VAEO's environment scanner detected ${appCount} third-party apps and identified the top performance offenders: ${offenderNames || 'none'}. ` +
      `The fix validator identified ${fix_validation.fix_types.length} fixable issues.`,
    data_points: [
      { label: 'Fix Types', value: fix_validation.fix_types.join(', ') },
      { label: 'Apps Identified', value: String(appCount) },
      { label: 'Performance Offenders', value: String(performance_analysis.top_offenders.length) },
    ],
  });

  // Section 3: What VAEO Fixed
  const appliedDescriptions = fix_validation.fixes_applied
    .filter((f) => f.success)
    .map((f) => f.change_description)
    .join('; ');
  const totalLines = fix_validation.fixes_applied.reduce((s, f) => s + f.lines_changed, 0);
  sections.push({
    heading: 'What VAEO Fixed',
    body: `VAEO applied ${fixCount} fixes in ${(run.duration_ms / 1000).toFixed(1)} seconds: ${appliedDescriptions || 'no fixes applied'}.`,
    data_points: [
      { label: 'Fixes Applied', value: String(fixCount) },
      { label: 'Lines Changed', value: String(totalLines) },
      { label: 'Time to Fix', value: `${(run.duration_ms / 1000).toFixed(1)}s` },
    ],
  });

  // Section 4: The Results
  sections.push({
    heading: 'The Results',
    body: `After VAEO's fixes, the Lighthouse performance score improved from ${perfBefore} to ${perfAfter} (+${perfDelta} points). ` +
      `LCP dropped from ${(lcpBefore / 1000).toFixed(1)}s to ${(lcpAfter / 1000).toFixed(1)}s` +
      (gradeBefore !== gradeAfter ? `, improving the grade from ${gradeBefore} to ${gradeAfter}` : '') + '.',
    data_points: [
      { label: 'Performance After', value: String(perfAfter) },
      { label: 'LCP After', value: `${(lcpAfter / 1000).toFixed(1)}s` },
      { label: 'Delta', value: `+${perfDelta}` },
      ...(gradeBefore !== gradeAfter ? [{ label: 'Grade', value: `${gradeBefore} → ${gradeAfter}` }] : []),
    ],
  });

  // Section 5: What's Next (if replaceable apps)
  const replaceableApps = performance_analysis.app_impacts.filter((a) => a.replaceable_by_vaeo);
  if (replaceableApps.length > 0) {
    sections.push({
      heading: "What's Next",
      body: `VAEO can replace ${replaceableApps.length} third-party apps with native components, ` +
        `saving an additional ${performance_analysis.vaeo_replaceable_savings_ms}ms of load time ` +
        `and $${savings}/month in app subscription costs.`,
      data_points: [
        { label: 'Replaceable Apps', value: String(replaceableApps.length) },
        { label: 'Savings Potential', value: `$${savings}/mo` },
      ],
    });
  }

  // Pullquote
  const lcpPct = pctChange(lcpBefore, lcpAfter);
  const pullquote = lcpDelta > 0
    ? `LCP dropped from ${(lcpBefore / 1000).toFixed(1)}s to ${(lcpAfter / 1000).toFixed(1)}s — a ${lcpPct}% improvement.`
    : `Performance score improved from ${perfBefore} to ${perfAfter} — a ${perfDelta}-point gain.`;

  const cta = 'Ready to see these results on your store? Start your VAEO trial at vaeo.app';

  const shareablePct = pctChange(lcpBefore, lcpAfter);
  const shareable = `${site_domain} improved Lighthouse performance from ${perfBefore} to ${perfAfter} (+${perfDelta} pts) ` +
    `using VAEO's automated SEO fix platform. LCP dropped ${shareablePct}%.`;

  return {
    site_id,
    site_domain,
    generated_at: new Date().toISOString(),
    headline,
    subheadline,
    sections,
    metrics_snapshot: metrics,
    pullquote,
    cta,
    shareable_summary: shareable,
  };
}
