import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDateNDaysAgo,
  loadLatestRankings,
  loadRankingsAtDate,
  loadWeeklyComparison,
  loadMonthlyComparison,
  type RankingHistoryDeps,
} from './rankings_history_loader.js';
import type { RankingSnapshot } from './ranking_entry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<RankingSnapshot> = {}): RankingSnapshot {
  return {
    site_id:            'site_1',
    snapshot_id:        'snap_1',
    entries:            [],
    total_keywords:     0,
    avg_position:       0,
    keywords_in_top_3:  0,
    keywords_in_top_10: 0,
    keywords_improved:  0,
    keywords_dropped:   0,
    keywords_new:       0,
    snapshot_date:      '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── getDateNDaysAgo ──────────────────────────────────────────────────────────

describe('getDateNDaysAgo', () => {
  it('returns today for 0', () => {
    const result = getDateNDaysAgo(0);
    assert.equal(result, new Date().toISOString().slice(0, 10));
  });

  it('returns 7 days ago', () => {
    const from = new Date('2025-03-15T12:00:00Z');
    assert.equal(getDateNDaysAgo(7, from), '2025-03-08');
  });

  it('returns 30 days ago', () => {
    const from = new Date('2025-03-30T12:00:00Z');
    assert.equal(getDateNDaysAgo(30, from), '2025-02-28');
  });

  it('clamps negative to 0', () => {
    const from = new Date('2025-03-15T12:00:00Z');
    assert.equal(getDateNDaysAgo(-5, from), '2025-03-15');
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() => getDateNDaysAgo(null as any));
  });
});

// ── loadLatestRankings ───────────────────────────────────────────────────────

describe('loadLatestRankings', () => {
  it('uses simulator fallback when no deps', async () => {
    const result = await loadLatestRankings('site_1', 'example.com');
    assert.ok(result);
    assert.equal(result!.site_id, 'site_1');
    assert.ok(result!.entries.length > 0);
  });

  it('uses custom loader when provided', async () => {
    const snap = makeSnapshot({ site_id: 'custom' });
    const deps: RankingHistoryDeps = {
      loadSnapshotsFn: async () => [snap],
    };
    const result = await loadLatestRankings('site_1', 'example.com', deps);
    assert.equal(result!.site_id, 'custom');
  });

  it('returns null when custom loader returns empty', async () => {
    const deps: RankingHistoryDeps = {
      loadSnapshotsFn: async () => [],
    };
    const result = await loadLatestRankings('site_1', 'example.com', deps);
    assert.equal(result, null);
  });

  it('returns null on error', async () => {
    const deps: RankingHistoryDeps = {
      loadSnapshotsFn: async () => { throw new Error('db down'); },
    };
    const result = await loadLatestRankings('site_1', 'example.com', deps);
    assert.equal(result, null);
  });
});

// ── loadRankingsAtDate ───────────────────────────────────────────────────────

describe('loadRankingsAtDate', () => {
  it('uses simulator fallback for reasonable past date', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const result = await loadRankingsAtDate('site_1', 'example.com', d.toISOString().slice(0, 10));
    assert.ok(result);
  });

  it('returns null for date too far in future', async () => {
    const result = await loadRankingsAtDate('site_1', 'example.com', '2099-01-01');
    assert.equal(result, null);
  });

  it('uses custom loader when provided', async () => {
    const snap = makeSnapshot({ snapshot_date: '2025-01-01' });
    const deps: RankingHistoryDeps = {
      loadSnapshotsFn: async () => [snap],
    };
    const result = await loadRankingsAtDate('site_1', 'example.com', '2025-01-01', deps);
    assert.ok(result);
  });

  it('returns null on error', async () => {
    const deps: RankingHistoryDeps = {
      loadSnapshotsFn: async () => { throw new Error('fail'); },
    };
    const result = await loadRankingsAtDate('site_1', 'example.com', '2025-01-01', deps);
    assert.equal(result, null);
  });
});

// ── loadWeeklyComparison ─────────────────────────────────────────────────────

describe('loadWeeklyComparison', () => {
  it('returns period=week', async () => {
    const result = await loadWeeklyComparison('site_1', 'example.com');
    assert.equal(result.period, 'week');
  });

  it('has current and previous dates', async () => {
    const result = await loadWeeklyComparison('site_1', 'example.com');
    assert.ok(result.current_date);
    assert.ok(result.previous_date);
    assert.notEqual(result.current_date, result.previous_date);
  });

  it('returns snapshots from simulator', async () => {
    const result = await loadWeeklyComparison('site_1', 'example.com');
    assert.ok(result.current);
    assert.ok(result.previous);
  });

  it('never throws on bad input', async () => {
    await assert.doesNotReject(() => loadWeeklyComparison(null as any, null as any));
  });
});

// ── loadMonthlyComparison ────────────────────────────────────────────────────

describe('loadMonthlyComparison', () => {
  it('returns period=month', async () => {
    const result = await loadMonthlyComparison('site_1', 'example.com');
    assert.equal(result.period, 'month');
  });

  it('has current and previous dates', async () => {
    const result = await loadMonthlyComparison('site_1', 'example.com');
    assert.ok(result.current_date);
    assert.ok(result.previous_date);
  });

  it('previous date is ~30 days before current', async () => {
    const result = await loadMonthlyComparison('site_1', 'example.com');
    const curr = new Date(result.current_date);
    const prev = new Date(result.previous_date);
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    assert.equal(diff, 30);
  });

  it('never throws on bad input', async () => {
    await assert.doesNotReject(() => loadMonthlyComparison(null as any, null as any));
  });
});
