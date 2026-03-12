/**
 * tools/value/value_report.test.ts
 *
 * Tests for value report generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateValueReport,
  exportReportAsText,
  type FixHistoryPage,
} from './value_report.js';
import type { SiteStats, RankingSnapshot, KeywordRanking } from './value_calculator.js';
import type { FixHistoryEntry } from './before_after.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockStats(overrides?: Partial<SiteStats>): SiteStats {
  return {
    fixes_applied: 15,
    issues_resolved: 22,
    schema_coverage_pct: 80,
    health_score_delta: 18,
    ...overrides,
  };
}

function mockKeyword(overrides?: Partial<KeywordRanking>): KeywordRanking {
  return {
    keyword: 'test keyword',
    position_before: 25,
    position_after: 7,
    position_delta: 18,
    impressions: 800,
    clicks_before: 5,
    clicks_after: 40,
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

function mockHistoryEntry(overrides?: Partial<FixHistoryEntry>): FixHistoryEntry {
  return {
    url: 'https://example.com/page',
    fix_type: 'title_missing',
    fix_label: 'Missing Title',
    field_name: 'title',
    before_value: '',
    after_value: 'A Perfect SEO Title That Is Exactly Right',
    applied_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockHistory(count = 3): FixHistoryPage {
  const entries: FixHistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push(mockHistoryEntry({ url: `https://example.com/page-${i}` }));
  }
  return { entries, total: count };
}

// ── generateValueReport — shape ──────────────────────────────────────────────

describe('generateValueReport — shape', () => {
  it('returns report_id', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.ok(report.report_id.length > 0);
  });

  it('sets period_days to 30', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.equal(report.period_days, 30);
  });

  it('sets period_label', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.equal(report.period_label, 'Last 30 Days');
  });

  it('sets generated_at to ISO', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.ok(report.generated_at.includes('T'));
  });

  it('sets shareable to true', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.equal(report.shareable, true);
  });

  it('sets share_token', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.ok(report.share_token && report.share_token.length > 0);
  });

  it('includes metrics', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.equal(report.metrics.fixes_applied, 15);
  });

  it('includes summary_paragraph', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
    assert.ok(report.summary_paragraph.includes('example.com'));
  });
});

// ── generateValueReport — headline logic ─────────────────────────────────────

describe('generateValueReport — headline', () => {
  it('revenue > 1000 uses revenue headline', () => {
    // High impressions → high traffic → high revenue
    const kw = mockKeyword({ position_delta: 20, impressions: 5000 });
    const report = generateValueReport('s1', 'shop.com', mockStats(), mockRankings([kw]), mockHistory());
    assert.ok(report.headline.includes('gained an estimated $'));
  });

  it('health_score_gain >= 10 uses health headline when revenue <= 1000', () => {
    const report = generateValueReport('s1', 'shop.com', mockStats({ health_score_delta: 15 }), mockRankings([]), mockHistory());
    assert.ok(report.headline.includes('health score up'));
    assert.ok(report.headline.includes('15 points'));
  });

  it('fallback uses fixes count headline', () => {
    const report = generateValueReport('s1', 'shop.com', mockStats({ fixes_applied: 5, health_score_delta: 3 }), mockRankings([]), mockHistory());
    assert.ok(report.headline.includes('5 SEO fixes'));
  });
});

// ── generateValueReport — top_comparisons ────────────────────────────────────

describe('generateValueReport — top_comparisons', () => {
  it('caps at 5 comparisons', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory(10));
    assert.ok(report.top_comparisons.length <= 5);
  });

  it('returns all when fewer than 5', () => {
    const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory(2));
    assert.equal(report.top_comparisons.length, 2);
  });
});

// ── exportReportAsText ───────────────────────────────────────────────────────

describe('exportReportAsText', () => {
  const report = generateValueReport('s1', 'example.com', mockStats(), mockRankings(), mockHistory());
  const text = exportReportAsText(report);

  it('contains headline', () => {
    assert.ok(text.includes(report.headline));
  });

  it('contains domain name', () => {
    assert.ok(text.includes('EXAMPLE.COM'));
  });

  it('contains fixes count', () => {
    assert.ok(text.includes('15'));
  });

  it('contains Velocity AEO credit', () => {
    assert.ok(text.includes('Velocity AEO'));
  });

  it('contains KEY METRICS section', () => {
    assert.ok(text.includes('KEY METRICS'));
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('generateValueReport — never throws', () => {
  it('handles empty history', () => {
    const report = generateValueReport('s1', 'd.com', mockStats(), mockRankings(), { entries: [], total: 0 });
    assert.ok(report.report_id);
  });

  it('handles empty rankings', () => {
    const report = generateValueReport('s1', 'd.com', mockStats(), mockRankings([]), mockHistory());
    assert.ok(report.report_id);
  });
});
