/**
 * tools/reports/report_aggregator.ts
 *
 * Aggregates all site data into a single SiteReport for the
 * client-facing dashboard. Pulls health score trends, fix history,
 * Lighthouse snapshots, regression alerts, AEO coverage, and GSC data.
 *
 * Pure logic — all I/O goes through injectable deps.
 * Never throws — missing data sections return empty/zero values.
 */

import type { Grade } from '../scoring/health_score.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FixSummary {
  url:           string;
  issue_type:    string;
  applied_at:    string;
  confidence:    number;
  auto_approved: boolean;
}

export interface LighthouseSnapshot {
  score:       number;
  lcp:         number;
  cls:         number;
  measured_at: string;
}

export interface RegressionSummary {
  url:         string;
  signal:      string;
  detected_at: string;
  severity:    string;
}

export interface GSCPageSummary {
  url:         string;
  clicks:      number;
  impressions: number;
  position:    number;
}

export interface SiteReport {
  site_id:      string;
  site_url:     string;
  generated_at: string;
  health: {
    current_score: number;
    current_grade: Grade;
    score_7d_ago:  number;
    score_30d_ago: number;
    trend:         'improving' | 'declining' | 'stable';
  };
  fixes: {
    total_applied: number;
    this_week:     number;
    this_month:    number;
    by_type:       Record<string, number>;
    recent:        FixSummary[];
  };
  performance: {
    lighthouse_current?: LighthouseSnapshot;
    lighthouse_30d_ago?: LighthouseSnapshot;
    lcp_delta?:          number;
    performance_delta?:  number;
  };
  regressions: {
    active:              number;
    resolved_this_week:  number;
    recent:              RegressionSummary[];
  };
  aeo: {
    speakable_pages: number;
    faq_pages:       number;
    answer_blocks:   number;
  };
  gsc: {
    total_clicks_28d:      number;
    total_impressions_28d: number;
    avg_position:          number;
    top_pages:             GSCPageSummary[];
  };
  error?: string;
}

// ── Injectable deps ─────────────────────────────────────────────────────────

