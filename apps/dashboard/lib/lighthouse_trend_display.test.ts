import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrendBadgeConfig,
  formatScoreChange,
  getProjectedScoreWarning,
} from './lighthouse_trend_display.js';

// ── getTrendBadgeConfig ──────────────────────────────────────────────────────

describe('getTrendBadgeConfig', () => {
  it('returns correct config for improving', () => {
    const badge = getTrendBadgeConfig('improving');
    assert.ok(badge.label.includes('Improving'));
    assert.ok(badge.color.includes('green'));
  });

  it('returns correct config for stable', () => {
    const badge = getTrendBadgeConfig('stable');
    assert.ok(badge.label.includes('Stable'));
  });

  it('returns correct config for degrading_gradual', () => {
    const badge = getTrendBadgeConfig('degrading_gradual');
    assert.ok(badge.label.includes('Gradual'));
    assert.ok(badge.color.includes('yellow'));
  });

  it('returns correct config for degrading_sudden', () => {
    const badge = getTrendBadgeConfig('degrading_sudden');
    assert.ok(badge.label.includes('Sudden'));
    assert.ok(badge.color.includes('red'));
  });

  it('returns correct config for volatile', () => {
    const badge = getTrendBadgeConfig('volatile');
    assert.ok(badge.label.includes('Volatile'));
    assert.ok(badge.color.includes('orange'));
  });

  it('returns correct config for insufficient_data', () => {
    const badge = getTrendBadgeConfig('insufficient_data');
    assert.ok(badge.label.includes('Not enough'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getTrendBadgeConfig(null as any));
  });
});

// ── formatScoreChange ────────────────────────────────────────────────────────

describe('formatScoreChange', () => {
  it('returns dash for null', () => {
    assert.equal(formatScoreChange(null), '—');
  });

  it('formats positive correctly', () => {
    assert.equal(formatScoreChange(5), '+5');
  });

  it('formats negative correctly', () => {
    assert.equal(formatScoreChange(-3), '-3');
  });

  it('formats zero correctly', () => {
    assert.equal(formatScoreChange(0), '0');
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => formatScoreChange(undefined as any));
  });
});

// ── getProjectedScoreWarning ─────────────────────────────────────────────────

describe('getProjectedScoreWarning', () => {
  it('returns null for >= 70', () => {
    assert.equal(getProjectedScoreWarning(75), null);
    assert.equal(getProjectedScoreWarning(100), null);
  });

  it('returns warning for < 70', () => {
    const result = getProjectedScoreWarning(65);
    assert.ok(result !== null);
    assert.ok(result!.includes('Warning'));
  });

  it('returns critical for < 50', () => {
    const result = getProjectedScoreWarning(40);
    assert.ok(result !== null);
    assert.ok(result!.includes('Critical'));
  });

  it('returns null for null input', () => {
    assert.equal(getProjectedScoreWarning(null), null);
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => getProjectedScoreWarning(undefined as any));
  });
});
