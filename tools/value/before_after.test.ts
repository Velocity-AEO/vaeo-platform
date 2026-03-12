/**
 * tools/value/before_after.test.ts
 *
 * Tests for before/after comparator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreFieldQuality,
  buildComparison,
  buildComparisonReport,
  type FixHistoryEntry,
} from './before_after.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockEntry(overrides?: Partial<FixHistoryEntry>): FixHistoryEntry {
  return {
    url: 'https://example.com/page',
    fix_type: 'title_missing',
    fix_label: 'Missing Title',
    field_name: 'title',
    before_value: '',
    after_value: 'Great Product — Example Store',
    applied_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── scoreFieldQuality — title ────────────────────────────────────────────────

describe('scoreFieldQuality — title', () => {
  it('empty returns 0', () => {
    assert.equal(scoreFieldQuality('', 'title_missing'), 0);
  });

  it('short title < 30 chars returns 40', () => {
    assert.equal(scoreFieldQuality('Short Title', 'title_missing'), 40);
  });

  it('optimal title 30-60 chars returns 100', () => {
    assert.equal(scoreFieldQuality('A Perfect SEO Title That Is Exactly Right', 'title'), 100);
  });

  it('long title > 70 chars returns 70', () => {
    const long = 'A'.repeat(75);
    assert.equal(scoreFieldQuality(long, 'title_missing'), 70);
  });
});

// ── scoreFieldQuality — meta description ─────────────────────────────────────

describe('scoreFieldQuality — meta_description', () => {
  it('empty returns 0', () => {
    assert.equal(scoreFieldQuality('', 'meta_description_missing'), 0);
  });

  it('short < 70 chars returns 50', () => {
    assert.equal(scoreFieldQuality('A short meta description.', 'meta_description'), 50);
  });

  it('optimal 70-160 chars returns 100', () => {
    const optimal = 'A'.repeat(120);
    assert.equal(scoreFieldQuality(optimal, 'meta_description_missing'), 100);
  });

  it('long > 160 chars returns 60', () => {
    const long = 'A'.repeat(200);
    assert.equal(scoreFieldQuality(long, 'meta_description'), 60);
  });
});

// ── scoreFieldQuality — image alt ────────────────────────────────────────────

describe('scoreFieldQuality — image_alt_missing', () => {
  it('empty returns 0', () => {
    assert.equal(scoreFieldQuality('', 'image_alt_missing'), 0);
  });

  it('very short 1-5 chars returns 30', () => {
    assert.equal(scoreFieldQuality('cat', 'image_alt_missing'), 30);
  });

  it('good length 6-125 chars returns 100', () => {
    assert.equal(scoreFieldQuality('A product photo showing details', 'image_alt_missing'), 100);
  });

  it('too long > 125 chars returns 60', () => {
    const long = 'A'.repeat(130);
    assert.equal(scoreFieldQuality(long, 'image_alt_missing'), 60);
  });
});

// ── scoreFieldQuality — schema ───────────────────────────────────────────────

describe('scoreFieldQuality — schema_missing', () => {
  it('empty returns 0', () => {
    assert.equal(scoreFieldQuality('', 'schema_missing'), 0);
  });

  it('valid JSON returns 100', () => {
    assert.equal(scoreFieldQuality('{"@type":"Product","name":"Test"}', 'schema_missing'), 100);
  });

  it('invalid JSON returns 50', () => {
    assert.equal(scoreFieldQuality('not json', 'schema_missing'), 50);
  });
});

// ── scoreFieldQuality — default ──────────────────────────────────────────────

describe('scoreFieldQuality — default', () => {
  it('unknown fix_type with value returns 80', () => {
    assert.equal(scoreFieldQuality('some value', 'unknown_fix'), 80);
  });

  it('unknown fix_type empty returns 0', () => {
    assert.equal(scoreFieldQuality('', 'unknown_fix'), 0);
  });
});

// ── buildComparison ──────────────────────────────────────────────────────────

describe('buildComparison', () => {
  it('sets quality_delta correctly', () => {
    const entry = mockEntry({ before_value: '', after_value: 'A Perfect SEO Title That Is Exactly Right', fix_type: 'title_missing' });
    const result = buildComparison('site_1', entry);
    assert.equal(result.quality_score_before, 0);
    assert.equal(result.quality_score_after, 100);
    assert.equal(result.quality_delta, 100);
  });

  it('generates comparison_id', () => {
    const result = buildComparison('site_1', mockEntry());
    assert.ok(result.comparison_id.length > 0);
  });

  it('sets character_delta', () => {
    const result = buildComparison('site_1', mockEntry({ before_value: 'ab', after_value: 'abcdef' }));
    assert.equal(result.character_delta, 4);
  });

  it('sets ranking_delta when positions provided', () => {
    const result = buildComparison('site_1', mockEntry({ ranking_position_before: 20, ranking_position_after: 8 }));
    assert.equal(result.ranking_delta, 12);
  });

  it('ranking_delta undefined when positions not provided', () => {
    const result = buildComparison('site_1', mockEntry());
    assert.equal(result.ranking_delta, undefined);
  });

  it('never throws on empty entry', () => {
    const result = buildComparison('site_1', mockEntry({ before_value: '', after_value: '' }));
    assert.equal(result.quality_delta, 0);
  });
});

// ── buildComparisonReport ────────────────────────────────────────────────────

describe('buildComparisonReport', () => {
  it('sorts by quality_delta descending', () => {
    const entries: FixHistoryEntry[] = [
      mockEntry({ before_value: 'Short', after_value: 'A Perfect SEO Title That Is Exactly Right', fix_type: 'title_missing' }), // 40 → 100 = +60
      mockEntry({ before_value: '', after_value: 'A Perfect SEO Title That Is Exactly Right', fix_type: 'title_missing' }),    // 0 → 100 = +100
      mockEntry({ before_value: 'A'.repeat(50), after_value: 'A'.repeat(55), fix_type: 'title_missing' }),                     // 100 → 100 = 0
    ];
    const report = buildComparisonReport('site_1', entries);
    assert.equal(report[0].quality_delta, 100);
    assert.equal(report[1].quality_delta, 60);
    assert.equal(report[2].quality_delta, 0);
  });

  it('returns empty array for empty entries', () => {
    const report = buildComparisonReport('site_1', []);
    assert.equal(report.length, 0);
  });

  it('never throws on any input', () => {
    const report = buildComparisonReport('site_1', [mockEntry()]);
    assert.ok(Array.isArray(report));
  });
});
