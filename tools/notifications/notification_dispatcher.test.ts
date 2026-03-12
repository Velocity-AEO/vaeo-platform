/**
 * tools/notifications/notification_dispatcher.test.ts
 *
 * Tests for notification dispatcher.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchFixNotification,
  dispatchBatchNotification,
} from './notification_dispatcher.js';
import { buildFixNotification } from './fix_notification.js';
import type { FixNotificationPayload } from './fix_notification.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function config(overrides: Record<string, any> = {}) {
  return {
    site_id: 'site-1',
    user_email: 'user@example.com',
    domain: 'example.com',
    digest_enabled: true,
    immediate_alerts_enabled: true,
    ...overrides,
  };
}

function payload(event: any = 'fix_applied', extra: Record<string, any> = {}): FixNotificationPayload {
  return buildFixNotification(event, 'site-1', 'example.com', extra);
}

// ── dispatchFixNotification ──────────────────────────────────────────────────

describe('dispatchFixNotification', () => {
  it('sends immediately for fix_failed when immediate_alerts_enabled', async () => {
    let sent = false;
    const deps = {
      sendEmailFn: async () => { sent = true; },
      scheduleDigestFn: async () => {},
    };
    const result = await dispatchFixNotification(payload('fix_failed'), config(), deps);
    assert.equal(result.method, 'immediate');
    assert.equal(result.dispatched, true);
    assert.equal(sent, true);
  });

  it('sends immediately for rollback_applied', async () => {
    const result = await dispatchFixNotification(
      payload('rollback_applied'),
      config(),
      { sendEmailFn: async () => {}, scheduleDigestFn: async () => {} },
    );
    assert.equal(result.method, 'immediate');
  });

  it('sends immediately for qa_failed', async () => {
    const result = await dispatchFixNotification(
      payload('qa_failed'),
      config(),
      { sendEmailFn: async () => {}, scheduleDigestFn: async () => {} },
    );
    assert.equal(result.method, 'immediate');
  });

  it('queues digest for fix_applied', async () => {
    let digested = false;
    const deps = {
      sendEmailFn: async () => {},
      scheduleDigestFn: async () => { digested = true; },
    };
    const result = await dispatchFixNotification(payload('fix_applied'), config(), deps);
    assert.equal(result.method, 'digest');
    assert.equal(result.dispatched, true);
    assert.equal(digested, true);
  });

  it('queues digest for live_run_complete', async () => {
    const result = await dispatchFixNotification(
      payload('live_run_complete'),
      config(),
      { sendEmailFn: async () => {}, scheduleDigestFn: async () => {} },
    );
    assert.equal(result.method, 'digest');
  });

  it('skips when both disabled', async () => {
    const result = await dispatchFixNotification(
      payload('fix_applied'),
      config({ digest_enabled: false, immediate_alerts_enabled: false }),
    );
    assert.equal(result.method, 'skipped');
    assert.equal(result.dispatched, false);
    assert.equal(result.reason, 'notifications disabled');
  });

  it('skips immediate when immediate_alerts_enabled=false, falls to digest', async () => {
    const result = await dispatchFixNotification(
      payload('fix_failed'),
      config({ immediate_alerts_enabled: false }),
      { sendEmailFn: async () => {}, scheduleDigestFn: async () => {} },
    );
    assert.equal(result.method, 'digest');
  });

  it('never throws when sendEmailFn throws', async () => {
    const deps = {
      sendEmailFn: async () => { throw new Error('smtp fail'); },
      scheduleDigestFn: async () => {},
    };
    const result = await dispatchFixNotification(payload('fix_failed'), config(), deps);
    assert.equal(result.method, 'immediate');
    assert.equal(result.dispatched, true);
  });

  it('never throws when scheduleDigestFn throws', async () => {
    const deps = {
      sendEmailFn: async () => {},
      scheduleDigestFn: async () => { throw new Error('queue fail'); },
    };
    const result = await dispatchFixNotification(payload('fix_applied'), config(), deps);
    assert.equal(result.method, 'digest');
    assert.equal(result.dispatched, true);
  });

  it('result event is always set', async () => {
    const result = await dispatchFixNotification(payload('fix_applied'), config());
    assert.equal(result.event, 'fix_applied');
  });

  it('passes correct email to sendEmailFn', async () => {
    let sentTo = '';
    const deps = {
      sendEmailFn: async (to: string) => { sentTo = to; },
      scheduleDigestFn: async () => {},
    };
    await dispatchFixNotification(payload('fix_failed'), config({ user_email: 'test@test.com' }), deps);
    assert.equal(sentTo, 'test@test.com');
  });

  it('never throws on null payload', async () => {
    await assert.doesNotReject(() => dispatchFixNotification(null as any, config()));
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() => dispatchFixNotification(payload(), null as any));
  });
});

// ── dispatchBatchNotification ────────────────────────────────────────────────

describe('dispatchBatchNotification', () => {
  it('processes all payloads', async () => {
    const payloads = [payload('fix_applied'), payload('fix_failed'), payload('live_run_complete')];
    const results = await dispatchBatchNotification(payloads, config(), {
      sendEmailFn: async () => {},
      scheduleDigestFn: async () => {},
    });
    assert.equal(results.length, 3);
  });

  it('returns correct methods for mixed events', async () => {
    const payloads = [payload('fix_applied'), payload('fix_failed')];
    const results = await dispatchBatchNotification(payloads, config(), {
      sendEmailFn: async () => {},
      scheduleDigestFn: async () => {},
    });
    assert.equal(results[0].method, 'digest');
    assert.equal(results[1].method, 'immediate');
  });

  it('returns empty array for empty input', async () => {
    const results = await dispatchBatchNotification([], config());
    assert.equal(results.length, 0);
  });

  it('never throws on null payloads', async () => {
    await assert.doesNotReject(() => dispatchBatchNotification(null as any, config()));
  });

  it('handles individual payload errors', async () => {
    const payloads = [payload('fix_applied'), null as any, payload('fix_failed')];
    const deps = { sendEmailFn: async () => {}, scheduleDigestFn: async () => {} };
    await assert.doesNotReject(() => dispatchBatchNotification(payloads, config(), deps));
  });
});
