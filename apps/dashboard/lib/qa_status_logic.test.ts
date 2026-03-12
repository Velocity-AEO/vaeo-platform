import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQAStatusDisplay,
  getQABadgeClasses,
} from './qa_status_logic.js';
import type { ViewportQARecord } from './qa_status_logic.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ViewportQARecord> = {}): ViewportQARecord {
  return {
    fix_id: 'fix_1',
    site_id: 'site_1',
    url: 'https://example.com',
    passed: true,
    failed_viewports: [],
    checked_at: '2026-03-12T00:00:00Z',
    screenshots: {},
    ...overrides,
  };
}

// ── buildQAStatusDisplay ─────────────────────────────────────────────────────

describe('buildQAStatusDisplay', () => {
  it('returns grey for null record', () => {
    const display = buildQAStatusDisplay(null);
    assert.equal(display.badge_color, 'grey');
    assert.equal(display.badge_label, 'Not run');
    assert.equal(display.qa_run, false);
    assert.equal(display.passed, null);
  });

  it('returns green for passed record', () => {
    const display = buildQAStatusDisplay(makeRecord({ passed: true }));
    assert.equal(display.badge_color, 'green');
    assert.equal(display.badge_label, 'Passed');
    assert.equal(display.qa_run, true);
    assert.equal(display.passed, true);
  });

  it('returns red for failed record', () => {
    const display = buildQAStatusDisplay(makeRecord({
      passed: false,
      failed_viewports: ['mobile', 'tablet'],
    }));
    assert.equal(display.badge_color, 'red');
    assert.equal(display.passed, false);
  });

  it('badge_label includes failed viewport count', () => {
    const display = buildQAStatusDisplay(makeRecord({
      passed: false,
      failed_viewports: ['mobile', 'tablet'],
    }));
    assert.ok(display.badge_label.includes('2'));
    assert.ok(display.badge_label.includes('viewports'));
  });

  it('badge_label uses singular for 1 viewport', () => {
    const display = buildQAStatusDisplay(makeRecord({
      passed: false,
      failed_viewports: ['mobile'],
    }));
    assert.ok(display.badge_label.includes('1 viewport'));
    assert.ok(!display.badge_label.includes('viewports)'));
  });

  it('includes fix_id from record', () => {
    const display = buildQAStatusDisplay(makeRecord({ fix_id: 'my_fix' }));
    assert.equal(display.fix_id, 'my_fix');
  });

  it('includes checked_at from record', () => {
    const display = buildQAStatusDisplay(makeRecord({ checked_at: '2026-01-01T00:00:00Z' }));
    assert.equal(display.checked_at, '2026-01-01T00:00:00Z');
  });

  it('returns failed_viewports list', () => {
    const display = buildQAStatusDisplay(makeRecord({
      passed: false,
      failed_viewports: ['mobile', 'desktop'],
    }));
    assert.deepEqual(display.failed_viewports, ['mobile', 'desktop']);
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => buildQAStatusDisplay(undefined as unknown as any));
  });

  it('never throws on malformed record', () => {
    assert.doesNotThrow(() => buildQAStatusDisplay({} as ViewportQARecord));
  });
});

// ── getQABadgeClasses ────────────────────────────────────────────────────────

describe('getQABadgeClasses', () => {
  it('returns non-empty string for green', () => {
    const cls = getQABadgeClasses('green');
    assert.ok(cls.length > 0);
    assert.ok(cls.includes('green'));
  });

  it('returns non-empty string for red', () => {
    const cls = getQABadgeClasses('red');
    assert.ok(cls.length > 0);
    assert.ok(cls.includes('red'));
  });

  it('returns non-empty string for grey', () => {
    const cls = getQABadgeClasses('grey');
    assert.ok(cls.length > 0);
    assert.ok(cls.includes('slate'));
  });

  it('never throws on unknown color', () => {
    assert.doesNotThrow(() => getQABadgeClasses('purple' as any));
  });
});
