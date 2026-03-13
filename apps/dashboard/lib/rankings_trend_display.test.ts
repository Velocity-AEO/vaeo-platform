import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDirectionLabel,
  getDirectionColor,
  getDirectionBgColor,
  getDirectionIcon,
  formatPositionChange,
  formatMovementLabel,
  getPeriodLabel,
  getSummaryText,
  sortTrendsByImpact,
  getAvgChangeColor,
  type KeywordTrendDisplay,
} from './rankings_trend_display.js';

// ── getDirectionLabel ────────────────────────────────────────────────────────

describe('getDirectionLabel', () => {
  it('returns Improved', () => assert.equal(getDirectionLabel('improved'), 'Improved'));
  it('returns Declined', () => assert.equal(getDirectionLabel('declined'), 'Declined'));
  it('returns Stable', () => assert.equal(getDirectionLabel('stable'), 'Stable'));
  it('returns New', () => assert.equal(getDirectionLabel('new'), 'New'));
  it('returns Unknown for bad input', () => assert.equal(getDirectionLabel('xyz' as any), 'Unknown'));
  it('never throws on null', () => assert.doesNotThrow(() => getDirectionLabel(null as any)));
});

// ── getDirectionColor ────────────────────────────────────────────────────────

describe('getDirectionColor', () => {
  it('green for improved', () => assert.ok(getDirectionColor('improved').includes('green')));
  it('red for declined', () => assert.ok(getDirectionColor('declined').includes('red')));
  it('slate for stable', () => assert.ok(getDirectionColor('stable').includes('slate')));
  it('purple for new', () => assert.ok(getDirectionColor('new').includes('purple')));
});

// ── getDirectionBgColor ──────────────────────────────────────────────────────

describe('getDirectionBgColor', () => {
  it('green bg for improved', () => assert.ok(getDirectionBgColor('improved').includes('green')));
  it('red bg for declined', () => assert.ok(getDirectionBgColor('declined').includes('red')));
  it('never throws on null', () => assert.doesNotThrow(() => getDirectionBgColor(null as any)));
});

// ── getDirectionIcon ─────────────────────────────────────────────────────────

describe('getDirectionIcon', () => {
  it('up arrow for improved', () => assert.equal(getDirectionIcon('improved'), '\u2191'));
  it('down arrow for declined', () => assert.equal(getDirectionIcon('declined'), '\u2193'));
  it('NEW for new', () => assert.equal(getDirectionIcon('new'), 'NEW'));
});

// ── formatPositionChange ─────────────────────────────────────────────────────

describe('formatPositionChange', () => {
  it('formats positive change', () => assert.equal(formatPositionChange(5), '+5'));
  it('formats negative change', () => assert.equal(formatPositionChange(-3), '-3'));
  it('formats zero as dash', () => assert.equal(formatPositionChange(0), '\u2014'));
  it('never throws on null', () => assert.doesNotThrow(() => formatPositionChange(null as any)));
});

// ── formatMovementLabel ──────────────────────────────────────────────────────

describe('formatMovementLabel', () => {
  it('formats improvement', () => {
    assert.equal(formatMovementLabel('beach decor', 14, 6), 'beach decor moved from position 14 to position 6');
  });

  it('formats decline', () => {
    assert.equal(formatMovementLabel('rattan', 3, 10), 'rattan dropped from position 3 to position 10');
  });

  it('formats stable', () => {
    assert.ok(formatMovementLabel('kw', 5, 5).includes('held steady'));
  });

  it('formats new keyword', () => {
    assert.ok(formatMovementLabel('new kw', null, 8).includes('new keyword'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatMovementLabel(null as any, null as any, null as any));
  });
});

// ── getPeriodLabel ───────────────────────────────────────────────────────────

describe('getPeriodLabel', () => {
  it('week label', () => assert.equal(getPeriodLabel('week'), 'Week over Week'));
  it('month label', () => assert.equal(getPeriodLabel('month'), 'Month over Month'));
  it('passes through unknown', () => assert.equal(getPeriodLabel('year'), 'year'));
});

// ── getSummaryText ───────────────────────────────────────────────────────────

describe('getSummaryText', () => {
  it('shows improved and declined', () => {
    const text = getSummaryText(3, 2, 10);
    assert.ok(text.includes('3 improved'));
    assert.ok(text.includes('2 declined'));
  });

  it('shows all stable', () => {
    assert.ok(getSummaryText(0, 0, 5).includes('stable'));
  });

  it('handles zero total', () => {
    assert.ok(getSummaryText(0, 0, 0).includes('No keyword'));
  });
});

// ── sortTrendsByImpact ───────────────────────────────────────────────────────

describe('sortTrendsByImpact', () => {
  const trends: KeywordTrendDisplay[] = [
    { keyword: 'a', current_position: 5, previous_position: 5, position_change: 0, direction: 'stable' },
    { keyword: 'b', current_position: 3, previous_position: 10, position_change: 7, direction: 'improved' },
    { keyword: 'c', current_position: 15, previous_position: 8, position_change: -7, direction: 'declined' },
  ];

  it('sorts best first by default', () => {
    const sorted = sortTrendsByImpact(trends, 'best');
    assert.equal(sorted[0].keyword, 'b');
  });

  it('sorts worst first', () => {
    const sorted = sortTrendsByImpact(trends, 'worst');
    assert.equal(sorted[0].keyword, 'c');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => sortTrendsByImpact(null as any));
  });
});

// ── getAvgChangeColor ────────────────────────────────────────────────────────

describe('getAvgChangeColor', () => {
  it('green for positive', () => assert.ok(getAvgChangeColor(2).includes('green')));
  it('red for negative', () => assert.ok(getAvgChangeColor(-2).includes('red')));
  it('slate for zero', () => assert.ok(getAvgChangeColor(0).includes('slate')));
});
