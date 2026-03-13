/**
 * apps/dashboard/lib/sandbox_health_display.test.ts
 *
 * Tests for sandbox health display helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPassRateLabel,
  getPassRateColor,
  getTrendIcon,
  formatFailureReason,
} from './sandbox_health_display.js';

// ── getPassRateLabel ─────────────────────────────────────────────────────────

describe('getPassRateLabel', () => {
  it('returns Excellent for >= 95', () => {
    assert.equal(getPassRateLabel(95), 'Excellent');
    assert.equal(getPassRateLabel(100), 'Excellent');
  });

  it('returns Good for >= 85', () => {
    assert.equal(getPassRateLabel(85), 'Good');
    assert.equal(getPassRateLabel(94), 'Good');
  });

  it('returns Acceptable for >= 70', () => {
    assert.equal(getPassRateLabel(70), 'Acceptable');
    assert.equal(getPassRateLabel(84), 'Acceptable');
  });

  it('returns Needs Attention for < 70', () => {
    assert.equal(getPassRateLabel(69), 'Needs Attention');
    assert.equal(getPassRateLabel(0), 'Needs Attention');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => getPassRateLabel(NaN));
  });
});

// ── getPassRateColor ─────────────────────────────────────────────────────────

describe('getPassRateColor', () => {
  it('returns green for >= 85', () => {
    assert.equal(getPassRateColor(85), 'text-green-600');
    assert.equal(getPassRateColor(100), 'text-green-600');
  });

  it('returns yellow for >= 70', () => {
    assert.equal(getPassRateColor(70), 'text-yellow-600');
    assert.equal(getPassRateColor(84), 'text-yellow-600');
  });

  it('returns red for < 70', () => {
    assert.equal(getPassRateColor(69), 'text-red-600');
    assert.equal(getPassRateColor(0), 'text-red-600');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => getPassRateColor(NaN));
  });
});

// ── getTrendIcon ─────────────────────────────────────────────────────────────

describe('getTrendIcon', () => {
  it('returns ↑ for improving', () => {
    assert.equal(getTrendIcon('improving'), '↑');
  });

  it('returns ↓ for degrading', () => {
    assert.equal(getTrendIcon('degrading'), '↓');
  });

  it('returns → for stable', () => {
    assert.equal(getTrendIcon('stable'), '→');
  });

  it('returns → for unknown', () => {
    assert.equal(getTrendIcon('whatever'), '→');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getTrendIcon(null as any));
  });
});

// ── formatFailureReason ──────────────────────────────────────────────────────

describe('formatFailureReason', () => {
  it('returns correct label for delta_verify_failed', () => {
    assert.equal(formatFailureReason('delta_verify_failed'), 'Change not detected');
  });

  it('returns correct label for lighthouse_regression', () => {
    assert.equal(formatFailureReason('lighthouse_regression'), 'Performance drop');
  });

  it('returns correct label for viewport_capture_timeout', () => {
    assert.equal(formatFailureReason('viewport_capture_timeout'), 'Capture timeout');
  });

  it('returns correct label for viewport_qa_failed', () => {
    assert.equal(formatFailureReason('viewport_qa_failed'), 'Visual QA failed');
  });

  it('passes through unknown reasons', () => {
    assert.equal(formatFailureReason('some_new_reason'), 'some_new_reason');
  });

  it('returns Unknown for empty', () => {
    assert.equal(formatFailureReason(''), 'Unknown');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatFailureReason(null as any));
  });
});
