import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePositionChange,
  determineTrendDirection,
  buildKeywordTrend,
  calculateTrendSummary,
  calculateSiteTrends,
  type KeywordTrend,
  type TrendSummary,
} from './rankings_trend_calculator.js';
import type { RankingEntry, RankingSnapshot } from './ranking_entry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<RankingEntry> = {}): RankingEntry {
  return {
    entry_id:    'e_1',
    site_id:     'site_1',
    keyword:     'beach decor',
    url:         'https://example.com/page',
    position:    5,
    impressions: 100,
    clicks:      10,
    ctr:         0.1,
    recorded_at: '2025-01-01T00:00:00Z',
    source:      'simulated',
    trend:       'flat',
    ...overrides,
  };
}

function makeSnapshot(entries: RankingEntry[], overrides: Partial<RankingSnapshot> = {}): RankingSnapshot {
  return {
    site_id:            'site_1',
    snapshot_id:        'snap_1',
    entries,
    total_keywords:     entries.length,
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

// ── calculatePositionChange ──────────────────────────────────────────────────

describe('calculatePositionChange', () => {
  it('returns positive for improvement (lower pos)', () => {
    assert.equal(calculatePositionChange(5, 10), 5);
  });

  it('returns negative for decline (higher pos)', () => {
    assert.equal(calculatePositionChange(10, 5), -5);
  });

  it('returns 0 for same position', () => {
    assert.equal(calculatePositionChange(5, 5), 0);
  });

  it('returns 0 when previous is null', () => {
    assert.equal(calculatePositionChange(5, null), 0);
  });

  it('returns 0 when previous is undefined', () => {
    assert.equal(calculatePositionChange(5, undefined), 0);
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() => calculatePositionChange(null as any, null as any));
  });
});

// ── determineTrendDirection ──────────────────────────────────────────────────

describe('determineTrendDirection', () => {
  it('returns improved when position dropped', () => {
    assert.equal(determineTrendDirection(3, 10), 'improved');
  });

  it('returns declined when position rose', () => {
    assert.equal(determineTrendDirection(10, 3), 'declined');
  });

  it('returns stable for no change', () => {
    assert.equal(determineTrendDirection(5, 5), 'stable');
  });

  it('returns stable for sub-1 change', () => {
    assert.equal(determineTrendDirection(5, 5.5), 'stable');
  });

  it('returns new when previous is null', () => {
    assert.equal(determineTrendDirection(5, null), 'new');
  });

  it('returns new when previous is undefined', () => {
    assert.equal(determineTrendDirection(5, undefined), 'new');
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() => determineTrendDirection(null as any, null as any));
  });
});

// ── buildKeywordTrend ────────────────────────────────────────────────────────

describe('buildKeywordTrend', () => {
  it('builds trend from current and previous entries', () => {
    const current = makeEntry({ position: 3, keyword: 'beach decor' });
    const previous = makeEntry({ position: 10 });
    const trend = buildKeywordTrend(current, previous, 'week');
    assert.equal(trend.keyword, 'beach decor');
    assert.equal(trend.current_position, 3);
    assert.equal(trend.previous_position, 10);
    assert.equal(trend.position_change, 7);
    assert.equal(trend.direction, 'improved');
    assert.equal(trend.period, 'week');
  });

  it('handles null previous', () => {
    const current = makeEntry({ position: 5 });
    const trend = buildKeywordTrend(current, null, 'month');
    assert.equal(trend.previous_position, null);
    assert.equal(trend.direction, 'new');
  });

  it('handles undefined previous', () => {
    const current = makeEntry({ position: 5 });
    const trend = buildKeywordTrend(current, undefined, 'week');
    assert.equal(trend.direction, 'new');
  });

  it('includes clicks/impressions/ctr', () => {
    const current = makeEntry({ clicks: 50, impressions: 500, ctr: 0.1 });
    const trend = buildKeywordTrend(current, null, 'week');
    assert.equal(trend.current_clicks, 50);
    assert.equal(trend.current_impressions, 500);
    assert.equal(trend.current_ctr, 0.1);
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() => buildKeywordTrend(null as any, null as any, 'week'));
  });
});

