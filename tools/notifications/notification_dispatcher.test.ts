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
import {
  DEDUP_WINDOW_MS,
  type NotificationDedupRecord,
  type NotificationDedupDeps,
} from './notification_dedup.js';

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

// ── Dedup integration ────────────────────────────────────────────────────────

function dedupStore(): NotificationDedupDeps & { records: Map<string, NotificationDedupRecord> } {
  const records = new Map<string, NotificationDedupRecord>();
  return {
    records,
    lookupFn: async (key) => records.get(key) ?? null,
    saveFn: async (rec) => { records.set(rec.dedup_key, rec); },
    deleteFn: async () => 0,
    nowFn: () => Date.now(),
  };
}

describe('dispatchFixNotification dedup', () => {
  it('dispatches first notification with fix_id', async () => {
    const store = dedupStore();
    const result = await dispatchFixNotification(
      payload('fix_failed'), config(),
      { sendEmailFn: async () => {}, scheduleDigestFn: async () => {}, dedupDeps: store },
      { fix_id: 'fix-1' },
    );
    assert.equal(result.dispatched, true);
    assert.equal(result.method, 'immediate');
  });

  it('blocks duplicate within window', async () => {
    const store = dedupStore();
    const deps = { sendEmailFn: async () => {}, scheduleDigestFn: async () => {}, dedupDeps: store };
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    const r2 = await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    assert.equal(r2.dispatched, false);
    assert.equal(r2.skipped, true);
    assert.equal(r2.skip_reason, 'duplicate within window');
  });

  it('dedup_key is set on skipped result', async () => {
    const store = dedupStore();
    const deps = { sendEmailFn: async () => {}, scheduleDigestFn: async () => {}, dedupDeps: store };
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    const r2 = await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    assert.ok(r2.dedup_key);
    assert.ok(r2.dedup_key!.includes('fix-1'));
  });

  it('3 retries send only once', async () => {
    const store = dedupStore();
    let sendCount = 0;
    const deps = {
      sendEmailFn: async () => { sendCount++; },
      scheduleDigestFn: async () => {},
      dedupDeps: store,
    };
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    assert.equal(sendCount, 1);
  });

  it('allows different fix_ids independently', async () => {
    const store = dedupStore();
    const deps = { sendEmailFn: async () => {}, scheduleDigestFn: async () => {}, dedupDeps: store };
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    const r2 = await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-2' });
    assert.equal(r2.dispatched, true);
  });

  it('allows different events for same fix', async () => {
    const store = dedupStore();
    const deps = { sendEmailFn: async () => {}, scheduleDigestFn: async () => {}, dedupDeps: store };
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    const r2 = await dispatchFixNotification(payload('fix_applied'), config(), deps, { fix_id: 'fix-1' });
    assert.equal(r2.dispatched, true);
  });

  it('no fix_id means no dedup check', async () => {
    let sendCount = 0;
    const deps = {
      sendEmailFn: async () => { sendCount++; },
      scheduleDigestFn: async () => {},
    };
    await dispatchFixNotification(payload('fix_failed'), config(), deps);
    await dispatchFixNotification(payload('fix_failed'), config(), deps);
    assert.equal(sendCount, 2);
  });

  it('fails open when dedup lookupFn throws', async () => {
    const deps = {
      sendEmailFn: async () => {},
      scheduleDigestFn: async () => {},
      dedupDeps: {
        lookupFn: async () => { throw new Error('db error'); },
        saveFn: async () => {},
      },
    };
    const result = await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    assert.equal(result.dispatched, true);
  });

  it('dedup works for digest path', async () => {
    const store = dedupStore();
    let digestCount = 0;
    const deps = {
      sendEmailFn: async () => {},
      scheduleDigestFn: async () => { digestCount++; },
      dedupDeps: store,
    };
    await dispatchFixNotification(payload('fix_applied'), config(), deps, { fix_id: 'fix-1' });
    await dispatchFixNotification(payload('fix_applied'), config(), deps, { fix_id: 'fix-1' });
    assert.equal(digestCount, 1);
  });

  it('records dedup entry after successful dispatch', async () => {
    const store = dedupStore();
    const deps = { sendEmailFn: async () => {}, scheduleDigestFn: async () => {}, dedupDeps: store };
    await dispatchFixNotification(payload('fix_failed'), config(), deps, { fix_id: 'fix-1' });
    assert.equal(store.records.size, 1);
    const rec = store.records.get('dedup:site-1:fix-1:fix_failed');
    assert.ok(rec);
    assert.equal(rec!.fix_id, 'fix-1');
  });
});

// ── Drift notification ──────────────────────────────────────────────────────

describe('dispatchFixNotification drift', () => {
  it('drift_detected sends immediately', async () => {
    let sent = false;
    const deps = {
      sendEmailFn: async () => { sent = true; },
      scheduleDigestFn: async () => {},
    };
    const result = await dispatchFixNotification(
      payload('drift_detected', { fix_count: 3 }), config(), deps,
    );
    assert.equal(result.method, 'immediate');
    assert.equal(result.dispatched, true);
    assert.equal(sent, true);
  });

  it('drift notification deduped within window', async () => {
    const store = dedupStore();
    let sendCount = 0;
    const deps = {
      sendEmailFn: async () => { sendCount++; },
      scheduleDigestFn: async () => {},
      dedupDeps: store,
    };
    await dispatchFixNotification(
      payload('drift_detected', { fix_count: 3 }), config(), deps, { fix_id: 'drift-site-1' },
    );
    await dispatchFixNotification(
      payload('drift_detected', { fix_count: 5 }), config(), deps, { fix_id: 'drift-site-1' },
    );
    assert.equal(sendCount, 1);
  });

  it('drift notification lists affected fixes in summary', async () => {
    let body = '';
    const deps = {
      sendEmailFn: async (_to: string, _sub: string, b: string) => { body = b; },
      scheduleDigestFn: async () => {},
    };
    await dispatchFixNotification(
      payload('drift_detected', { fix_count: 2, fix_summary: ['title_missing on /page', 'schema on /about'] }),
      config(), deps,
    );
    assert.ok(body.includes('title_missing'));
    assert.ok(body.includes('schema'));
  });

  it('drift_resolved sends via digest', async () => {
    const result = await dispatchFixNotification(
      payload('drift_resolved', { fix_count: 2 }), config(),
      { sendEmailFn: async () => {}, scheduleDigestFn: async () => {} },
    );
    assert.equal(result.method, 'digest');
  });

  it('notification not sent when dispatched=false', async () => {
    const result = await dispatchFixNotification(
      payload('drift_detected'), config({ immediate_alerts_enabled: false, digest_enabled: false }),
    );
    assert.equal(result.dispatched, false);
  });

  it('subject includes domain name', async () => {
    const { getNotificationSubject } = await import('./fix_notification.js');
    const sub = getNotificationSubject(payload('drift_detected', { fix_count: 3 }));
    assert.ok(sub.includes('example.com'));
  });

  it('subject includes fix count', async () => {
    const { getNotificationSubject } = await import('./fix_notification.js');
    const sub = getNotificationSubject(payload('drift_detected', { fix_count: 5 }));
    assert.ok(sub.includes('5'));
  });

  it('never throws on null payload', async () => {
    await assert.doesNotReject(() => dispatchFixNotification(null as any, config()));
  });
});
