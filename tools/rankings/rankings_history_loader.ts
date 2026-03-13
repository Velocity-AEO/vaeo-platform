/**
 * tools/rankings/rankings_history_loader.ts
 *
 * Loads ranking snapshots for comparison periods (weekly, monthly).
 * Uses simulator fallback when no live data is available.
 * Never throws at outer level.
 */

import type { RankingSnapshot } from './ranking_entry.js';
import { simulateRankings, simulateRankingHistory } from './ranking_simulator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RankingHistoryDeps {
  /** Override snapshot loader for testing */
  loadSnapshotsFn?: (site_id: string, from_date: string, to_date: string) => Promise<RankingSnapshot[]>;
}

export interface WeeklyComparison {
  current:  RankingSnapshot | null;
  previous: RankingSnapshot | null;
  period:   'week';
  current_date:  string;
  previous_date: string;
}

export interface MonthlyComparison {
  current:  RankingSnapshot | null;
  previous: RankingSnapshot | null;
  period:   'month';
  current_date:  string;
  previous_date: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getDateNDaysAgo(n: number, from?: Date): string {
  try {
    const d = from ? new Date(from) : new Date();
    d.setDate(d.getDate() - Math.max(0, n));
    return d.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── Loaders ──────────────────────────────────────────────────────────────────

export async function loadLatestRankings(
  site_id: string,
  domain: string,
  deps?: RankingHistoryDeps,
): Promise<RankingSnapshot | null> {
  try {
    if (deps?.loadSnapshotsFn) {
      const today = new Date().toISOString().slice(0, 10);
      const snapshots = await deps.loadSnapshotsFn(site_id, today, today);
      return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    }
    // Simulator fallback
    return simulateRankings(site_id, domain);
  } catch {
    return null;
  }
}

export async function loadRankingsAtDate(
  site_id: string,
  domain: string,
  target_date: string,
  deps?: RankingHistoryDeps,
): Promise<RankingSnapshot | null> {
  try {
    if (deps?.loadSnapshotsFn) {
      const snapshots = await deps.loadSnapshotsFn(site_id, target_date, target_date);
      return snapshots.length > 0 ? snapshots[0] : null;
    }
    // Simulator fallback — generate history and pick the right date
    const today = new Date();
    const target = new Date(target_date);
    const daysAgo = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo < 0 || daysAgo > 90) return null;
    const history = simulateRankingHistory(site_id, domain, Math.max(daysAgo + 1, 2));
    // First snapshot is the oldest
    return history.length > 0 ? history[0] : null;
  } catch {
    return null;
  }
}

export async function loadWeeklyComparison(
  site_id: string,
  domain: string,
  deps?: RankingHistoryDeps,
): Promise<WeeklyComparison> {
  try {
    const current_date  = getDateNDaysAgo(0);
    const previous_date = getDateNDaysAgo(7);

    const [current, previous] = await Promise.all([
      loadLatestRankings(site_id, domain, deps),
      loadRankingsAtDate(site_id, domain, previous_date, deps),
    ]);

    return { current, previous, period: 'week', current_date, previous_date };
  } catch {
    return {
      current:       null,
      previous:      null,
      period:        'week',
      current_date:  getDateNDaysAgo(0),
      previous_date: getDateNDaysAgo(7),
    };
  }
}

export async function loadMonthlyComparison(
  site_id: string,
  domain: string,
  deps?: RankingHistoryDeps,
): Promise<MonthlyComparison> {
  try {
    const current_date  = getDateNDaysAgo(0);
    const previous_date = getDateNDaysAgo(30);

    const [current, previous] = await Promise.all([
      loadLatestRankings(site_id, domain, deps),
      loadRankingsAtDate(site_id, domain, previous_date, deps),
    ]);

    return { current, previous, period: 'month', current_date, previous_date };
  } catch {
    return {
      current:       null,
      previous:      null,
      period:        'month',
      current_date:  getDateNDaysAgo(0),
      previous_date: getDateNDaysAgo(30),
    };
  }
}