export interface ReportDeps {
  /** Load site record. Returns null if not found. */
  loadSite: (siteId: string) => Promise<{ site_url: string } | null>;
  /** Load current health score + grade. */
  loadHealthScore: (siteId: string) => Promise<{ score: number; grade: Grade } | null>;
  /** Load historical health score for a date. */
  loadHealthScoreAt: (siteId: string, daysAgo: number) => Promise<number | null>;
  /** Load applied fixes with metadata. */
  loadFixes: (siteId: string) => Promise<Array<{
    url: string;
    issue_type: string;
    applied_at: string;
    confidence: number;
    auto_approved: boolean;
  }>>;
  /** Load latest Lighthouse snapshot. */
  loadLighthouseCurrent: (siteId: string) => Promise<LighthouseSnapshot | null>;
  /** Load Lighthouse snapshot from ~30 days ago. */
  loadLighthouse30d: (siteId: string) => Promise<LighthouseSnapshot | null>;
  /** Load active regression alerts. */
  loadRegressions: (siteId: string) => Promise<Array<{
    url: string;
    signal: string;
    detected_at: string;
    severity: string;
    resolved: boolean;
  }>>;
  /** Load AEO coverage counts. */
  loadAEOCoverage: (siteId: string) => Promise<{
    speakable_pages: number;
    faq_pages: number;
    answer_blocks: number;
  }>;
  /** Load GSC summary data. */
  loadGSCData: (siteId: string) => Promise<{
    total_clicks_28d: number;
    total_impressions_28d: number;
    avg_position: number;
    top_pages: GSCPageSummary[];
  } | null>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function determineTrend(current: number, weekAgo: number, monthAgo: number): 'improving' | 'declining' | 'stable' {
  // Compare against 7-day average first, then 30-day
  const delta7  = current - weekAgo;
  const delta30 = current - monthAgo;

  if (delta7 >= 3 || delta30 >= 5) return 'improving';
  if (delta7 <= -3 || delta30 <= -5) return 'declining';
  return 'stable';
}

function isWithinDays(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

function countByType(fixes: Array<{ issue_type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const fix of fixes) {
    counts[fix.issue_type] = (counts[fix.issue_type] ?? 0) + 1;
  }
  return counts;
}

// ── Empty report ────────────────────────────────────────────────────────────

function emptyReport(siteId: string, error: string): SiteReport {
  return {
    site_id: siteId,
    site_url: '',
    generated_at: new Date().toISOString(),
    health: { current_score: 0, current_grade: 'F', score_7d_ago: 0, score_30d_ago: 0, trend: 'stable' },
    fixes: { total_applied: 0, this_week: 0, this_month: 0, by_type: {}, recent: [] },
    performance: {},
    regressions: { active: 0, resolved_this_week: 0, recent: [] },
    aeo: { speakable_pages: 0, faq_pages: 0, answer_blocks: 0 },
    gsc: { total_clicks_28d: 0, total_impressions_28d: 0, avg_position: 0, top_pages: [] },
    error,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate a comprehensive site report for the client dashboard.
 *
 * Non-fatal: missing data sections return empty/zero values.
 * Only returns error if the site itself cannot be loaded.
 */
export async function generateSiteReport(
  siteId: string,
  deps: ReportDeps,
): Promise<SiteReport> {
  // 1. Load site — this is the only fatal check
  let siteUrl: string;
  try {
    const site = await deps.loadSite(siteId);
    if (!site) return emptyReport(siteId, `Site not found: ${siteId}`);
    siteUrl = site.site_url;
  } catch (err) {
    return emptyReport(siteId, `Site load error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Load all data in parallel — each section is non-fatal
  const [
    healthResult,
    score7dResult,
    score30dResult,
    fixesResult,
    lhCurrentResult,
    lh30dResult,
    regressionsResult,
    aeoResult,
    gscResult,
  ] = await Promise.allSettled([
    deps.loadHealthScore(siteId),
    deps.loadHealthScoreAt(siteId, 7),
    deps.loadHealthScoreAt(siteId, 30),
    deps.loadFixes(siteId),
    deps.loadLighthouseCurrent(siteId),
    deps.loadLighthouse30d(siteId),
    deps.loadRegressions(siteId),
    deps.loadAEOCoverage(siteId),
    deps.loadGSCData(siteId),
  ]);

  // 3. Extract results (defaulting on rejection)
  const health    = healthResult.status    === 'fulfilled' ? healthResult.value    : null;
  const score7d   = score7dResult.status   === 'fulfilled' ? score7dResult.value   : null;
  const score30d  = score30dResult.status  === 'fulfilled' ? score30dResult.value  : null;
  const fixes     = fixesResult.status     === 'fulfilled' ? fixesResult.value     : [];
  const lhCurrent = lhCurrentResult.status === 'fulfilled' ? lhCurrentResult.value : null;
  const lh30d     = lh30dResult.status     === 'fulfilled' ? lh30dResult.value     : null;
  const regs      = regressionsResult.status === 'fulfilled' ? regressionsResult.value : [];
  const aeo       = aeoResult.status       === 'fulfilled' ? aeoResult.value       : { speakable_pages: 0, faq_pages: 0, answer_blocks: 0 };
  const gsc       = gscResult.status       === 'fulfilled' ? gscResult.value       : null;

  // 4. Build health section
  const currentScore = health?.score ?? 0;
  const currentGrade = health?.grade ?? 'F' as Grade;
  const weekAgoScore = score7d ?? currentScore;
  const monthAgoScore = score30d ?? currentScore;

  // 5. Build fixes section
  const thisWeek  = fixes.filter((f) => isWithinDays(f.applied_at, 7));
  const thisMonth = fixes.filter((f) => isWithinDays(f.applied_at, 30));
  const recentFixes: FixSummary[] = fixes
    .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
    .slice(0, 10)
    .map((f) => ({
      url:           f.url,
      issue_type:    f.issue_type,
      applied_at:    f.applied_at,
      confidence:    f.confidence,
      auto_approved: f.auto_approved,
    }));

  // 6. Build performance section
  const performance: SiteReport['performance'] = {};
  if (lhCurrent) {
    performance.lighthouse_current = lhCurrent;
  }
  if (lh30d) {
    performance.lighthouse_30d_ago = lh30d;
  }
  if (lhCurrent && lh30d) {
    performance.lcp_delta = lhCurrent.lcp - lh30d.lcp;
    performance.performance_delta = lhCurrent.score - lh30d.score;
  }

  // 7. Build regressions section
  const activeRegs   = regs.filter((r) => !r.resolved);
  const resolvedWeek = regs.filter((r) => r.resolved && isWithinDays(r.detected_at, 7));
  const recentRegs: RegressionSummary[] = activeRegs
    .slice(0, 10)
    .map((r) => ({
      url:         r.url,
      signal:      r.signal,
      detected_at: r.detected_at,
      severity:    r.severity,
    }));

  // 8. Assemble
  return {
    site_id:      siteId,
    site_url:     siteUrl,
    generated_at: new Date().toISOString(),
    health: {
      current_score: currentScore,
      current_grade: currentGrade,
      score_7d_ago:  weekAgoScore,
      score_30d_ago: monthAgoScore,
      trend:         determineTrend(currentScore, weekAgoScore, monthAgoScore),
    },
    fixes: {
      total_applied: fixes.length,
      this_week:     thisWeek.length,
      this_month:    thisMonth.length,
      by_type:       countByType(fixes),
      recent:        recentFixes,
    },
    performance,
    regressions: {
      active:             activeRegs.length,
      resolved_this_week: resolvedWeek.length,
      recent:             recentRegs,
    },
    aeo,
    gsc: gsc ?? { total_clicks_28d: 0, total_impressions_28d: 0, avg_position: 0, top_pages: [] },
  };
}
