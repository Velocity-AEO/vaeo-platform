/**
 * tools/tracer/priority_scorer.test.ts
 *
 * Tests for priority scoring — base severity, traffic, recency multipliers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreIssuePriority, rankIssues, type PriorityFactors } from './priority_scorer.js';

// ── scoreIssuePriority — base severity ───────────────────────────────────────

describe('scoreIssuePriority — base severity', () => {
  it('SCHEMA_MISSING has base severity 10', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'SCHEMA_MISSING' });
    assert.equal(result.base_severity, 10);
  });

  it('META_TITLE_MISSING has base severity 9', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'META_TITLE_MISSING' });
    assert.equal(result.base_severity, 9);
  });

  it('META_DESC_MISSING has base severity 8', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'META_DESC_MISSING' });
    assert.equal(result.base_severity, 8);
  });

  it('DEFER_SCRIPT has base severity 7', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'DEFER_SCRIPT' });
    assert.equal(result.base_severity, 7);
  });

  it('FONT_DISPLAY has base severity 4', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'FONT_DISPLAY' });
    assert.equal(result.base_severity, 4);
  });

  it('unknown issue defaults to severity 5', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'UNKNOWN_ISSUE' });
    assert.equal(result.base_severity, 5);
  });

  it('explicit severity overrides default', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'SCHEMA_MISSING', severity: 15 });
    assert.equal(result.base_severity, 15);
  });
});

// ── scoreIssuePriority — traffic multiplier ──────────────────────────────────

describe('scoreIssuePriority — traffic multiplier', () => {
  it('clicks > 1000 → 2.0x', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { gsc_clicks: 1500 },
    );
    assert.equal(result.traffic_multiplier, 2.0);
    assert.equal(result.final_score, 20); // 10 * 2.0
  });

  it('clicks > 100 → 1.5x', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { gsc_clicks: 200 },
    );
    assert.equal(result.traffic_multiplier, 1.5);
  });

  it('clicks > 10 → 1.2x', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { gsc_clicks: 50 },
    );
    assert.equal(result.traffic_multiplier, 1.2);
  });

  it('clicks <= 10 → 1.0x', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { gsc_clicks: 5 },
    );
    assert.equal(result.traffic_multiplier, 1.0);
  });

  it('no clicks → 1.0x', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'SCHEMA_MISSING' });
    assert.equal(result.traffic_multiplier, 1.0);
  });
});

// ── scoreIssuePriority — recency multiplier ──────────────────────────────────

describe('scoreIssuePriority — recency multiplier', () => {
  it('new issue → 1.3x', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { is_new_issue: true },
    );
    assert.equal(result.recency_multiplier, 1.3);
    assert.equal(result.final_score, 13); // 10 * 1.3
  });

  it('worsened → 1.2x', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { is_worsened: true },
    );
    assert.equal(result.recency_multiplier, 1.2);
  });

  it('neither → 1.0x', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'SCHEMA_MISSING' });
    assert.equal(result.recency_multiplier, 1.0);
  });
});

// ── scoreIssuePriority — priority tiers ──────────────────────────────────────

describe('scoreIssuePriority — priority tiers', () => {
  it('score > 15 → critical', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { gsc_clicks: 1500 }, // 10 * 2.0 = 20
    );
    assert.equal(result.priority_tier, 'critical');
  });

  it('score > 10 → high', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { is_new_issue: true }, // 10 * 1.3 = 13
    );
    assert.equal(result.priority_tier, 'high');
  });

  it('score > 6 → medium', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'SCHEMA_MISSING' });
    // 10 * 1.0 = 10
    assert.equal(result.priority_tier, 'medium');
  });

  it('score <= 6 → low', () => {
    const result = scoreIssuePriority({ url: '/p', issue_type: 'FONT_DISPLAY' });
    // 4 * 1.0 = 4
    assert.equal(result.priority_tier, 'low');
  });
});

// ── scoreIssuePriority — combined multipliers ────────────────────────────────

describe('scoreIssuePriority — combined multipliers', () => {
  it('traffic + recency multiply together', () => {
    const result = scoreIssuePriority(
      { url: '/p', issue_type: 'SCHEMA_MISSING' },
      { gsc_clicks: 1500, is_new_issue: true },
    );
    // 10 * 2.0 * 1.3 = 26
    assert.equal(result.final_score, 26);
    assert.equal(result.priority_tier, 'critical');
  });
});

// ── rankIssues ───────────────────────────────────────────────────────────────

describe('rankIssues', () => {
  it('returns issues sorted by final_score descending', () => {
    const issues = [
      { url: '/a', issue_type: 'FONT_DISPLAY' },      // base 4
      { url: '/b', issue_type: 'SCHEMA_MISSING' },     // base 10
      { url: '/c', issue_type: 'META_DESC_MISSING' },  // base 8
    ];
    const result = rankIssues(issues, new Map());
    assert.equal(result[0]!.issue_type, 'SCHEMA_MISSING');
    assert.equal(result[1]!.issue_type, 'META_DESC_MISSING');
    assert.equal(result[2]!.issue_type, 'FONT_DISPLAY');
  });

  it('uses factors from factorsMap keyed by url::issue_type', () => {
    const issues = [{ url: '/a', issue_type: 'FONT_DISPLAY' }];
    const factors = new Map([
      ['/a::FONT_DISPLAY', { gsc_clicks: 2000 }],
    ]);
    const result = rankIssues(issues, factors);
    assert.equal(result[0]!.traffic_multiplier, 2.0);
    assert.equal(result[0]!.final_score, 8); // 4 * 2.0
  });

  it('falls back to url-only key in factorsMap', () => {
    const issues = [{ url: '/a', issue_type: 'FONT_DISPLAY' }];
    const factors = new Map([
      ['/a', { gsc_clicks: 500 }],
    ]);
    const result = rankIssues(issues, factors);
    assert.equal(result[0]!.traffic_multiplier, 1.5);
  });

  it('handles empty issues list', () => {
    const result = rankIssues([], new Map());
    assert.deepEqual(result, []);
  });
});