// ── calculateTrendSummary ────────────────────────────────────────────────────

describe('calculateTrendSummary', () => {
  const trends: KeywordTrend[] = [
    { keyword: 'a', url: '', current_position: 3, previous_position: 10, position_change: 7, direction: 'improved', period: 'week', current_clicks: 0, current_impressions: 0, current_ctr: 0 },
    { keyword: 'b', url: '', current_position: 5, previous_position: 5, position_change: 0, direction: 'stable', period: 'week', current_clicks: 0, current_impressions: 0, current_ctr: 0 },
    { keyword: 'c', url: '', current_position: 15, previous_position: 8, position_change: -7, direction: 'declined', period: 'week', current_clicks: 0, current_impressions: 0, current_ctr: 0 },
    { keyword: 'd', url: '', current_position: 20, previous_position: null, position_change: 0, direction: 'new', period: 'week', current_clicks: 0, current_impressions: 0, current_ctr: 0 },
  ];

  it('counts improved correctly', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.improved_count, 1);
  });

  it('counts declined correctly', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.declined_count, 1);
  });

  it('counts stable correctly', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.stable_count, 1);
  });

  it('counts new correctly', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.new_count, 1);
  });

  it('calculates avg_position_change', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.avg_position_change, 0); // (7 + 0 + -7 + 0) / 4
  });

  it('selects top_movers', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.top_movers.length, 1);
    assert.equal(s.top_movers[0].keyword, 'a');
  });

  it('selects top_losers', () => {
    const s = calculateTrendSummary('site_1', trends, 'week');
    assert.equal(s.top_losers.length, 1);
    assert.equal(s.top_losers[0].keyword, 'c');
  });

  it('limits top_movers to 5', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      keyword: `kw_${i}`, url: '', current_position: i + 1, previous_position: i + 10,
      position_change: 9, direction: 'improved' as const, period: 'week' as const,
      current_clicks: 0, current_impressions: 0, current_ctr: 0,
    }));
    const s = calculateTrendSummary('site_1', many, 'week');
    assert.equal(s.top_movers.length, 5);
  });

  it('handles empty trends', () => {
    const s = calculateTrendSummary('site_1', [], 'week');
    assert.equal(s.total_keywords, 0);
    assert.equal(s.avg_position_change, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateTrendSummary(null as any, null as any, 'week'));
  });
});

// ── calculateSiteTrends ──────────────────────────────────────────────────────

describe('calculateSiteTrends', () => {
  it('matches current keywords to previous by keyword name', () => {
    const current = makeSnapshot([
      makeEntry({ keyword: 'beach decor', position: 3 }),
      makeEntry({ keyword: 'rattan furniture', position: 5 }),
    ]);
    const previous = makeSnapshot([
      makeEntry({ keyword: 'beach decor', position: 10 }),
      makeEntry({ keyword: 'rattan furniture', position: 5 }),
    ]);
    const result = calculateSiteTrends('site_1', current, previous, 'week');
    assert.equal(result.total_keywords, 2);
    assert.equal(result.improved_count, 1);
    assert.equal(result.stable_count, 1);
  });

  it('marks new keywords when no previous snapshot', () => {
    const current = makeSnapshot([makeEntry({ keyword: 'new kw', position: 8 })]);
    const result = calculateSiteTrends('site_1', current, null, 'month');
    assert.equal(result.new_count, 1);
  });

  it('marks new keywords not in previous', () => {
    const current = makeSnapshot([makeEntry({ keyword: 'fresh kw', position: 4 })]);
    const previous = makeSnapshot([makeEntry({ keyword: 'old kw', position: 10 })]);
    const result = calculateSiteTrends('site_1', current, previous, 'week');
    assert.equal(result.new_count, 1);
  });

  it('preserves period', () => {
    const current = makeSnapshot([]);
    const result = calculateSiteTrends('site_1', current, null, 'month');
    assert.equal(result.period, 'month');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateSiteTrends(null as any, null as any, null as any, 'week'));
  });
});
