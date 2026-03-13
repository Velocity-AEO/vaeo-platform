/**
 * apps/dashboard/lib/lighthouse_display.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLighthouseScoreColor,
  getMobileDesktopGapLabel,
  formatLighthouseScore,
} from './lighthouse_display.js';

// ── getLighthouseScoreColor ───────────────────────────────────────────────────

describe('getLighthouseScoreColor', () => {
  it('returns green for score >= 90', () => {
    assert.equal(getLighthouseScoreColor(90),  'text-green-600');
    assert.equal(getLighthouseScoreColor(100), 'text-green-600');
    assert.equal(getLighthouseScoreColor(95),  'text-green-600');
  });

  it('returns yellow for score >= 70 and < 90', () => {
    assert.equal(getLighthouseScoreColor(70), 'text-yellow-600');
    assert.equal(getLighthouseScoreColor(89), 'text-yellow-600');
    assert.equal(getLighthouseScoreColor(75), 'text-yellow-600');
  });

  it('returns red for score < 70', () => {
    assert.equal(getLighthouseScoreColor(69), 'text-red-600');
    assert.equal(getLighthouseScoreColor(0),  'text-red-600');
    assert.equal(getLighthouseScoreColor(50), 'text-red-600');
  });

  it('boundary 90 is green not yellow', () => {
    assert.equal(getLighthouseScoreColor(90), 'text-green-600');
  });

  it('boundary 70 is yellow not red', () => {
    assert.equal(getLighthouseScoreColor(70), 'text-yellow-600');
  });

  it('never throws on invalid input', () => {
    assert.doesNotThrow(() => getLighthouseScoreColor(null as never));
    assert.doesNotThrow(() => getLighthouseScoreColor(undefined as never));
    assert.doesNotThrow(() => getLighthouseScoreColor(NaN));
  });
});

// ── getMobileDesktopGapLabel ──────────────────────────────────────────────────

describe('getMobileDesktopGapLabel', () => {
  it('returns "—" for null gap', () => {
    assert.equal(getMobileDesktopGapLabel(null), '—');
  });

  it('returns comparable label for gap <= 5', () => {
    assert.equal(getMobileDesktopGapLabel(0),  'Mobile/desktop comparable');
    assert.equal(getMobileDesktopGapLabel(5),  'Mobile/desktop comparable');
    assert.equal(getMobileDesktopGapLabel(-3), 'Mobile/desktop comparable');
  });

  it('returns optimization hint for gap > 5 and <= 15', () => {
    const label = getMobileDesktopGapLabel(10);
    assert.ok(label.includes('10pts faster'));
    assert.ok(label.includes('mobile may need optimization'));
  });

  it('includes rounded gap value in label for > 5 and <= 15', () => {
    const label = getMobileDesktopGapLabel(12.7);
    assert.ok(label.includes('13pts faster'));
  });

  it('returns large gap label for gap > 15', () => {
    const label = getMobileDesktopGapLabel(20);
    assert.ok(label.includes('Large mobile/desktop gap'));
    assert.ok(label.includes('mobile performance audit'));
  });

  it('boundary 15 is optimization hint not large gap', () => {
    const label = getMobileDesktopGapLabel(15);
    assert.ok(label.includes('faster'));
    assert.ok(!label.includes('Large'));
  });

  it('never throws on invalid input', () => {
    assert.doesNotThrow(() => getMobileDesktopGapLabel(undefined as never));
    assert.doesNotThrow(() => getMobileDesktopGapLabel(NaN as never));
  });
});

// ── formatLighthouseScore ─────────────────────────────────────────────────────

describe('formatLighthouseScore', () => {
  it('returns "—" for null', () => {
    assert.equal(formatLighthouseScore(null), '—');
  });

  it('returns "—" for undefined', () => {
    assert.equal(formatLighthouseScore(undefined), '—');
  });

  it('formats score as "{score}/100"', () => {
    assert.equal(formatLighthouseScore(85), '85/100');
    assert.equal(formatLighthouseScore(0),  '0/100');
    assert.equal(formatLighthouseScore(100), '100/100');
  });

  it('never throws on invalid input', () => {
    assert.doesNotThrow(() => formatLighthouseScore(NaN));
    assert.doesNotThrow(() => formatLighthouseScore('bad' as never));
  });
});
