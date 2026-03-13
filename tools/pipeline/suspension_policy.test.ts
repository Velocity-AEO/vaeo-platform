/**
 * tools/pipeline/suspension_policy.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUSPENSION_POLICY,
  shouldSuspend,
  getSuspensionDuration,
  buildSuspensionRecord,
  type SuspensionReason,
} from './suspension_policy.js';

// ── SUSPENSION_POLICY constants ───────────────────────────────────────────────

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

// ── shouldSuspend ─────────────────────────────────────────────────────────────

describe('shouldSuspend', () => {
  it('returns false below threshold (0)', () => {
    assert.equal(shouldSuspend(0), false);
  });

  it('returns false below threshold (2)', () => {
    assert.equal(shouldSuspend(2), false);
  });

  it('returns true at threshold (3)', () => {
    assert.equal(shouldSuspend(3), true);
  });

  it('returns true above threshold (5)', () => {
    assert.equal(shouldSuspend(5), true);
  });

  it('returns false for null/undefined', () => {
    assert.equal(shouldSuspend(null as any), false);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => shouldSuspend(undefined as any));
  });
});

// ── getSuspensionDuration ─────────────────────────────────────────────────────

describe('getSuspensionDuration', () => {
  it('returns soft duration (24h) below hard threshold', () => {
    assert.equal(getSuspensionDuration(3), 24);
  });

  it('returns soft duration (24h) for 9 failures', () => {
    assert.equal(getSuspensionDuration(9), 24);
  });

  it('returns hard duration (168h) at hard threshold (10)', () => {
    assert.equal(getSuspensionDuration(10), 168);
  });

  it('returns hard duration (168h) above hard threshold (15)', () => {
    assert.equal(getSuspensionDuration(15), 168);
  });

  it('returns soft duration for 0', () => {
    assert.equal(getSuspensionDuration(0), 24);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getSuspensionDuration(null as any));
  });
});

// ── buildSuspensionRecord ─────────────────────────────────────────────────────

describe('buildSuspensionRecord', () => {
  it('sets site_id correctly', () => {
    const r = buildSuspensionRecord('site_x', 3, 'consecutive_failures', null);
    assert.equal(r.site_id, 'site_x');
  });

  it('sets reason correctly', () => {
    const r = buildSuspensionRecord('s1', 3, 'credential_invalid', null);
    assert.equal(r.reason, 'credential_invalid');
  });

  it('sets consecutive_failures correctly', () => {
    const r = buildSuspensionRecord('s1', 5, 'consecutive_failures', null);
    assert.equal(r.consecutive_failures, 5);
  });

  it('sets last_error correctly', () => {
    const r = buildSuspensionRecord('s1', 3, 'consecutive_failures', 'API 500');
    assert.equal(r.last_error, 'API 500');
  });

  it('sets last_error null when null passed', () => {
    const r = buildSuspensionRecord('s1', 3, 'consecutive_failures', null);
    assert.equal(r.last_error, null);
  });

  it('sets resume_at ~24h in the future for soft suspension', () => {
    const before = Date.now();
    const r      = buildSuspensionRecord('s1', 3, 'consecutive_failures', null);
    const after  = Date.now();
    const resumeMs = new Date(r.resume_at).getTime();
    const expectedMs = before + 24 * 60 * 60 * 1000;
    assert.ok(resumeMs >= expectedMs - 100);
    assert.ok(resumeMs <= expectedMs + (after - before) + 100);
  });

  it('sets resume_at ~168h in the future for hard suspension', () => {
    const before = Date.now();
    const r      = buildSuspensionRecord('s1', 10, 'consecutive_failures', null);
    const resumeMs   = new Date(r.resume_at).getTime();
    const expectedMs = before + 168 * 60 * 60 * 1000;
    assert.ok(resumeMs >= expectedMs - 100);
  });

  it('sets is_hard_suspension false below hard threshold', () => {
    const r = buildSuspensionRecord('s1', 3, 'consecutive_failures', null);
    assert.equal(r.is_hard_suspension, false);
  });

  it('sets is_hard_suspension true at hard threshold', () => {
    const r = buildSuspensionRecord('s1', 10, 'consecutive_failures', null);
    assert.equal(r.is_hard_suspension, true);
  });

  it('sets auto_resume true for consecutive_failures reason', () => {
    const r = buildSuspensionRecord('s1', 3, 'consecutive_failures', null);
    assert.equal(r.auto_resume, true);
  });

  it('sets auto_resume true for credential_invalid reason', () => {
    const r = buildSuspensionRecord('s1', 3, 'credential_invalid', null);
    assert.equal(r.auto_resume, true);
  });

  it('sets auto_resume false for manual reason', () => {
    const r = buildSuspensionRecord('s1', 1, 'manual', null);
    assert.equal(r.auto_resume, false);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildSuspensionRecord(null as any, null as any, null as any, null));
  });
});
