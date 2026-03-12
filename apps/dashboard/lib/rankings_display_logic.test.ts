import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPosition,
  getPositionChange,
  getPositionChangeClasses,
  sortRankingsByPosition,
  truncateKeyword,
} from './rankings_display_logic.js';

// ── formatPosition ────────────────────────────────────────────────────────────

describe('formatPosition', () => {
  it('rounds to 1 decimal', () => {
    assert.equal(formatPosition(4.23), '4.2');
  });

  it('rounds up correctly', () => {
    assert.equal(formatPosition(4.25), '4.3');
  });

  it('handles whole numbers', () => {
    assert.equal(formatPosition(3), '3.0');
  });

  it('returns dash for NaN', () => {
    assert.equal(formatPosition(NaN), '—');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatPosition(null as any));
  });
});

// ── getPositionChange ─────────────────────────────────────────────────────────

describe('getPositionChange', () => {
  it('detects up (improved position)', () => {
    const result = getPositionChange(3, 5);
    assert.equal(result.direction, 'up');
    assert.equal(result.delta, 2);
  });

  it('detects down (worse position)', () => {
    const result = getPositionChange(5, 3);
    assert.equal(result.direction, 'down');
    assert.equal(result.delta, 2);
  });

  it('detects same', () => {
    const result = getPositionChange(5, 5);
    assert.equal(result.direction, 'same');
    assert.equal(result.delta, 0);
  });

  it('returns same when previous is null', () => {
    const result = getPositionChange(5, null);
    assert.equal(result.direction, 'same');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => getPositionChange(NaN, NaN));
  });
});

// ── getPositionChangeClasses ──────────────────────────────────────────────────

describe('getPositionChangeClasses', () => {
  it('returns green for up', () => {
    assert.equal(getPositionChangeClasses('up'), 'text-green-600');
  });

  it('returns red for down', () => {
    assert.equal(getPositionChangeClasses('down'), 'text-red-600');
  });

  it('returns gray for same', () => {
    assert.equal(getPositionChangeClasses('same'), 'text-gray-400');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getPositionChangeClasses(null as any));
  });
});

// ── sortRankingsByPosition ────────────────────────────────────────────────────

describe('sortRankingsByPosition', () => {
  it('sorts ascending', () => {
    const result = sortRankingsByPosition([
      { position: 5 },
      { position: 1 },
      { position: 3 },
    ]);
    assert.deepEqual(result.map((r) => r.position), [1, 3, 5]);
  });

  it('returns empty for non-array', () => {
    assert.deepEqual(sortRankingsByPosition(null as any), []);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => sortRankingsByPosition(undefined as any));
  });
});

// ── truncateKeyword ───────────────────────────────────────────────────────────

describe('truncateKeyword', () => {
  it('truncates long keywords', () => {
    assert.equal(truncateKeyword('long keyword here', 4), 'long…');
  });

  it('preserves short keywords', () => {
    assert.equal(truncateKeyword('hi', 10), 'hi');
  });

  it('returns empty for null', () => {
    assert.equal(truncateKeyword(null as any, 10), '');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => truncateKeyword(undefined as any, NaN));
  });
});
