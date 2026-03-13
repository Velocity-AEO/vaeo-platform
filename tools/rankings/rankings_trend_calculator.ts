/**
 * tools/rankings/rankings_trend_calculator.ts
 *
 * Calculates week-over-week and month-over-month keyword position changes.
 * Never throws at outer level.
 */

import type { RankingEntry, RankingSnapshot } from './ranking_entry.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type TrendDirection = 'improved' | 'declined' | 'stable' | 'new';
export type TrendPeriod = 'week' | 'month';

export interface KeywordTrend {
  keyword:            string;
  url:                string;
  current_position:   number;
  previous_position:  number | null;
  position_change:    number;
  direction:          TrendDirection;
  period:             TrendPeriod;
  current_clicks:     number;
  current_impressions: number;
  current_ctr:        number;
}

export interface TrendSummary {
  site_id:            string;
  period:             TrendPeriod;
  total_keywords:     number;
  improved_count:     number;
  declined_count:     number;
  stable_count:       number;
  new_count:          number;
  avg_position_change: number;
  top_movers:         KeywordTrend[];
  top_losers:         KeywordTrend[];
  trends:             KeywordTrend[];
  calculated_at:      string;
}

// ── Core functions ───────────────────────────────────────────────────────────

export function calculatePositionChange(
  current: number,
  previous: number | null | undefined,
): number {
  try {
    if (previous === null || previous === undefined) return 0;
    return previous - current; // positive = improved (lower position number is better)
  } catch {
    return 0;
  }
}

export function determineTrendDirection(
  current: number,
  previous: number | null | undefined,
): TrendDirection {
  try {
    if (previous === null || previous === undefined) return 'new';
    const change = previous - current;
    if (Math.abs(change) < 1) return 'stable';
    return change > 0 ? 'improved' : 'declined';
  } catch {
    return 'stable';
  }
}

export function buildKeywordTrend(
  current: RankingEntry,
  previous: RankingEntry | null | undefined,
  period: TrendPeriod,
): KeywordTrend {
  try {
    const prev_pos = previous?.position ?? null;
    return {
      keyword:             current.keyword,
      url:                 current.url,
      current_position:    current.position,
      previous_position:   prev_pos,
      position_change:     calculatePositionChange(current.position, prev_pos),
      direction:           determineTrendDirection(current.position, prev_pos),
      period,
      current_clicks:      current.clicks,
      current_impressions: current.impressions,
      current_ctr:         current.ctr,
    };
  } catch {
    return {
      keyword:             current?.keyword ?? '',
      url:                 current?.url ?? '',
      current_position:    current?.position ?? 0,
      previous_position:   null,
      position_change:     0,
      direction:           'stable',
      period,
      current_clicks:      0,
      current_impressions: 0,
      current_ctr:         0,
    };
  }
}

export function calculateTrendSummary(
  site_id: string,
  trends: KeywordTrend[],
  period: TrendPeriod,
): TrendSummary {
  try {
    const safe = trends ?? [];
    const improved = safe.filter(t => t.direction === 'improved');
    const declined = safe.filter(t => t.direction === 'declined');
    const stable   = safe.filter(t => t.direction === 'stable');
    const newKw    = safe.filter(t => t.direction === 'new');

    const totalChange = safe.reduce((s, t) => s + t.position_change, 0);
    const avg = safe.length > 0 ? Math.round((totalChange / safe.length) * 10) / 10 : 0;

    // Top movers: biggest positive change (improved most)
    const top_movers = [...improved]
      .sort((a, b) => b.position_change - a.position_change)
      .slice(0, 5);

    // Top losers: biggest negative change (declined most)
    const top_losers = [...declined]
      .sort((a, b) => a.position_change - b.position_change)
      .slice(0, 5);

    return {
      site_id,
      period,
      total_keywords:      safe.length,
      improved_count:      improved.length,
      declined_count:      declined.length,
      stable_count:        stable.length,
      new_count:           newKw.length,
      avg_position_change: avg,
      top_movers,
      top_losers,
      trends:              safe,
      calculated_at:       new Date().toISOString(),
    };
  } catch {
    return {
      site_id:             site_id ?? '',
      period,
      total_keywords:      0,
      improved_count:      0,
      declined_count:      0,
      stable_count:        0,
      new_count:           0,
      avg_position_change: 0,
      top_movers:          [],
      top_losers:          [],
      trends:              [],
      calculated_at:       new Date().toISOString(),
    };
  }
}

export function calculateSiteTrends(
  site_id: string,
  current_snapshot: RankingSnapshot,
  previous_snapshot: RankingSnapshot | null | undefined,
  period: TrendPeriod,
): TrendSummary {
  try {
    const currentEntries = current_snapshot?.entries ?? [];

    // Build lookup of previous entries by keyword
    const prevByKeyword = new Map<string, RankingEntry>();
    if (previous_snapshot?.entries) {
      for (const entry of previous_snapshot.entries) {
        prevByKeyword.set(entry.keyword, entry);
      }
    }

    const trends = currentEntries.map(entry =>
      buildKeywordTrend(entry, prevByKeyword.get(entry.keyword) ?? null, period),
    );

    return calculateTrendSummary(site_id, trends, period);
  } catch {
    return calculateTrendSummary(site_id ?? '', [], period);
  }
}
