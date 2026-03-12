/**
 * tools/value/value_calculator.test.ts
 *
 * Tests for value calculation engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultAssumptions,
  calculateValue,
  formatValueSummary,
  type SiteStats,
  type RankingSnapshot,
  type ValueAssumptions,
  type KeywordRanking,
} from './value_calculator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockStats(overrides?: Partial<SiteStats>): SiteStats {
  return {
    fixes_applied: 12,
    issues_resolved: 18,
    schema_coverage_pct: 75,
    health_score_delta: 15,
    ...overrides,
  };
}

function mockKeyword(overrides?: Partial<KeywordRanking>): KeywordRanking {
  return {
    keyword: 'test keyword',
    position_before: 20,
    position_after: 8,
    position_delta: 12,
    impressions: 500,
    clicks_before: 5,
    clicks_after: 25,
    ...overrides,
  };
}

function mockRankings(keywords?: KeywordRanking[]): RankingSnapshot {
  return {
    site_id: 'site_1',
    keywords: keywords ?? [mockKeyword()],
    taken_at: new Date().toISOString(),
  };
}

// ── defaultAssumptions ──────────────────────────────────────────────────────

describe('defaultAssumptions', () => {
  it('returns avg_order_value of 85', () => {
    assert.equal(defaultAssumptions().avg_order_value, 85);
  });

  it('returns conversion_rate of 0.025', () => {
    assert.equal(defaultAssumptions().conversion_rate, 0.025);
  });

  it('returns monthly_visitors_before of 1200', () => {
    assert.equal(defaultAssumptions().monthly_visitors_before, 1200);
  });

  it('returns avg_position_ctr_gain_per_rank of 0.015', () => {
    assert.equal(defaultAssumptions().avg_position_ctr_gain_per_rank, 0.015);
  });
});

// ── calculateValue ──────────────────────────────────────────────────────────

describe('calculateValue — traffic gain', () => {
  it('computes traffic gain from improved keywords', () => {
    const assumptions = defaultAssumptions();
    const kw = mockKeyword({ position_delta: 10, impressions: 1000 });
    // 10 * 0.015 * 1000 = 150
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw]), assumptions);
    assert.equal(result.estimated_traffic_gain, 150);
  });

  it('sums traffic gain across multiple keywords', () => {
    const assumptions = defaultAssumptions();
    const kw1 = mockKeyword({ position_delta: 5, impressions: 200 });
    const kw2 = mockKeyword({ position_delta: 3, impressions: 400 });
    // (5*0.015*200) + (3*0.015*400) = 15 + 18 = 33
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw1, kw2]), assumptions);
    assert.equal(result.estimated_traffic_gain, 33);
  });

  it('ignores keywords with zero or negative delta', () => {
    const assumptions = defaultAssumptions();
    const kw1 = mockKeyword({ position_delta: 5, impressions: 200 });
    const kw2 = mockKeyword({ position_delta: 0, impressions: 1000 });
    const kw3 = mockKeyword({ position_delta: -3, impressions: 500 });
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw1, kw2, kw3]), assumptions);
    // Only kw1: 5 * 0.015 * 200 = 15
    assert.equal(result.estimated_traffic_gain, 15);
  });

  it('computes traffic gain percentage', () => {
    const assumptions = defaultAssumptions(); // monthly_visitors_before = 1200
    const kw = mockKeyword({ position_delta: 10, impressions: 1000 });
    // gain = 150, pct = 150/1200 * 100 = 12.5
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw]), assumptions);
    assert.equal(result.estimated_traffic_gain_pct, 12.5);
  });
});

describe('calculateValue — revenue impact', () => {
  it('computes revenue from traffic gain', () => {
    const assumptions = defaultAssumptions();
    const kw = mockKeyword({ position_delta: 10, impressions: 1000 });
    // traffic = 150, revenue = 150 * 0.025 * 85 = 318.75
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw]), assumptions);
    assert.equal(result.estimated_revenue_impact, 318.75);
  });

  it('returns zero revenue when no improved keywords', () => {
    const assumptions = defaultAssumptions();
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([]), assumptions);
    assert.equal(result.estimated_revenue_impact, 0);
  });
});

describe('calculateValue — position improvement', () => {
  it('computes avg position improvement for improved only', () => {
    const kw1 = mockKeyword({ position_delta: 10 });
    const kw2 = mockKeyword({ position_delta: 6 });
    const kw3 = mockKeyword({ position_delta: -2 }); // excluded
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw1, kw2, kw3]), defaultAssumptions());
    assert.equal(result.avg_position_improvement, 8); // (10+6)/2
  });

  it('returns zero when no improved keywords', () => {
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([]), defaultAssumptions());
    assert.equal(result.avg_position_improvement, 0);
  });
});

describe('calculateValue — keywords moved to top 10', () => {
  it('counts keywords that moved from >10 to <=10', () => {
    const kw1 = mockKeyword({ position_before: 15, position_after: 7, position_delta: 8 });
    const kw2 = mockKeyword({ position_before: 25, position_after: 9, position_delta: 16 });
    const kw3 = mockKeyword({ position_before: 8, position_after: 5, position_delta: 3 }); // already in top 10
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw1, kw2, kw3]), defaultAssumptions());
    assert.equal(result.keywords_moved_to_top_10, 2);
  });

  it('does not count keywords still outside top 10', () => {
    const kw = mockKeyword({ position_before: 30, position_after: 15, position_delta: 15 });
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([kw]), defaultAssumptions());
    assert.equal(result.keywords_moved_to_top_10, 0);
  });
});

describe('calculateValue — other metrics', () => {
  it('time_saved_hours = fixes * 0.5', () => {
    const result = calculateValue('s1', 'example.com', mockStats({ fixes_applied: 20 }), mockRankings([]), defaultAssumptions());
    assert.equal(result.time_saved_hours, 10);
  });

  it('schema_coverage_gain_pct subtracts baseline 40', () => {
    const result = calculateValue('s1', 'example.com', mockStats({ schema_coverage_pct: 85 }), mockRankings([]), defaultAssumptions());
    assert.equal(result.schema_coverage_gain_pct, 45);
  });

  it('schema_coverage_gain_pct floors at 0', () => {
    const result = calculateValue('s1', 'example.com', mockStats({ schema_coverage_pct: 30 }), mockRankings([]), defaultAssumptions());
    assert.equal(result.schema_coverage_gain_pct, 0);
  });

  it('sets health_score_gain from stats', () => {
    const result = calculateValue('s1', 'example.com', mockStats({ health_score_delta: 22 }), mockRankings([]), defaultAssumptions());
    assert.equal(result.health_score_gain, 22);
  });

  it('sets site_id and domain', () => {
    const result = calculateValue('site_abc', 'test.com', mockStats(), mockRankings([]), defaultAssumptions());
    assert.equal(result.site_id, 'site_abc');
    assert.equal(result.domain, 'test.com');
  });

  it('sets computed_at to ISO string', () => {
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([]), defaultAssumptions());
    assert.ok(result.computed_at.includes('T'));
  });
});

describe('calculateValue — zero rankings', () => {
  it('handles empty keywords gracefully', () => {
    const result = calculateValue('s1', 'example.com', mockStats(), mockRankings([]), defaultAssumptions());
    assert.equal(result.estimated_traffic_gain, 0);
    assert.equal(result.avg_position_improvement, 0);
    assert.equal(result.keywords_moved_to_top_10, 0);
  });
});

// ── formatValueSummary ──────────────────────────────────────────────────────

describe('formatValueSummary', () => {
  const metrics = calculateValue(
    's1', 'example.com',
    mockStats({ fixes_applied: 12, issues_resolved: 18 }),
    mockRankings([mockKeyword({ position_delta: 10, impressions: 1000 })]),
    defaultAssumptions(),
  );

  it('contains domain', () => {
    assert.ok(formatValueSummary(metrics).includes('example.com'));
  });

  it('contains fixes count', () => {
    assert.ok(formatValueSummary(metrics).includes('12 fixes'));
  });

  it('contains issues resolved', () => {
    assert.ok(formatValueSummary(metrics).includes('18 SEO issues'));
  });

  it('contains traffic gain', () => {
    assert.ok(formatValueSummary(metrics).includes('150 monthly visitors'));
  });

  it('contains revenue impact', () => {
    assert.ok(formatValueSummary(metrics).includes('$319'));
  });

  it('contains time saved', () => {
    assert.ok(formatValueSummary(metrics).includes('6 hours'));
  });
});

// ── Never throws ────────────────────────────────────────────────────────────

describe('calculateValue — never throws', () => {
  it('handles null-ish assumptions gracefully', () => {
    const result = calculateValue('s1', 'd.com', mockStats(), mockRankings([]), { avg_order_value: 0, conversion_rate: 0, monthly_visitors_before: 0, avg_position_ctr_gain_per_rank: 0 });
    assert.equal(result.estimated_traffic_gain, 0);
  });
});
