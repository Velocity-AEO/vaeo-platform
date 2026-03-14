/**
 * tools/sandbox/lighthouse_trend_detector.ts
 *
 * Detects gradual and sudden Lighthouse score degradation.
 * A page dropping 2 points per week never triggers a single 5-point alert
 * but is heading for trouble.
 *
 * Never throws.
 */

import type { LighthouseHistoryEntry } from './lighthouse_history_store.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type TrendType =
  | 'improving'
  | 'degrading_gradual'
  | 'degrading_sudden'
  | 'stable'
  | 'volatile'
  | 'insufficient_data';

export interface LighthouseTrend {
  url:                    string;
  site_id:                string;
  form_factor:            'mobile' | 'desktop';
  metric:                 'performance' | 'seo' | 'accessibility' | 'best_practices';
  trend_type:             TrendType;
  current_score:          number | null;
  score_7d_ago:           number | null;
  score_30d_ago:          number | null;
  change_7d:              number | null;
  change_30d:             number | null;
  weekly_average_change:  number | null;
  projected_score_30d:    number | null;
  alert_required:         boolean;
  alert_reason:           string | null;
  data_points:            number;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const GRADUAL_DEGRADATION_THRESHOLD = 2;
export const SUDDEN_DEGRADATION_THRESHOLD = 10;

// ── calculateWeeklyAverageChange ─────────────────────────────────────────────

export function calculateWeeklyAverageChange(
  scores: Array<{ score: number; measured_at: string }>,
): number | null {
  try {
    if (!scores || scores.length < 3) return null;

    // Linear regression: y = score, x = weeks since first measurement
    const sorted = [...scores].sort(
      (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime(),
    );
    const t0 = new Date(sorted[0].measured_at).getTime();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = sorted.length;

    for (const s of sorted) {
      const x = (new Date(s.measured_at).getTime() - t0) / msPerWeek;
      const y = s.score;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return 0;

    const slope = (n * sumXY - sumX * sumY) / denom;
    return Math.round(slope * 100) / 100;
  } catch {
    return null;
  }
}

// ── projectFutureScore ───────────────────────────────────────────────────────

export function projectFutureScore(
  current_score: number,
  weekly_change: number,
  weeks_ahead: number,
): number {
  try {
    const projected = current_score + weekly_change * weeks_ahead;
    return Math.max(0, Math.min(100, Math.round(projected)));
  } catch {
    return 0;
  }
}

// ── calculateStdDev ──────────────────────────────────────────────────────────

function calculateStdDev(values: number[]): number {
  try {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  } catch {
    return 0;
  }
}

// ── detectTrendType ──────────────────────────────────────────────────────────

export function detectTrendType(
  weekly_average_change: number | null,
  change_7d: number | null,
  data_points: number,
  scores?: number[],
): TrendType {
  try {
    if (data_points < 3) return 'insufficient_data';

    if (change_7d !== null && change_7d < -SUDDEN_DEGRADATION_THRESHOLD) {
      return 'degrading_sudden';
    }

    if (weekly_average_change !== null && weekly_average_change < -GRADUAL_DEGRADATION_THRESHOLD) {
      return 'degrading_gradual';
    }

    if (weekly_average_change !== null && weekly_average_change > GRADUAL_DEGRADATION_THRESHOLD) {
      return 'improving';
    }

    if (scores && scores.length >= 3 && calculateStdDev(scores) > 8) {
      return 'volatile';
    }

    return 'stable';
  } catch {
    return 'insufficient_data';
  }
}

// ── shouldAlert ──────────────────────────────────────────────────────────────

export function shouldAlert(
  trend: TrendType,
  projected_score_30d: number | null,
  current_score?: number | null,
): { alert: boolean; reason: string | null } {
  try {
    if (trend === 'degrading_sudden') {
      return { alert: true, reason: 'Sudden performance drop detected' };
    }

    if (trend === 'degrading_gradual' && projected_score_30d !== null && projected_score_30d < 70) {
      return { alert: true, reason: `Gradual degradation — projected to reach ${projected_score_30d} in 30 days` };
    }

    if (trend === 'volatile' && current_score != null && current_score < 75) {
      return { alert: true, reason: 'Volatile performance scores — investigate instability' };
    }

    return { alert: false, reason: null };
  } catch {
    return { alert: false, reason: null };
  }
}

// ── analyzeLighthouseTrends ──────────────────────────────────────────────────

const METRICS: Array<'performance' | 'seo' | 'accessibility' | 'best_practices'> = [
  'performance', 'seo', 'accessibility', 'best_practices',
];

export async function analyzeLighthouseTrends(
  site_id: string,
  url: string,
  form_factor: 'mobile' | 'desktop',
  deps?: { loadHistoryFn?: (site_id: string, url: string, form_factor: string, limit: number) => Promise<LighthouseHistoryEntry[]> },
): Promise<LighthouseTrend[]> {
  try {
    const load = deps?.loadHistoryFn ?? defaultLoadHistory;
    const entries = await load(site_id, url, form_factor, 30);
    if (!entries || entries.length === 0) return [];

    const sorted = [...entries].sort(
      (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
    );

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86_400_000;
    const thirtyDaysAgo = now - 30 * 86_400_000;

    const trends: LighthouseTrend[] = [];

    for (const metric of METRICS) {
      const withScores = sorted
        .filter(e => e[metric] !== null && e[metric] !== undefined)
        .map(e => ({ score: e[metric] as number, measured_at: e.measured_at }));

      const current = withScores.length > 0 ? withScores[0].score : null;

      const entry7d = withScores.find(
        e => new Date(e.measured_at).getTime() <= sevenDaysAgo,
      );
      const score7d = entry7d?.score ?? null;

      const entry30d = withScores.find(
        e => new Date(e.measured_at).getTime() <= thirtyDaysAgo,
      );
      const score30d = entry30d?.score ?? null;

      const change7d = current !== null && score7d !== null ? current - score7d : null;
      const change30d = current !== null && score30d !== null ? current - score30d : null;

      const weeklyChange = calculateWeeklyAverageChange(withScores);
      const projected = current !== null && weeklyChange !== null
        ? projectFutureScore(current, weeklyChange, 4.3)
        : null;

      const allScores = withScores.map(s => s.score);
      const trendType = detectTrendType(weeklyChange, change7d, withScores.length, allScores);
      const alertResult = shouldAlert(trendType, projected, current);

      trends.push({
        url,
        site_id,
        form_factor,
        metric,
        trend_type:            trendType,
        current_score:         current,
        score_7d_ago:          score7d,
        score_30d_ago:         score30d,
        change_7d:             change7d,
        change_30d:            change30d,
        weekly_average_change: weeklyChange,
        projected_score_30d:   projected,
        alert_required:        alertResult.alert,
        alert_reason:          alertResult.reason,
        data_points:           withScores.length,
      });
    }

    return trends;
  } catch {
    return [];
  }
}

// ── analyzeSiteTrends ────────────────────────────────────────────────────────

export async function analyzeSiteTrends(
  site_id: string,
  form_factor: 'mobile' | 'desktop',
  deps?: {
    loadHistoryFn?: (site_id: string, url: string, form_factor: string, limit: number) => Promise<LighthouseHistoryEntry[]>;
    loadSiteUrlsFn?: (site_id: string) => Promise<string[]>;
  },
): Promise<{
  url_trends: Array<{ url: string; trends: LighthouseTrend[]; requires_attention: boolean }>;
  sites_requiring_attention: number;
  total_alerts: number;
}> {
  try {
    const loadUrls = deps?.loadSiteUrlsFn ?? defaultLoadSiteUrls;
    const urls = await loadUrls(site_id);

    const url_trends: Array<{ url: string; trends: LighthouseTrend[]; requires_attention: boolean }> = [];
    let total_alerts = 0;
    let sites_requiring_attention = 0;

    for (const url of urls) {
      const trends = await analyzeLighthouseTrends(site_id, url, form_factor, {
        loadHistoryFn: deps?.loadHistoryFn,
      });
      const hasAlert = trends.some(t => t.alert_required);
      const alertCount = trends.filter(t => t.alert_required).length;
      total_alerts += alertCount;
      if (hasAlert) sites_requiring_attention++;

      url_trends.push({ url, trends, requires_attention: hasAlert });
    }

    return { url_trends, sites_requiring_attention, total_alerts };
  } catch {
    return { url_trends: [], sites_requiring_attention: 0, total_alerts: 0 };
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultLoadHistory(
  _site_id: string, _url: string, _form_factor: string, _limit: number,
): Promise<LighthouseHistoryEntry[]> {
  return [];
}

async function defaultLoadSiteUrls(_site_id: string): Promise<string[]> {
  return [];
}
