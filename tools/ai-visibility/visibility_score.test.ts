/**
 * tools/ai-visibility/visibility_score.test.ts
 *
 * Tests for AI visibility score engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAIVisibilityScore,
  computeScoreHistory,
  type AICitationSummary,
} from './visibility_score.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockSummary(overrides?: Partial<AICitationSummary>): AICitationSummary {
  return {
    site_id: 'site_1',
    domain: 'example.com',
    total_queries: 100,
    total_citations: 60,
    citation_rate: 0.6,
    ...overrides,
  };
}

// ── computeAIVisibilityScore — formula ───────────────────────────────────────

describe('computeAIVisibilityScore — formula', () => {
  it('computes weighted score from breakdown', () => {
    const result = computeAIVisibilityScore(mockSummary(), {
      branded_rate: 0.8,
      product_rate: 0.6,
      informational_rate: 0.4,
    });
    // 0.8*0.5 + 0.6*0.3 + 0.4*0.2 = 0.40 + 0.18 + 0.08 = 0.66 → 66
    assert.equal(result.score, 66);
  });

  it('uses citation_rate fallback when no breakdown', () => {
    const result = computeAIVisibilityScore(mockSummary({ citation_rate: 0.5 }));
    assert.ok(result.score > 0);
  });

  it('clamps score to 0-100 range', () => {
    const high = computeAIVisibilityScore(mockSummary(), {
      branded_rate: 1.5,
      product_rate: 1.5,
      informational_rate: 1.5,
    });
    assert.ok(high.score <= 100);

    const low = computeAIVisibilityScore(mockSummary(), {
      branded_rate: 0,
      product_rate: 0,
      informational_rate: 0,
    });
    assert.ok(low.score >= 0);
  });

  it('sets citation_rate from summary', () => {
    const result = computeAIVisibilityScore(mockSummary({ citation_rate: 0.42 }));
    assert.equal(result.citation_rate, 0.42);
  });
});

// ── computeAIVisibilityScore — score_label ───────────────────────────────────

describe('computeAIVisibilityScore — score_label', () => {
  it('Excellent when score >= 80', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 1, product_rate: 1, informational_rate: 1 });
    assert.equal(r.score_label, 'Excellent');
  });

  it('Good when score 60-79', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.8, product_rate: 0.6, informational_rate: 0.4 });
    assert.equal(r.score_label, 'Good');
  });

  it('Fair when score 40-59', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.5, product_rate: 0.4, informational_rate: 0.3 });
    assert.equal(r.score_label, 'Fair');
  });

  it('Poor when score 20-39', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.3, product_rate: 0.2, informational_rate: 0.1 });
    assert.equal(r.score_label, 'Poor');
  });

  it('Not Visible when score < 20', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.1, product_rate: 0.05, informational_rate: 0.02 });
    assert.equal(r.score_label, 'Not Visible');
  });
});

// ── computeAIVisibilityScore — score_color ───────────────────────────────────

describe('computeAIVisibilityScore — score_color', () => {
  it('green for Excellent', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 1, product_rate: 1, informational_rate: 1 });
    assert.equal(r.score_color, 'green');
  });

  it('blue for Good', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.8, product_rate: 0.6, informational_rate: 0.4 });
    assert.equal(r.score_color, 'blue');
  });

  it('amber for Fair', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.5, product_rate: 0.4, informational_rate: 0.3 });
    assert.equal(r.score_color, 'amber');
  });

  it('red for Poor', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.3, product_rate: 0.2, informational_rate: 0.1 });
    assert.equal(r.score_color, 'red');
  });

  it('gray for Not Visible', () => {
    const r = computeAIVisibilityScore(mockSummary(), { branded_rate: 0.1, product_rate: 0.05, informational_rate: 0.02 });
    assert.equal(r.score_color, 'gray');
  });
});

// ── computeScoreHistory ──────────────────────────────────────────────────────

describe('computeScoreHistory', () => {
  it('returns correct number of days', () => {
    const history = computeScoreHistory('s1', 'example.com', 30);
    assert.equal(history.length, 30);
  });

  it('scores improve over time', () => {
    const history = computeScoreHistory('s1', 'example.com', 30);
    const first5Avg = history.slice(0, 5).reduce((s, h) => s + h.score, 0) / 5;
    const last5Avg = history.slice(-5).reduce((s, h) => s + h.score, 0) / 5;
    assert.ok(last5Avg > first5Avg);
  });

  it('deterministic from domain', () => {
    const a = computeScoreHistory('s1', 'test.com', 10);
    const b = computeScoreHistory('s1', 'test.com', 10);
    assert.deepEqual(a.map((s) => s.score), b.map((s) => s.score));
  });

  it('never throws on zero days', () => {
    const history = computeScoreHistory('s1', 'example.com', 0);
    assert.equal(history.length, 0);
  });
});
