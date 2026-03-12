/**
 * tools/rankings/ranking_entry.ts
 */

import { randomUUID } from 'node:crypto';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RankingEntry {
  entry_id:          string;
  site_id:           string;
  keyword:           string;
  url:               string;
  position:          number;
  position_previous?: number;
  position_delta?:   number;
  impressions:       number;
  clicks:            number;
  ctr:               number;
  recorded_at:       string;
  source:            'gsc' | 'manual' | 'simulated';
  trend:             RankingTrend;
}

export type RankingTrend = 'up' | 'down' | 'flat' | 'new';

export interface RankingSnapshot {
  site_id:            string;
  snapshot_id:        string;
  entries:            RankingEntry[];
  total_keywords:     number;
  avg_position:       number;
  keywords_in_top_3:  number;
  keywords_in_top_10: number;
  keywords_improved:  number;
  keywords_dropped:   number;
  keywords_new:       number;
  snapshot_date:      string;
}

// ── deriveRankingTrend ────────────────────────────────────────────────────────

export function deriveRankingTrend(current: number, previous?: number): RankingTrend {
  try {
    if (previous === undefined || previous === null) return 'new';
    const delta = previous - current; // positive = improvement (lower position number)
    if (Math.abs(delta) < 1) return 'flat';
    return delta > 0 ? 'up' : 'down';
  } catch {
    return 'flat';
  }
}

// ── buildRankingEntry ─────────────────────────────────────────────────────────

export function buildRankingEntry(
  site_id:           string,
  keyword:           string,
  url:               string,
  position:          number,
  impressions:       number,
  clicks:            number,
  previous_position?: number,
): RankingEntry {
  try {
    const position_delta = previous_position !== undefined
      ? previous_position - position
      : undefined;

    return {
      entry_id:          randomUUID(),
      site_id,
      keyword,
      url,
      position,
      position_previous: previous_position,
      position_delta,
      impressions,
      clicks,
      ctr:               impressions > 0 ? clicks / impressions : 0,
      recorded_at:       new Date().toISOString(),
      source:            'simulated',
      trend:             deriveRankingTrend(position, previous_position),
    };
  } catch {
    return {
      entry_id:    randomUUID(),
      site_id:     site_id ?? '',
      keyword:     keyword ?? '',
      url:         url ?? '',
      position:    position ?? 0,
      impressions: 0,
      clicks:      0,
      ctr:         0,
      recorded_at: new Date().toISOString(),
      source:      'simulated',
      trend:       'flat',
    };
  }
}

// ── buildRankingSnapshot ──────────────────────────────────────────────────────

export function buildRankingSnapshot(site_id: string, entries: RankingEntry[]): RankingSnapshot {
  try {
    const safeEntries = entries ?? [];
    const total = safeEntries.length;
    const avg_position = total > 0
      ? safeEntries.reduce((s, e) => s + e.position, 0) / total
      : 0;

    return {
      site_id,
      snapshot_id:        randomUUID(),
      entries:            safeEntries,
      total_keywords:     total,
      avg_position:       Math.round(avg_position * 10) / 10,
      keywords_in_top_3:  safeEntries.filter(e => e.position <= 3).length,
      keywords_in_top_10: safeEntries.filter(e => e.position <= 10).length,
      keywords_improved:  safeEntries.filter(e => e.trend === 'up').length,
      keywords_dropped:   safeEntries.filter(e => e.trend === 'down').length,
      keywords_new:       safeEntries.filter(e => e.trend === 'new').length,
      snapshot_date:      new Date().toISOString(),
    };
  } catch {
    return {
      site_id:            site_id ?? '',
      snapshot_id:        randomUUID(),
      entries:            [],
      total_keywords:     0,
      avg_position:       0,
      keywords_in_top_3:  0,
      keywords_in_top_10: 0,
      keywords_improved:  0,
      keywords_dropped:   0,
      keywords_new:       0,
      snapshot_date:      new Date().toISOString(),
    };
  }
}
