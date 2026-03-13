/**
 * apps/dashboard/lib/suspension_display.test.ts
 *
 * Tests for suspension display helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSuspensionDisplayInfo,
  formatResumeAt,
  getSuspensionReasonLabel,
} from './suspension_display.js';

describe('getSuspensionDisplayInfo', () => {
  it('returns not suspended for null', () => {
    const info = getSuspensionDisplayInfo(null);
    assert.equal(info.is_suspended, false);
  });

  it('returns not suspended when pipeline_suspended=false', () => {
    const info = getSuspensionDisplayInfo({
      pipeline_suspended: false, pipeline_resume_at: null,
      consecutive_failures: 0, pipeline_suspension_reason: null,
    });
    assert.equal(info.is_suspended, false);
  });

  it('returns suspended with badge for suspended site', () => {
    const info = getSuspensionDisplayInfo({
      pipeline_suspended: true, pipeline_resume_at: '2026-03-14T00:00:00Z',
      consecutive_failures: 3, pipeline_suspension_reason: 'consecutive_failures',
    });
    assert.equal(info.is_suspended, true);
    assert.equal(info.badge_label, 'Suspended');
    assert.ok(info.badge_color.includes('yellow'));
  });

  it('shows hard suspended for 10+ failures', () => {
    const info = getSuspensionDisplayInfo({
      pipeline_suspended: true, pipeline_resume_at: '2026-03-14T00:00:00Z',
      consecutive_failures: 10, pipeline_suspension_reason: 'consecutive_failures',
    });
    assert.equal(info.badge_label, 'Hard Suspended');
    assert.ok(info.badge_color.includes('red'));
  });

  it('tooltip includes failure count', () => {
    const info = getSuspensionDisplayInfo({
      pipeline_suspended: true, pipeline_resume_at: '2026-03-14T00:00:00Z',
      consecutive_failures: 5, pipeline_suspension_reason: 'consecutive_failures',
    });
    assert.ok(info.tooltip.includes('5'));
  });

  it('show_resume is true for suspended sites', () => {
    const info = getSuspensionDisplayInfo({
      pipeline_suspended: true, pipeline_resume_at: null,
      consecutive_failures: 3, pipeline_suspension_reason: null,
    });
    assert.equal(info.show_resume, true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getSuspensionDisplayInfo(null as any));
  });
});

describe('formatResumeAt', () => {
  it('returns unknown for null', () => {
    assert.equal(formatResumeAt(null), 'unknown');
  });

  it('returns formatted date for valid ISO', () => {
    const result = formatResumeAt('2026-03-14T12:00:00Z');
    assert.ok(result !== 'unknown');
    assert.ok(result.includes('14'));
  });

  it('returns unknown for bad date', () => {
    assert.equal(formatResumeAt('not-a-date'), 'unknown');
  });
});

describe('getSuspensionReasonLabel', () => {
  it('returns label for consecutive_failures', () => {
    assert.ok(getSuspensionReasonLabel('consecutive_failures').includes('failure'));
  });

  it('returns label for manual', () => {
    assert.ok(getSuspensionReasonLabel('manual').includes('Manual'));
  });

  it('returns default for null', () => {
    assert.equal(getSuspensionReasonLabel(null), 'Suspended');
  });
});
