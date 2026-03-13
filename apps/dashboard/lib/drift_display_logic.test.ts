import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDriftRateColor,
  getDriftStatusLabel,
  getDriftCauseLabel,
  formatDriftSummaryHeadline,
} from './drift_display_logic.js';

// ── getDriftRateColor ────────────────────────────────────────────────────────

describe('getDriftRateColor', () => {
  it('returns green for 0', () => {
    assert.equal(getDriftRateColor(0), 'text-green-600');
  });

  it('returns yellow for < 10', () => {
    assert.equal(getDriftRateColor(5), 'text-yellow-600');
    assert.equal(getDriftRateColor(9.9), 'text-yellow-600');
  });

  it('returns red for >= 10', () => {
    assert.equal(getDriftRateColor(10), 'text-red-600');
    assert.equal(getDriftRateColor(50), 'text-red-600');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getDriftRateColor(null as any));
  });
});

// ── getDriftStatusLabel ──────────────────────────────────────────────────────

describe('getDriftStatusLabel', () => {
  it('returns correct label per status', () => {
    assert.equal(getDriftStatusLabel('stable'), 'Stable');
    assert.equal(getDriftStatusLabel('drifted'), 'Drifted — requeued');
    assert.equal(getDriftStatusLabel('unknown'), 'Unknown');
  });

  it('returns Unknown for unrecognized', () => {
    assert.equal(getDriftStatusLabel('bad' as any), 'Unknown');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getDriftStatusLabel(null as any));
  });
});

// ── getDriftCauseLabel ───────────────────────────────────────────────────────

describe('getDriftCauseLabel', () => {
  it('returns correct label per cause', () => {
    assert.equal(getDriftCauseLabel('theme_update'), 'Theme update');
    assert.equal(getDriftCauseLabel('plugin_update'), 'Plugin update');
    assert.equal(getDriftCauseLabel('cms_edit'), 'Manual edit');
    assert.equal(getDriftCauseLabel('cache_issue'), 'Cache issue');
    assert.equal(getDriftCauseLabel('cdn_issue'), 'CDN issue');
  });

  it('returns Unknown cause for null', () => {
    assert.equal(getDriftCauseLabel(null), 'Unknown cause');
  });

  it('returns Unknown cause for unrecognized', () => {
    assert.equal(getDriftCauseLabel('solar_flare'), 'Unknown cause');
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => getDriftCauseLabel(undefined as any));
  });
});

// ── formatDriftSummaryHeadline ───────────────────────────────────────────────

describe('formatDriftSummaryHeadline', () => {
  it('returns stable message when 0 drifted', () => {
    const result = formatDriftSummaryHeadline({ fixes_scanned: 10, stable_fixes: 10, drifted_fixes: 0, drift_rate: 0 });
    assert.ok(result.includes('All 10 fixes are stable'));
  });

  it('returns singular message when 1 drifted', () => {
    const result = formatDriftSummaryHeadline({ fixes_scanned: 10, stable_fixes: 9, drifted_fixes: 1, drift_rate: 10 });
    assert.ok(result.includes('1 fix was overwritten'));
  });

  it('returns plural message when >1 drifted', () => {
    const result = formatDriftSummaryHeadline({ fixes_scanned: 10, stable_fixes: 7, drifted_fixes: 3, drift_rate: 30 });
    assert.ok(result.includes('3 fixes were overwritten'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatDriftSummaryHeadline(null as any));
  });
});
