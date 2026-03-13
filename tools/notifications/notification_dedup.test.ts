/**
 * tools/notifications/notification_dedup.test.ts
 *
 * Tests for notification deduplication engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEDUP_WINDOW_MS,
  buildDedupKey,
  checkNotificationDedup,
  recordNotificationSent,
  cleanExpiredDedupRecords,
  type NotificationDedupRecord,
  type NotificationDedupDeps,
} from './notification_dedup.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function inMemoryStore(): NotificationDedupDeps & { records: Map<string, NotificationDedupRecord> } {
  const records = new Map<string, NotificationDedupRecord>();
  return {
    records,
    lookupFn: async (key) => records.get(key) ?? null,
    saveFn: async (rec) => { records.set(rec.dedup_key, rec); },
    deleteFn: async (before_iso) => {
      const cutoff = new Date(before_iso).getTime();
      let count = 0;
      for (const [key, rec] of records) {
        if (new Date(rec.expires_at).getTime() <= cutoff) {
          records.delete(key);
          count++;
        }
      }
      return count;
    },
    nowFn: () => Date.now(),
  };
}

// ── DEDUP_WINDOW_MS ──────────────────────────────────────────────────────────

describe('DEDUP_WINDOW_MS', () => {
  it('is 1 hour in milliseconds', () => {
    assert.equal(DEDUP_WINDOW_MS, 3_600_000);
  });
});

// ── buildDedupKey ────────────────────────────────────────────────────────────

describe('buildDedupKey', () => {
  it('builds key with all parts', () => {
    const key = buildDedupKey('site-1', 'fix-42', 'fix_applied');
    assert.equal(key, 'dedup:site-1:fix-42:fix_applied');
  });

  it('handles empty strings', () => {
    const key = buildDedupKey('', '', '');
    assert.equal(key, 'dedup:::');
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildDedupKey(null as any, null as any, null as any));
  });

  it('includes site_id in key', () => {
    const key = buildDedupKey('my-site', 'f1', 'fix_failed');
    assert.ok(key.includes('my-site'));
  });

  it('includes fix_id in key', () => {
    const key = buildDedupKey('s1', 'fix-99', 'qa_failed');
    assert.ok(key.includes('fix-99'));
  });

  it('includes event in key', () => {
    const key = buildDedupKey('s1', 'f1', 'rollback_applied');
    assert.ok(key.includes('rollback_applied'));
  });
});

// ── checkNotificationDedup ───────────────────────────────────────────────────

describe('checkNotificationDedup', () => {
  it('allows when no prior record exists', async () => {
    const store = inMemoryStore();
    const result = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(result.allowed, true);
  });

  it('blocks when duplicate within window', async () => {
    const store = inMemoryStore();
    const now = Date.now();
    store.records.set('dedup:site-1:fix-1:fix_applied', {
      dedup_key: 'dedup:site-1:fix-1:fix_applied',
      site_id: 'site-1',
      fix_id: 'fix-1',
      event: 'fix_applied',
      sent_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + DEDUP_WINDOW_MS).toISOString(),
    });
    const result = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'duplicate within window');
  });

  it('allows when record has expired', async () => {
    const store = inMemoryStore();
    const now = Date.now();
    store.records.set('dedup:site-1:fix-1:fix_applied', {
      dedup_key: 'dedup:site-1:fix-1:fix_applied',
      site_id: 'site-1',
      fix_id: 'fix-1',
      event: 'fix_applied',
      sent_at: new Date(now - DEDUP_WINDOW_MS - 2000).toISOString(),
      expires_at: new Date(now - 1000).toISOString(),
    });
    const result = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(result.allowed, true);
  });

  it('returns dedup_key in result', async () => {
    const result = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied');
    assert.equal(result.dedup_key, 'dedup:site-1:fix-1:fix_applied');
  });

  it('fails open when lookupFn throws', async () => {
    const result = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', {
      lookupFn: async () => { throw new Error('db down'); },
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'dedup_check_error');
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() =>
      checkNotificationDedup(null as any, null as any, null as any),
    );
  });

  it('different fix_ids are independent', async () => {
    const store = inMemoryStore();
    const now = Date.now();
    store.records.set('dedup:site-1:fix-1:fix_applied', {
      dedup_key: 'dedup:site-1:fix-1:fix_applied',
      site_id: 'site-1',
      fix_id: 'fix-1',
      event: 'fix_applied',
      sent_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + DEDUP_WINDOW_MS).toISOString(),
    });
    const result = await checkNotificationDedup('site-1', 'fix-2', 'fix_applied', store);
    assert.equal(result.allowed, true);
  });

  it('different events for same fix are independent', async () => {
    const store = inMemoryStore();
    const now = Date.now();
    store.records.set('dedup:site-1:fix-1:fix_applied', {
      dedup_key: 'dedup:site-1:fix-1:fix_applied',
      site_id: 'site-1',
      fix_id: 'fix-1',
      event: 'fix_applied',
      sent_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + DEDUP_WINDOW_MS).toISOString(),
    });
    const result = await checkNotificationDedup('site-1', 'fix-1', 'fix_failed', store);
    assert.equal(result.allowed, true);
  });
});

// ── recordNotificationSent ───────────────────────────────────────────────────

describe('recordNotificationSent', () => {
  it('saves record and returns true', async () => {
    const store = inMemoryStore();
    const ok = await recordNotificationSent('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(ok, true);
    assert.equal(store.records.size, 1);
  });

  it('saved record has correct fields', async () => {
    const store = inMemoryStore();
    await recordNotificationSent('site-1', 'fix-1', 'fix_applied', store);
    const rec = store.records.get('dedup:site-1:fix-1:fix_applied');
    assert.ok(rec);
    assert.equal(rec!.site_id, 'site-1');
    assert.equal(rec!.fix_id, 'fix-1');
    assert.equal(rec!.event, 'fix_applied');
    assert.ok(rec!.sent_at);
    assert.ok(rec!.expires_at);
  });

  it('expires_at is ~1 hour after sent_at', async () => {
    const store = inMemoryStore();
    const now = 1700000000000;
    store.nowFn = () => now;
    await recordNotificationSent('site-1', 'fix-1', 'fix_applied', store);
    const rec = store.records.get('dedup:site-1:fix-1:fix_applied')!;
    const sentMs = new Date(rec.sent_at).getTime();
    const expiresMs = new Date(rec.expires_at).getTime();
    assert.equal(expiresMs - sentMs, DEDUP_WINDOW_MS);
  });

  it('returns false when saveFn throws', async () => {
    const ok = await recordNotificationSent('site-1', 'fix-1', 'fix_applied', {
      saveFn: async () => { throw new Error('fail'); },
    });
    assert.equal(ok, false);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() =>
      recordNotificationSent(null as any, null as any, null as any),
    );
  });
});

// ── cleanExpiredDedupRecords ─────────────────────────────────────────────────

describe('cleanExpiredDedupRecords', () => {
  it('deletes expired records', async () => {
    const store = inMemoryStore();
    const now = Date.now();
    store.records.set('dedup:site-1:fix-1:fix_applied', {
      dedup_key: 'dedup:site-1:fix-1:fix_applied',
      site_id: 'site-1',
      fix_id: 'fix-1',
      event: 'fix_applied',
      sent_at: new Date(now - DEDUP_WINDOW_MS - 2000).toISOString(),
      expires_at: new Date(now - 1000).toISOString(),
    });
    const count = await cleanExpiredDedupRecords(store);
    assert.equal(count, 1);
    assert.equal(store.records.size, 0);
  });

  it('keeps unexpired records', async () => {
    const store = inMemoryStore();
    const now = Date.now();
    store.records.set('dedup:site-1:fix-1:fix_applied', {
      dedup_key: 'dedup:site-1:fix-1:fix_applied',
      site_id: 'site-1',
      fix_id: 'fix-1',
      event: 'fix_applied',
      sent_at: new Date(now).toISOString(),
      expires_at: new Date(now + DEDUP_WINDOW_MS).toISOString(),
    });
    const count = await cleanExpiredDedupRecords(store);
    assert.equal(count, 0);
    assert.equal(store.records.size, 1);
  });

  it('returns 0 when deleteFn throws', async () => {
    const count = await cleanExpiredDedupRecords({
      deleteFn: async () => { throw new Error('fail'); },
    });
    assert.equal(count, 0);
  });

  it('never throws with no deps', async () => {
    await assert.doesNotReject(() => cleanExpiredDedupRecords());
  });
});

// ── Integration: 3 retries send once ─────────────────────────────────────────

describe('dedup integration', () => {
  it('3 retries for same fix only allow first', async () => {
    const store = inMemoryStore();

    // First attempt — allowed
    const r1 = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(r1.allowed, true);
    await recordNotificationSent('site-1', 'fix-1', 'fix_applied', store);

    // Second attempt — blocked
    const r2 = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(r2.allowed, false);

    // Third attempt — blocked
    const r3 = await checkNotificationDedup('site-1', 'fix-1', 'fix_applied', store);
    assert.equal(r3.allowed, false);
  });
});
