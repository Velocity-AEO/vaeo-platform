/**
 * tools/rankings/ranking_entry.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRankingTrend,
  buildRankingEntry,
  buildRankingSnapshot,
} from './ranking_entry.ts';

// ── deriveRankingTrend ────────────────────────────────────────────────────────

describe('deriveRankingTrend', () => {
  it('returns new when no previous', () => {
    assert.equal(deriveRankingTrend(5), 'new');
  });

  it('returns new when previous is undefined', () => {
    assert.equal(deriveRankingTrend(5, undefined), 'new');
  });

  it('returns up when position improved (lower number)', () => {
    assert.equal(deriveRankingTrend(3, 7), 'up'); // was 7, now 3 → improved
  });

  it('returns down when position dropped (higher number)', () => {
    assert.equal(deriveRankingTrend(10, 4), 'down'); // was 4, now 10 → dropped
  });

  it('returns flat when delta < 1', () => {
    assert.equal(deriveRankingTrend(5, 5), 'flat');
  });

  it('returns flat when delta is 0.5', () => {
    assert.equal(deriveRankingTrend(5.3, 5.7), 'flat');
  });

  it('returns up for large improvement', () => {
    assert.equal(deriveRankingTrend(1, 20), 'up');
  });

  it('returns down for large drop', () => {
    assert.equal(deriveRankingTrend(50, 5), 'down');
  });
});

// ── buildRankingEntry ─────────────────────────────────────────────────────────

describe('buildRankingEntry', () => {
  it('returns RankingEntry with correct fields', () => {
    const e = buildRankingEntry('site-1', 'test keyword', 'https://example.com', 5, 1000, 50);
    assert.equal(e.site_id, 'site-1');
    assert.equal(e.keyword, 'test keyword');
    assert.equal(e.url, 'https://example.com');
    assert.equal(e.position, 5);
    assert.equal(e.impressions, 1000);
    assert.equal(e.clicks, 50);
  });

  it('computes CTR correctly', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 1, 1000, 280);
    assert.ok(Math.abs(e.ctr - 0.28) < 0.001);
  });

  it('CTR is 0 when impressions is 0', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 1, 0, 0);
    assert.equal(e.ctr, 0);
  });

  it('computes positive delta when position improved', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 3, 100, 10, 8);
    assert.equal(e.position_delta, 5); // 8 - 3
    assert.equal(e.trend, 'up');
  });

  it('computes negative delta when position dropped', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 12, 100, 5, 6);
    assert.equal(e.position_delta, -6); // 6 - 12
    assert.equal(e.trend, 'down');
  });

  it('trend is new when no previous_position', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 5, 100, 10);
    assert.equal(e.trend, 'new');
    assert.equal(e.position_delta, undefined);
  });

  it('source is simulated', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 5, 100, 10);
    assert.equal(e.source, 'simulated');
  });

  it('entry_id is a string (UUID)', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 5, 100, 10);
    assert.ok(typeof e.entry_id === 'string' && e.entry_id.length > 0);
  });

  it('recorded_at is ISO string', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 5, 100, 10);
    assert.ok(!isNaN(Date.parse(e.recorded_at)));
  });

  it('position_previous set correctly', () => {
    const e = buildRankingEntry('s', 'kw', 'url', 5, 100, 10, 9);
    assert.equal(e.position_previous, 9);
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildRankingEntry(null as never, null as never, null as never, null as never, null as never, null as never));
  });
});

// ── buildRankingSnapshot ──────────────────────────────────────────────────────

describe('buildRankingSnapshot', () => {
  const entries = [
    buildRankingEntry('s', 'kw1', 'url1', 1, 1000, 280, 3),   // up, top-3, top-10
    buildRankingEntry('s', 'kw2', 'url2', 2, 800, 200, 1),    // down, top-3, top-10
    buildRankingEntry('s', 'kw3', 'url3', 5, 500, 50, 5),     // flat, top-10
    buildRankingEntry('s', 'kw4', 'url4', 10, 200, 4),        // new, top-10
    buildRankingEntry('s', 'kw5', 'url5', 25, 80, 2, 30),     // up, not top-10
    buildRankingEntry('s', 'kw6', 'url6', 40, 50, 1, 15),     // down, not top-10
  ];

  it('sets total_keywords correctly', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.equal(snap.total_keywords, 6);
  });

  it('computes avg_position', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    const expected = (1 + 2 + 5 + 10 + 25 + 40) / 6;
    assert.ok(Math.abs(snap.avg_position - expected) < 0.1);
  });

  it('counts keywords_in_top_3', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.equal(snap.keywords_in_top_3, 2); // positions 1, 2
  });

  it('counts keywords_in_top_10', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.equal(snap.keywords_in_top_10, 4); // positions 1, 2, 5, 10
  });

  it('counts keywords_improved', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.equal(snap.keywords_improved, 2); // kw1, kw5
  });

  it('counts keywords_dropped', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.equal(snap.keywords_dropped, 2); // kw2, kw6
  });

  it('counts keywords_new', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.equal(snap.keywords_new, 1); // kw4
  });

  it('snapshot_id is a string', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.ok(typeof snap.snapshot_id === 'string' && snap.snapshot_id.length > 0);
  });

  it('snapshot_date is ISO string', () => {
    const snap = buildRankingSnapshot('site-1', entries);
    assert.ok(!isNaN(Date.parse(snap.snapshot_date)));
  });

  it('handles empty entries array', () => {
    const snap = buildRankingSnapshot('site-1', []);
    assert.equal(snap.total_keywords, 0);
    assert.equal(snap.avg_position, 0);
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildRankingSnapshot(null as never, null as never));
  });
});
