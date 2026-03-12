import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFailedViewportsList,
  getBadgeAriaLabel,
} from './badge_display_logic.js';
import type { QAStatusDisplay } from './qa_status_logic.js';

// ── getFailedViewportsList ───────────────────────────────────────────────────

describe('getFailedViewportsList', () => {
  it('joins multiple viewports with commas', () => {
    assert.equal(getFailedViewportsList(['mobile', 'tablet']), 'mobile, tablet');
  });

  it('returns single viewport without comma', () => {
    assert.equal(getFailedViewportsList(['desktop']), 'desktop');
  });

  it('returns "none" for empty array', () => {
    assert.equal(getFailedViewportsList([]), 'none');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getFailedViewportsList(null as unknown as string[]));
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => getFailedViewportsList(undefined as unknown as string[]));
  });
});

// ── getBadgeAriaLabel ────────────────────────────────────────────────────────

describe('getBadgeAriaLabel', () => {
  it('returns "QA not yet run" when not run', () => {
    const display: QAStatusDisplay = {
      fix_id: 'f1', qa_run: false, passed: null,
      failed_viewports: [], checked_at: null,
      badge_color: 'grey', badge_label: 'Not run',
    };
    assert.equal(getBadgeAriaLabel(display), 'QA not yet run');
  });

  it('returns "All viewports passed" when passed', () => {
    const display: QAStatusDisplay = {
      fix_id: 'f2', qa_run: true, passed: true,
      failed_viewports: [], checked_at: '2026-01-01T00:00:00Z',
      badge_color: 'green', badge_label: 'Passed',
    };
    assert.ok(getBadgeAriaLabel(display).includes('passed'));
  });

  it('includes count when failed', () => {
    const display: QAStatusDisplay = {
      fix_id: 'f3', qa_run: true, passed: false,
      failed_viewports: ['mobile', 'tablet'], checked_at: '2026-01-01T00:00:00Z',
      badge_color: 'red', badge_label: 'Failed',
    };
    assert.ok(getBadgeAriaLabel(display).includes('2'));
  });

  it('returns non-empty string', () => {
    const display: QAStatusDisplay = {
      fix_id: 'f4', qa_run: true, passed: true,
      failed_viewports: [], checked_at: null,
      badge_color: 'green', badge_label: 'Passed',
    };
    assert.ok(getBadgeAriaLabel(display).length > 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getBadgeAriaLabel(null as unknown as QAStatusDisplay));
  });
});
