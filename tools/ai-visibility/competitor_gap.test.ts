/**
 * tools/ai-visibility/competitor_gap.test.ts
 *
 * Tests for competitor gap analyzer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCompetitorGap,
  getTopOpportunities,
  type CompetitorGap,
} from './competitor_gap.js';

// ── analyzeCompetitorGap — structure ─────────────────────────────────────────

describe('analyzeCompetitorGap — structure', () => {
  it('returns one gap per query per competitor', () => {
    const gaps = analyzeCompetitorGap('s1', 'my.com', ['comp1.com', 'comp2.com'], ['q1', 'q2']);
    assert.equal(gaps.length, 4); // 2 queries × 2 competitors
  });

  it('sets gap_id on each', () => {
    const gaps = analyzeCompetitorGap('s1', 'my.com', ['comp.com'], ['q1']);
    assert.ok(gaps[0].gap_id.length > 0);
  });

  it('sets site_id', () => {
    const gaps = analyzeCompetitorGap('s1', 'my.com', ['comp.com'], ['q1']);
    assert.equal(gaps[0].site_id, 's1');
  });

  it('sets your_domain', () => {
    const gaps = analyzeCompetitorGap('s1', 'my.com', ['comp.com'], ['q1']);
    assert.equal(gaps[0].your_domain, 'my.com');
  });

  it('sets competitor_domain', () => {
    const gaps = analyzeCompetitorGap('s1', 'my.com', ['comp.com'], ['q1']);
    assert.equal(gaps[0].competitor_domain, 'comp.com');
  });

  it('sets query', () => {
    const gaps = analyzeCompetitorGap('s1', 'my.com', ['comp.com'], ['best shoes']);
    assert.equal(gaps[0].query, 'best shoes');
  });
});

// ── analyzeCompetitorGap — gap_type coverage ─────────────────────────────────

describe('analyzeCompetitorGap — gap_type coverage', () => {
  // Use enough queries to get all gap types
  const queries = Array.from({ length: 30 }, (_, i) => `query_${i}`);
  const gaps = analyzeCompetitorGap('s1', 'test-store.com', ['rival.com'], queries);
  const types = new Set(gaps.map((g) => g.gap_type));

  it('produces you_win gap type', () => {
    assert.ok(types.has('you_win'));
  });

  it('produces competitor_wins gap type', () => {
    assert.ok(types.has('competitor_wins'));
  });

  it('produces both_cited gap type', () => {
    assert.ok(types.has('both_cited'));
  });

  it('produces neither_cited gap type', () => {
    assert.ok(types.has('neither_cited'));
  });
});

// ── analyzeCompetitorGap — opportunity_score ─────────────────────────────────

describe('analyzeCompetitorGap — opportunity_score', () => {
  const queries = Array.from({ length: 30 }, (_, i) => `query_${i}`);
  const gaps = analyzeCompetitorGap('s1', 'test-store.com', ['rival.com'], queries);

  it('competitor_wins scores 90', () => {
    const g = gaps.find((g) => g.gap_type === 'competitor_wins');
    assert.ok(g);
    assert.equal(g!.opportunity_score, 90);
  });

  it('neither_cited scores 60', () => {
    const g = gaps.find((g) => g.gap_type === 'neither_cited');
    assert.ok(g);
    assert.equal(g!.opportunity_score, 60);
  });

  it('both_cited scores 30', () => {
    const g = gaps.find((g) => g.gap_type === 'both_cited');
    assert.ok(g);
    assert.equal(g!.opportunity_score, 30);
  });

  it('you_win scores 10', () => {
    const g = gaps.find((g) => g.gap_type === 'you_win');
    assert.ok(g);
    assert.equal(g!.opportunity_score, 10);
  });
});

// ── analyzeCompetitorGap — recommendation ────────────────────────────────────

describe('analyzeCompetitorGap — recommendation', () => {
  const queries = Array.from({ length: 30 }, (_, i) => `query_${i}`);
  const gaps = analyzeCompetitorGap('s1', 'test-store.com', ['rival.com'], queries);

  it('competitor_wins gets FAQ recommendation', () => {
    const g = gaps.find((g) => g.gap_type === 'competitor_wins');
    assert.ok(g!.recommendation.includes('FAQ'));
  });

  it('neither_cited gets content creation recommendation', () => {
    const g = gaps.find((g) => g.gap_type === 'neither_cited');
    assert.ok(g!.recommendation.includes('create content'));
  });
});

// ── getTopOpportunities ──────────────────────────────────────────────────────

describe('getTopOpportunities', () => {
  it('returns top N by opportunity_score descending', () => {
    const gaps: CompetitorGap[] = [
      { gap_id: '1', site_id: 's1', query: 'q1', your_domain: 'd', your_cited: false, competitor_domain: 'c', competitor_cited: true, gap_type: 'competitor_wins', opportunity_score: 90, recommendation: '' },
      { gap_id: '2', site_id: 's1', query: 'q2', your_domain: 'd', your_cited: true, competitor_domain: 'c', competitor_cited: false, gap_type: 'you_win', opportunity_score: 10, recommendation: '' },
      { gap_id: '3', site_id: 's1', query: 'q3', your_domain: 'd', your_cited: false, competitor_domain: 'c', competitor_cited: false, gap_type: 'neither_cited', opportunity_score: 60, recommendation: '' },
    ];
    const top = getTopOpportunities(gaps, 2);
    assert.equal(top.length, 2);
    assert.equal(top[0].opportunity_score, 90);
    assert.equal(top[1].opportunity_score, 60);
  });

  it('defaults limit to 5', () => {
    const gaps = Array.from({ length: 10 }, (_, i) => ({
      gap_id: `${i}`, site_id: 's1', query: `q${i}`, your_domain: 'd', your_cited: false, competitor_domain: 'c', competitor_cited: true, gap_type: 'competitor_wins' as const, opportunity_score: 90 - i, recommendation: '',
    }));
    const top = getTopOpportunities(gaps);
    assert.equal(top.length, 5);
  });

  it('never throws on empty array', () => {
    const top = getTopOpportunities([]);
    assert.equal(top.length, 0);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('analyzeCompetitorGap — never throws', () => {
  it('handles empty queries', () => {
    const gaps = analyzeCompetitorGap('s1', 'd.com', ['c.com'], []);
    assert.equal(gaps.length, 0);
  });

  it('handles empty competitors', () => {
    const gaps = analyzeCompetitorGap('s1', 'd.com', [], ['q1']);
    assert.equal(gaps.length, 0);
  });
});
