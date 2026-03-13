/**
 * tools/pipeline/suspension_policy.test.ts
 *
 * Tests for suspension policy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUSPENSION_POLICY,
  shouldSuspend,
  getSuspensionDuration,
  buildSuspensionRecord,
} from './suspension_policy.js';

// ── SUSPENSION_POLICY constants ──────────────────────────────────────────────

describe('SUSPENSION_POLICY', () => {
  it('MAX_CONSECUTIVE_FAILURES is 3', () => {
    assert.equal(SUSPENSION_POLICY.MAX_CONSECUTIVE_FAILURES, 3);
  });

  it('SUSPENSION_DURATION_HOURS is 24', () => {
    assert.equal(SUSPENSION_POLICY.SUSPENSION_DURATION_HOURS, 24);
  });

  it('HARD_SUSPENSION_THRESHOLD is 10', () => {
    assert.equal(SUSPENSION_POLICY.HARD_SUSPENSION_THRESHOLD, 10);
  });

  it('HARD_SUSPENSION_DURATION_HOURS is 168', () => {
    assert.equal(SUSPENSION_POLICY.HARD_SUSPENSION_DURATION_HOURS, 168);
  });
});

// ── shouldSuspend ────────────────────────────────────────────────────────────

describe('shouldSuspend', () => {
  it('returns false below threshold', () => {
    assert.equal(shouldSuspend(0), false);
    assert.equal(shouldSuspend(1), false);
    assert.equal(shouldSuspend(2), false);
  });

  it('returns true at threshold', () => {
    assert.equal(shouldSuspend(3), true);
  });

  it('returns true above threshold', () => {
    assert.equal(shouldSuspend(5), true);
    assert.equal(shouldSuspend(10), true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => shouldSuspend(null as any));
  });
});

// ── getSuspensionDuration ────────────────────────────────────────────────────

describe('getSuspensionDuration', () => {
  it('returns soft duration below hard threshold', () => {
    assert.equal(getSuspensionDuration(3), 24);
    assert.equal(getSuspensionDuration(5), 24);
    assert.equal(getSuspensionDuration(9), 24);
  });

  it('returns hard duration at hard threshold', () => {
    assert.equal(getSuspensionDuration(10), 168);
  });

  it('returns hard duration above hard threshold', () => {
    assert.equal(getSuspensionDuration(15), 168);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getSuspensionDuration(null as any));
  });
});

// ── buildSuspensionRecord ────────────────────────────────────────────────────

describe('buildSuspensionRecord', () => {
  it('sets resume_at correctly for soft suspension', () => {
    const record = buildSuspensionRecord('s1', 3, 'consecutive_failures', 'timeout');
    const suspendedMs = Date.parse(record.suspended_at);
    const resumeMs    = Date.parse(record.resume_at);
    const diffHours   = (resumeMs - suspendedMs) / (60 * 60 * 1000);
    assert.ok(Math.abs(diffHours - 24) < 0.1);
  });

  it('sets resume_at correctly for hard suspension', () => {
    const record = buildSuspensionRecord('s1', 10, 'consecutive_failures', 'timeout');
    const suspendedMs = Date.parse(record.suspended_at);
    const resumeMs    = Date.parse(record.resume_at);
    const diffHours   = (resumeMs - suspendedMs) / (60 * 60 * 1000);
    assert.ok(Math.abs(diffHours - 168) < 0.1);
  });

  it('sets is_hard_suspension true at threshold', () => {
    assert.equal(buildSuspensionRecord('s1', 10, 'consecutive_failures', null).is_hard_suspension, true);
  });

  it('sets is_hard_suspension false below threshold', () => {
    assert.equal(buildSuspensionRecord('s1', 3, 'consecutive_failures', null).is_hard_suspension, false);
  });

  it('sets auto_resume true for non-manual reasons', () => {
    assert.equal(buildSuspensionRecord('s1', 3, 'consecutive_failures', null).auto_resume, true);
    assert.equal(buildSuspensionRecord('s1', 3, 'credential_invalid', null).auto_resume, true);
    assert.equal(buildSuspensionRecord('s1', 3, 'theme_conflict', null).auto_resume, true);
    assert.equal(buildSuspensionRecord('s1', 3, 'api_quota_exceeded', null).auto_resume, true);
  });

  it('sets auto_resume false for manual reason', () => {
    assert.equal(buildSuspensionRecord('s1', 3, 'manual', null).auto_resume, false);
  });

  it('stores last_error', () => {
    assert.equal(buildSuspensionRecord('s1', 3, 'consecutive_failures', 'timeout').last_error, 'timeout');
  });

  it('stores null last_error', () => {
    assert.equal(buildSuspensionRecord('s1', 3, 'consecutive_failures', null).last_error, null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildSuspensionRecord(null as any, null as any, null as any, null as any));
  });
});
