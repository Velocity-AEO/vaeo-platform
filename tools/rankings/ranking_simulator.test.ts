/**
 * tools/rankings/ranking_simulator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateRankings, simulateRankingHistory } from './ranking_simulator.ts';

// ── simulateRankings ──────────────────────────────────────────────────────────

describe('simulateRankings', () => {
  it('returns correct keyword count (default 20)', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    assert.equal(snap.total_keywords, 20);
  });

  it('respects custom keyword_count', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com', 10);
    assert.equal(snap.total_keywords, 10);
  });

  it('is deterministic — same domain produces same keywords', () => {
    const a = simulateRankings('site-1', 'cococabanalife.com');
    const b = simulateRankings('site-1', 'cococabanalife.com');
    const kwA = a.entries.map(e => e.keyword).sort().join(',');
    const kwB = b.entries.map(e => e.keyword).sort().join(',');
    assert.equal(kwA, kwB);
  });

  it('different domains produce different results', () => {
    const a = simulateRankings('site-1', 'cococabanalife.com');
    const b = simulateRankings('site-2', 'fashionstore.com');
    const kwA = a.entries.map(e => e.keyword).sort().join(',');
    const kwB = b.entries.map(e => e.keyword).sort().join(',');
    assert.notEqual(kwA, kwB);
  });

  it('keywords_in_top_10 > 0', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    assert.ok(snap.keywords_in_top_10 > 0);
  });

  it('has at least 2 keywords in top-3', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    assert.ok(snap.keywords_in_top_3 >= 2);
  });

  it('avg_position is between 1 and 50', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    assert.ok(snap.avg_position >= 1 && snap.avg_position <= 50);
  });

  it('all entries have position between 1 and 50', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    for (const e of snap.entries) {
      assert.ok(e.position >= 1 && e.position <= 50, `position ${e.position} out of range`);
    }
  });

  it('all entries have non-empty keyword', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    for (const e of snap.entries) {
      assert.ok(e.keyword.length > 0);
    }
  });

  it('all entries have impressions > 0', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    for (const e of snap.entries) {
      assert.ok(e.impressions > 0);
    }
  });

  it('beach domain uses beach keywords', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    const hasBeach = snap.entries.some(e =>
      e.keyword.includes('beach') || e.keyword.includes('coastal') ||
      e.keyword.includes('rattan') || e.keyword.includes('boho')
    );
    assert.ok(hasBeach);
  });

  it('snapshot_id is a string', () => {
    const snap = simulateRankings('site-1', 'cococabanalife.com');
    assert.ok(typeof snap.snapshot_id === 'string' && snap.snapshot_id.length > 0);
  });

  it('never throws on empty domain', () => {
    assert.doesNotThrow(() => simulateRankings('site-1', ''));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => simulateRankings(null as never, null as never));
  });
});

// ── simulateRankingHistory ────────────────────────────────────────────────────

describe('simulateRankingHistory', () => {
  it('returns correct number of snapshots (default 30)', () => {
    const history = simulateRankingHistory('site-1', 'cococabanalife.com');
    assert.equal(history.length, 30);
  });

  it('respects custom days parameter', () => {
    const history = simulateRankingHistory('site-1', 'cococabanalife.com', 7);
    assert.equal(history.length, 7);
  });

  it('positions are generally higher (worse) in older snapshots', () => {
    const history = simulateRankingHistory('site-1', 'cococabanalife.com', 10);
    const first = history[0].avg_position;  // oldest
    const last  = history[history.length - 1].avg_position; // most recent
    // Older entries should have worse (higher) avg position on average
    assert.ok(first >= last - 5, `oldest avg ${first} should be >= most recent avg ${last} - 5`);
  });

  it('each snapshot has correct keyword count', () => {
    const history = simulateRankingHistory('site-1', 'cococabanalife.com', 5);
    for (const snap of history) {
      assert.equal(snap.total_keywords, 20);
    }
  });

  it('snapshot_date changes across snapshots', () => {
    const history = simulateRankingHistory('site-1', 'cococabanalife.com', 5);
    const dates = history.map(s => s.snapshot_date.split('T')[0]);
    const uniqueDates = new Set(dates);
    assert.ok(uniqueDates.size > 1);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => simulateRankingHistory(null as never, null as never));
  });
});
