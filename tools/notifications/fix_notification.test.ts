/**
 * tools/notifications/fix_notification.test.ts
 *
 * Tests for fix notification payload builder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFixNotification,
  getNotificationSubject,
  getNotificationBody,
  shouldSendImmediately,
} from './fix_notification.js';

// ── buildFixNotification ─────────────────────────────────────────────────────

describe('buildFixNotification', () => {
  it('sets event, site_id, domain', () => {
    const p = buildFixNotification('fix_applied', 'site-1', 'example.com');
    assert.equal(p.event, 'fix_applied');
    assert.equal(p.site_id, 'site-1');
    assert.equal(p.domain, 'example.com');
  });

  it('sets triggered_at', () => {
    const p = buildFixNotification('fix_applied', 's', 'd');
    assert.ok(p.triggered_at.length > 0);
  });

  it('merges optional data fields', () => {
    const p = buildFixNotification('fix_applied', 's', 'd', {
      fix_count: 3,
      fix_summary: ['title', 'meta', 'schema'],
    });
    assert.equal(p.fix_count, 3);
    assert.deepEqual(p.fix_summary, ['title', 'meta', 'schema']);
  });

  it('sets rollback_fix_id from data', () => {
    const p = buildFixNotification('rollback_applied', 's', 'd', {
      rollback_fix_id: 'fix-123',
    });
    assert.equal(p.rollback_fix_id, 'fix-123');
  });

  it('sets qa_failed_viewports from data', () => {
    const p = buildFixNotification('qa_failed', 's', 'd', {
      qa_failed_viewports: ['mobile', 'tablet'],
    });
    assert.deepEqual(p.qa_failed_viewports, ['mobile', 'tablet']);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildFixNotification(null as any, null as any, null as any));
  });

  it('never throws on undefined data', () => {
    assert.doesNotThrow(() => buildFixNotification('fix_applied', 's', 'd', undefined));
  });
});

// ── getNotificationSubject ───────────────────────────────────────────────────

describe('getNotificationSubject', () => {
  it('includes domain for fix_applied', () => {
    const p = buildFixNotification('fix_applied', 's', 'shop.com', { fix_count: 5 });
    const subj = getNotificationSubject(p);
    assert.ok(subj.includes('shop.com'));
  });

  it('includes fix count for fix_applied', () => {
    const p = buildFixNotification('fix_applied', 's', 'd', { fix_count: 3 });
    const subj = getNotificationSubject(p);
    assert.ok(subj.includes('3'));
  });

  it('returns error subject for fix_failed', () => {
    const p = buildFixNotification('fix_failed', 's', 'site.com');
    const subj = getNotificationSubject(p);
    assert.ok(subj.includes('errors'));
    assert.ok(subj.includes('site.com'));
  });

  it('returns rollback subject', () => {
    const p = buildFixNotification('rollback_applied', 's', 'site.com');
    const subj = getNotificationSubject(p);
    assert.ok(subj.includes('rolled back'));
  });

  it('returns live run subject', () => {
    const p = buildFixNotification('live_run_complete', 's', 'site.com');
    const subj = getNotificationSubject(p);
    assert.ok(subj.includes('complete'));
  });

  it('returns qa_failed subject', () => {
    const p = buildFixNotification('qa_failed', 's', 'site.com');
    const subj = getNotificationSubject(p);
    assert.ok(subj.includes('QA failed'));
  });

  it('never throws on null payload', () => {
    assert.doesNotThrow(() => getNotificationSubject(null as any));
  });
});

// ── getNotificationBody ──────────────────────────────────────────────────────

describe('getNotificationBody', () => {
  it('returns non-empty string for fix_applied', () => {
    const p = buildFixNotification('fix_applied', 's', 'd', { fix_count: 2 });
    assert.ok(getNotificationBody(p).length > 0);
  });

  it('includes fix_summary items as bullets', () => {
    const p = buildFixNotification('fix_applied', 's', 'd', {
      fix_count: 2,
      fix_summary: ['Title tag', 'Meta description'],
    });
    const body = getNotificationBody(p);
    assert.ok(body.includes('Title tag'));
    assert.ok(body.includes('Meta description'));
    assert.ok(body.includes('•'));
  });

  it('includes rollback_fix_id in body', () => {
    const p = buildFixNotification('rollback_applied', 's', 'd', {
      rollback_fix_id: 'fix-abc',
    });
    const body = getNotificationBody(p);
    assert.ok(body.includes('fix-abc'));
  });

  it('includes failed viewports for qa_failed', () => {
    const p = buildFixNotification('qa_failed', 's', 'd', {
      qa_failed_viewports: ['mobile'],
    });
    const body = getNotificationBody(p);
    assert.ok(body.includes('mobile'));
  });

  it('never throws on null payload', () => {
    assert.doesNotThrow(() => getNotificationBody(null as any));
  });
});

// ── shouldSendImmediately ────────────────────────────────────────────────────

describe('shouldSendImmediately', () => {
  it('returns true for fix_failed', () => {
    assert.equal(shouldSendImmediately('fix_failed'), true);
  });

  it('returns true for rollback_applied', () => {
    assert.equal(shouldSendImmediately('rollback_applied'), true);
  });

  it('returns true for qa_failed', () => {
    assert.equal(shouldSendImmediately('qa_failed'), true);
  });

  it('returns false for fix_applied', () => {
    assert.equal(shouldSendImmediately('fix_applied'), false);
  });

  it('returns false for live_run_complete', () => {
    assert.equal(shouldSendImmediately('live_run_complete'), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => shouldSendImmediately(null as any));
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => shouldSendImmediately(undefined as any));
  });
});
