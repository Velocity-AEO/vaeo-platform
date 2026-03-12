/**
 * tools/stats/site_stats.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteStats, computeStatsDelta, simulateStatsHistory } from './site_stats.ts';

// ── buildSiteStats ────────────────────────────────────────────────────────────

describe('buildSiteStats', () => {
  it('returns correct site_id and domain', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.site_id, 'site-1');
    assert.equal(s.domain, 'example.com');
  });

  it('returns default health_score of 72', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.health_score, 72);
  });

  it('returns default health_score_delta of 8', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.health_score_delta, 8);
  });

  it('returns default health_score_trend of improving', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.health_score_trend, 'improving');
  });

  it('returns default total_fixes_applied of 47', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.total_fixes_applied, 47);
  });

  it('returns default fixes_this_month of 12', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.fixes_this_month, 12);
  });

  it('returns default issues_pending of 14', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.equal(s.issues_pending, 14);
  });

  it('applies overrides on top of defaults', () => {
    const s = buildSiteStats('site-1', 'example.com', { health_score: 90 });
    assert.equal(s.health_score, 90);
    assert.equal(s.total_fixes_applied, 47); // default unchanged
  });

  it('overrides multiple fields', () => {
    const s = buildSiteStats('s', 'd', { health_score: 55, fixes_this_week: 10 });
    assert.equal(s.health_score, 55);
    assert.equal(s.fixes_this_week, 10);
  });

  it('computed_at is ISO string', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.ok(!isNaN(Date.parse(s.computed_at)));
  });

  it('last_run_at is ISO string', () => {
    const s = buildSiteStats('site-1', 'example.com');
    assert.ok(!isNaN(Date.parse(s.last_run_at)));
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildSiteStats(null as never, null as never));
  });
});

// ── computeStatsDelta ─────────────────────────────────────────────────────────

describe('computeStatsDelta', () => {
  it('computes positive health_score delta', () => {
    const cur  = buildSiteStats('s', 'd', { health_score: 80 });
    const prev = buildSiteStats('s', 'd', { health_score: 70 });
    const d = computeStatsDelta(cur, prev);
    assert.equal(d.health_score, 10);
  });

  it('computes negative delta when score dropped', () => {
    const cur  = buildSiteStats('s', 'd', { health_score: 60 });
    const prev = buildSiteStats('s', 'd', { health_score: 75 });
    const d = computeStatsDelta(cur, prev);
    assert.equal(d.health_score, -15);
  });

  it('computes total_fixes_applied delta', () => {
    const cur  = buildSiteStats('s', 'd', { total_fixes_applied: 50 });
    const prev = buildSiteStats('s', 'd', { total_fixes_applied: 40 });
    const d = computeStatsDelta(cur, prev);
    assert.equal(d.total_fixes_applied, 10);
  });

  it('returns zero for unchanged fields', () => {
    const s1 = buildSiteStats('s', 'd');
    const s2 = buildSiteStats('s', 'd');
    const d = computeStatsDelta(s1, s2);
    assert.equal(d.health_score, 0);
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => computeStatsDelta(null as never, null as never));
  });
});

// ── simulateStatsHistory ──────────────────────────────────────────────────────

describe('simulateStatsHistory', () => {
  it('returns correct length', () => {
    const h = simulateStatsHistory('site-1', 'example.com', 30);
    assert.equal(h.length, 30);
  });

  it('respects custom days', () => {
    const h = simulateStatsHistory('site-1', 'example.com', 7);
    assert.equal(h.length, 7);
  });

  it('health_score increases over time (last > first)', () => {
    const h = simulateStatsHistory('site-1', 'example.com', 30);
    assert.ok(h[h.length - 1].health_score >= h[0].health_score);
  });

  it('total_fixes_applied accumulates (last >= first)', () => {
    const h = simulateStatsHistory('site-1', 'example.com', 30);
    assert.ok(h[h.length - 1].total_fixes_applied >= h[0].total_fixes_applied);
  });

  it('all entries have valid computed_at', () => {
    const h = simulateStatsHistory('site-1', 'example.com', 5);
    for (const s of h) {
      assert.ok(!isNaN(Date.parse(s.computed_at)));
    }
  });

  it('health_score trend is improving', () => {
    const h = simulateStatsHistory('site-1', 'example.com', 5);
    for (const s of h) {
      assert.equal(s.health_score_trend, 'improving');
    }
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => simulateStatsHistory(null as never, null as never));
  });
});
