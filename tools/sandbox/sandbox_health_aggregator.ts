/**
 * tools/sandbox/sandbox_health_aggregator.ts
 *
 * Aggregates sandbox pass rates, Lighthouse deltas, and failure reasons
 * across all sites and runs. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SandboxRunResult {
  site_id:          string;
  url:              string;
  passed:           boolean;
  failure_reason?:  string;
  mobile_lighthouse?:  number;
  desktop_lighthouse?: number;
  lighthouse_delta?:   number;
  timed_out?:       boolean;
  partial_capture?: boolean;
  viewport_failed?: boolean;
  delta_verify_failed?: boolean;
  regression_detected?: boolean;
  run_date:         string;
}

export interface SandboxHealthMetrics {
  site_id:                 string;
  period_days:             number;
  total_runs:              number;
  passed_runs:             number;
  failed_runs:             number;
  pass_rate:               number;
  avg_mobile_lighthouse:   number | null;
  avg_desktop_lighthouse:  number | null;
  avg_lighthouse_delta:    number | null;
  top_failure_reasons:     Array<{ reason: string; count: number; percentage: number }>;
  timed_out_captures:      number;
  partial_captures:        number;
  viewport_failures:       number;
  delta_verify_failures:   number;
  regression_detections:   number;
  most_problematic_url:    string | null;
  trend:                   'improving' | 'degrading' | 'stable';
  generated_at:            string;
}

export interface PlatformSandboxHealth {
  period_days:             number;
  total_sites:             number;
  total_runs:              number;
  overall_pass_rate:       number;
  avg_mobile_lighthouse:   number | null;
  sites_below_70_mobile:   number;
  sites_with_high_drift:   number;
  top_failure_reasons:     Array<{ reason: string; count: number }>;
  healthiest_site:         string | null;
  most_problematic_site:   string | null;
  generated_at:            string;
}

export interface SiteHealthDeps {
  loadResultsFn?: (site_id: string, period_days: number) => Promise<SandboxRunResult[]>;
}

export interface PlatformHealthDeps {
  loadAllResultsFn?: (period_days: number) => Promise<SandboxRunResult[]>;
}

// ── calculatePassRate ────────────────────────────────────────────────────────

export function calculatePassRate(passed: number, total: number): number {
  try {
    if (!total || total <= 0) return 0;
    return Math.round((passed / total) * 100 * 10) / 10;
  } catch {
    return 0;
  }
}

// ── detectHealthTrend ────────────────────────────────────────────────────────

export function detectHealthTrend(
  recent_pass_rate: number,
  older_pass_rate: number,
): 'improving' | 'degrading' | 'stable' {
  try {
    const diff = (recent_pass_rate ?? 0) - (older_pass_rate ?? 0);
    if (diff > 5) return 'improving';
    if (diff < -5) return 'degrading';
    return 'stable';
  } catch {
    return 'stable';
  }
}

// ── getMostProblematicUrl ────────────────────────────────────────────────────

export function getMostProblematicUrl(
  results: Array<{ url: string; passed: boolean }>,
): string | null {
  try {
    if (!Array.isArray(results)) return null;
    const failures = new Map<string, number>();
    for (const r of results) {
      if (!r.passed && r.url) {
        failures.set(r.url, (failures.get(r.url) ?? 0) + 1);
      }
    }
    if (failures.size === 0) return null;
    let maxUrl: string | null = null;
    let maxCount = 0;
    for (const [url, count] of failures) {
      if (count > maxCount) { maxUrl = url; maxCount = count; }
    }
    return maxUrl;
  } catch {
    return null;
  }
}

// ── aggregateFailureReasons ──────────────────────────────────────────────────

function aggregateFailureReasons(
  results: SandboxRunResult[],
): Array<{ reason: string; count: number; percentage: number }> {
  try {
    const counts = new Map<string, number>();
    let totalFailed = 0;
    for (const r of results) {
      if (!r.passed && r.failure_reason) {
        counts.set(r.failure_reason, (counts.get(r.failure_reason) ?? 0) + 1);
        totalFailed++;
      }
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalFailed > 0 ? Math.round((count / totalFailed) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

// ── avgOrNull ────────────────────────────────────────────────────────────────

function avgOrNull(values: (number | undefined | null)[]): number | null {
  try {
    const nums = values.filter((v): v is number => v != null && !isNaN(v));
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  } catch {
    return null;
  }
}

// ── calculateSiteHealth ──────────────────────────────────────────────────────

export async function calculateSiteHealth(
  site_id: string,
  period_days: number = 7,
  deps?: SiteHealthDeps,
): Promise<SandboxHealthMetrics> {
  try {
    if (!site_id) return emptyMetrics('', period_days);
    const load = deps?.loadResultsFn ?? defaultLoadResults;
    const results = await load(site_id, period_days);
    if (!results || results.length === 0) return emptyMetrics(site_id, period_days);

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const pass_rate = calculatePassRate(passed, results.length);

    // Trend: split results by date midpoint
    const sorted = [...results].sort((a, b) => a.run_date.localeCompare(b.run_date));
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    const olderRate = older.length > 0 ? calculatePassRate(older.filter(r => r.passed).length, older.length) : pass_rate;
    const recentRate = recent.length > 0 ? calculatePassRate(recent.filter(r => r.passed).length, recent.length) : pass_rate;

    return {
      site_id,
      period_days,
      total_runs: results.length,
      passed_runs: passed,
      failed_runs: failed,
      pass_rate,
      avg_mobile_lighthouse: avgOrNull(results.map(r => r.mobile_lighthouse)),
      avg_desktop_lighthouse: avgOrNull(results.map(r => r.desktop_lighthouse)),
      avg_lighthouse_delta: avgOrNull(results.map(r => r.lighthouse_delta)),
      top_failure_reasons: aggregateFailureReasons(results),
      timed_out_captures: results.filter(r => r.timed_out).length,
      partial_captures: results.filter(r => r.partial_capture).length,
      viewport_failures: results.filter(r => r.viewport_failed).length,
      delta_verify_failures: results.filter(r => r.delta_verify_failed).length,
      regression_detections: results.filter(r => r.regression_detected).length,
      most_problematic_url: getMostProblematicUrl(results),
      trend: detectHealthTrend(recentRate, olderRate),
      generated_at: new Date().toISOString(),
    };
  } catch {
    return emptyMetrics(site_id ?? '', period_days);
  }
}

// ── calculatePlatformHealth ──────────────────────────────────────────────────

export async function calculatePlatformHealth(
  period_days: number = 7,
  deps?: PlatformHealthDeps,
): Promise<PlatformSandboxHealth> {
  try {
    const load = deps?.loadAllResultsFn ?? defaultLoadAllResults;
    const results = await load(period_days);
    if (!results || results.length === 0) return emptyPlatformHealth(period_days);

    const passed = results.filter(r => r.passed).length;
    const sites = new Map<string, { passed: number; total: number; mobileScores: number[] }>();

    for (const r of results) {
      const s = sites.get(r.site_id) ?? { passed: 0, total: 0, mobileScores: [] };
      s.total++;
      if (r.passed) s.passed++;
      if (r.mobile_lighthouse != null) s.mobileScores.push(r.mobile_lighthouse);
      sites.set(r.site_id, s);
    }

    let healthiest: string | null = null;
    let bestRate = -1;
    let worst: string | null = null;
    let worstRate = 101;
    let below70 = 0;
    let highDrift = 0;

    for (const [sid, s] of sites) {
      const rate = calculatePassRate(s.passed, s.total);
      if (rate > bestRate) { healthiest = sid; bestRate = rate; }
      if (rate < worstRate) { worst = sid; worstRate = rate; }
      const avgMobile = s.mobileScores.length > 0
        ? s.mobileScores.reduce((a, b) => a + b, 0) / s.mobileScores.length
        : null;
      if (avgMobile != null && avgMobile < 70) below70++;
      if (rate < 70) highDrift++;
    }

    // Top failure reasons (without percentage, simpler for platform)
    const reasonCounts = new Map<string, number>();
    for (const r of results) {
      if (!r.passed && r.failure_reason) {
        reasonCounts.set(r.failure_reason, (reasonCounts.get(r.failure_reason) ?? 0) + 1);
      }
    }
    const topReasons = [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      period_days,
      total_sites: sites.size,
      total_runs: results.length,
      overall_pass_rate: calculatePassRate(passed, results.length),
      avg_mobile_lighthouse: avgOrNull(results.map(r => r.mobile_lighthouse)),
      sites_below_70_mobile: below70,
      sites_with_high_drift: highDrift,
      top_failure_reasons: topReasons,
      healthiest_site: healthiest,
      most_problematic_site: worst,
      generated_at: new Date().toISOString(),
    };
  } catch {
    return emptyPlatformHealth(period_days);
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

function emptyMetrics(site_id: string, period_days: number): SandboxHealthMetrics {
  return {
    site_id,
    period_days,
    total_runs: 0,
    passed_runs: 0,
    failed_runs: 0,
    pass_rate: 0,
    avg_mobile_lighthouse: null,
    avg_desktop_lighthouse: null,
    avg_lighthouse_delta: null,
    top_failure_reasons: [],
    timed_out_captures: 0,
    partial_captures: 0,
    viewport_failures: 0,
    delta_verify_failures: 0,
    regression_detections: 0,
    most_problematic_url: null,
    trend: 'stable',
    generated_at: new Date().toISOString(),
  };
}

function emptyPlatformHealth(period_days: number): PlatformSandboxHealth {
  return {
    period_days,
    total_sites: 0,
    total_runs: 0,
    overall_pass_rate: 0,
    avg_mobile_lighthouse: null,
    sites_below_70_mobile: 0,
    sites_with_high_drift: 0,
    top_failure_reasons: [],
    healthiest_site: null,
    most_problematic_site: null,
    generated_at: new Date().toISOString(),
  };
}

async function defaultLoadResults(_site_id: string, _period_days: number): Promise<SandboxRunResult[]> {
  return [];
}

async function defaultLoadAllResults(_period_days: number): Promise<SandboxRunResult[]> {
  return [];
}
