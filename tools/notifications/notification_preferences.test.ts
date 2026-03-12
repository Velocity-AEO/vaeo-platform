/**
 * tools/notifications/notification_preferences.test.ts
 *
 * Tests for notification preferences model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultPreferences,
  shouldSendForPreferences,
  mergePreferences,
} from './notification_preferences.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaults() {
  return buildDefaultPreferences('site-1', 'user-1');
}

// ── buildDefaultPreferences ──────────────────────────────────────────────────

describe('buildDefaultPreferences', () => {
  it('sets site_id and user_id', () => {
    const p = buildDefaultPreferences('s1', 'u1');
    assert.equal(p.site_id, 's1');
    assert.equal(p.user_id, 'u1');
  });

  it('defaults digest_enabled to true', () => {
    assert.equal(defaults().digest_enabled, true);
  });

  it('defaults immediate_alerts_enabled to true', () => {
    assert.equal(defaults().immediate_alerts_enabled, true);
  });

  it('defaults alert_on_fix_failed to true', () => {
    assert.equal(defaults().alert_on_fix_failed, true);
  });

  it('defaults alert_on_rollback to true', () => {
    assert.equal(defaults().alert_on_rollback, true);
  });

  it('defaults alert_on_qa_failed to true', () => {
    assert.equal(defaults().alert_on_qa_failed, true);
  });

  it('defaults digest_frequency to daily', () => {
    assert.equal(defaults().digest_frequency, 'daily');
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildDefaultPreferences(null as any, null as any));
  });
});

// ── shouldSendForPreferences ─────────────────────────────────────────────────

describe('shouldSendForPreferences', () => {
  it('respects alert_on_fix_failed=true', () => {
    assert.equal(shouldSendForPreferences('fix_failed', defaults()), true);
  });

  it('respects alert_on_fix_failed=false', () => {
    const p = { ...defaults(), alert_on_fix_failed: false };
    assert.equal(shouldSendForPreferences('fix_failed', p), false);
  });

  it('respects alert_on_rollback=true', () => {
    assert.equal(shouldSendForPreferences('rollback_applied', defaults()), true);
  });

  it('respects alert_on_rollback=false', () => {
    const p = { ...defaults(), alert_on_rollback: false };
    assert.equal(shouldSendForPreferences('rollback_applied', p), false);
  });

  it('respects alert_on_qa_failed=true', () => {
    assert.equal(shouldSendForPreferences('qa_failed', defaults()), true);
  });

  it('respects alert_on_qa_failed=false', () => {
    const p = { ...defaults(), alert_on_qa_failed: false };
    assert.equal(shouldSendForPreferences('qa_failed', p), false);
  });

  it('returns digest_enabled for fix_applied', () => {
    const p = { ...defaults(), digest_enabled: false };
    assert.equal(shouldSendForPreferences('fix_applied', p), false);
  });

  it('returns digest_enabled for live_run_complete', () => {
    assert.equal(shouldSendForPreferences('live_run_complete', defaults()), true);
  });

  it('never throws on null event', () => {
    assert.doesNotThrow(() => shouldSendForPreferences(null as any, defaults()));
  });

  it('never throws on null prefs', () => {
    assert.doesNotThrow(() => shouldSendForPreferences('fix_failed', null as any));
  });
});

// ── mergePreferences ─────────────────────────────────────────────────────────

describe('mergePreferences', () => {
  it('applies updates correctly', () => {
    const merged = mergePreferences(defaults(), { digest_frequency: 'weekly' });
    assert.equal(merged.digest_frequency, 'weekly');
  });

  it('preserves unset fields', () => {
    const merged = mergePreferences(defaults(), { digest_frequency: 'weekly' });
    assert.equal(merged.digest_enabled, true);
    assert.equal(merged.alert_on_fix_failed, true);
  });

  it('preserves site_id and user_id from existing', () => {
    const merged = mergePreferences(defaults(), { digest_enabled: false });
    assert.equal(merged.site_id, 'site-1');
    assert.equal(merged.user_id, 'user-1');
  });

  it('applies multiple updates', () => {
    const merged = mergePreferences(defaults(), {
      digest_enabled: false,
      alert_on_rollback: false,
    });
    assert.equal(merged.digest_enabled, false);
    assert.equal(merged.alert_on_rollback, false);
  });

  it('never throws on null updates', () => {
    assert.doesNotThrow(() => mergePreferences(defaults(), null as any));
  });

  it('never throws on null existing', () => {
    assert.doesNotThrow(() => mergePreferences(null as any, { digest_enabled: false }));
  });
});
