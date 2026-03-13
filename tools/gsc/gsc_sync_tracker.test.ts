/**
 * tools/gsc/gsc_sync_tracker.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSyncRecord,
  saveSyncRecord,
  shouldForceFullSync,
  type SyncRecord,
} from './gsc_sync_tracker.ts';
import type { DeltaSyncResult } from './gsc_delta_sync.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function record(overrides?: Partial<SyncRecord>): SyncRecord {
  return {
    site_id:             'site_1',
    last_full_sync_at:   daysAgo(1),
    last_delta_sync_at:  daysAgo(0),
    last_sync_at:        daysAgo(0),
    last_sync_mode:      'delta',
    total_syncs:         5,
    total_rows_fetched:  500,
    ...overrides,
  };
}

function deltaResult(overrides?: Partial<DeltaSyncResult>): DeltaSyncResult {
  return {
    site_id:          'site_1',
    sync_mode:        'delta',
    date_range_start: '2024-01-01',
    date_range_end:   '2024-01-03',
    days_fetched:     3,
    rows_fetched:     50,
    rows_new:         40,
    rows_updated:     10,
    api_calls_made:   1,
    synced_at:        new Date().toISOString(),
    ...overrides,
  };
}

// ── loadSyncRecord ────────────────────────────────────────────────────────────

describe('loadSyncRecord', () => {
  it('returns record from loadFn', async () => {
    const r = await loadSyncRecord('site_1', {
      loadFn: async () => record(),
    });
    assert.ok(r);
    assert.equal(r!.site_id, 'site_1');
  });

  it('returns null when loadFn returns null', async () => {
    const r = await loadSyncRecord('site_1', {
      loadFn: async () => null,
    });
    assert.equal(r, null);
  });

  it('returns null on error', async () => {
    const r = await loadSyncRecord('site_1', {
      loadFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(r, null);
  });

  it('returns null by default (no loadFn)', async () => {
    const r = await loadSyncRecord('site_1');
    assert.equal(r, null);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => loadSyncRecord(null as never));
  });
});

// ── saveSyncRecord ────────────────────────────────────────────────────────────

describe('saveSyncRecord', () => {
  it('updates last_full_sync_at for full mode', async () => {
    let saved: Partial<SyncRecord> | null = null;
    const result = deltaResult({ sync_mode: 'full' });
    await saveSyncRecord('site_1', result, {
      saveFn: async (_sid, rec) => { saved = rec; },
    });
    assert.ok(saved);
    assert.equal(saved!.last_full_sync_at, result.synced_at);
  });

  it('does not update last_full_sync_at for delta mode', async () => {
    let saved: Partial<SyncRecord> | null = null;
    const existing = record({ last_full_sync_at: daysAgo(1) });
    await saveSyncRecord('site_1', deltaResult({ sync_mode: 'delta' }), {
      saveFn: async (_sid, rec) => { saved = rec; },
      loadFn: async () => existing,
    });
    assert.equal(saved!.last_full_sync_at, existing.last_full_sync_at);
  });

  it('updates last_delta_sync_at for delta mode', async () => {
    let saved: Partial<SyncRecord> | null = null;
    const result = deltaResult({ sync_mode: 'delta' });
    await saveSyncRecord('site_1', result, {
      saveFn: async (_sid, rec) => { saved = rec; },
    });
    assert.equal(saved!.last_delta_sync_at, result.synced_at);
  });

  it('increments total_syncs', async () => {
    let saved: Partial<SyncRecord> | null = null;
    const existing = record({ total_syncs: 10 });
    await saveSyncRecord('site_1', deltaResult(), {
      saveFn: async (_sid, rec) => { saved = rec; },
      loadFn: async () => existing,
    });
    assert.equal(saved!.total_syncs, 11);
  });

  it('adds rows_fetched to total_rows_fetched', async () => {
    let saved: Partial<SyncRecord> | null = null;
    const existing = record({ total_rows_fetched: 100 });
    await saveSyncRecord('site_1', deltaResult({ rows_fetched: 50 }), {
      saveFn: async (_sid, rec) => { saved = rec; },
      loadFn: async () => existing,
    });
    assert.equal(saved!.total_rows_fetched, 150);
  });

  it('returns true on success', async () => {
    const ok = await saveSyncRecord('site_1', deltaResult(), {
      saveFn: async () => {},
    });
    assert.equal(ok, true);
  });

  it('returns false on error', async () => {
    const ok = await saveSyncRecord('site_1', deltaResult(), {
      saveFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(ok, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      saveSyncRecord(null as never, null as never, {
        saveFn: async () => { throw new Error('boom'); },
      }),
    );
  });
});

// ── shouldForceFullSync ───────────────────────────────────────────────────────

describe('shouldForceFullSync', () => {
  it('returns true when no record found', async () => {
    const result = await shouldForceFullSync('site_1', {
      loadFn: async () => null,
    });
    assert.equal(result, true);
  });

  it('returns true when no record (default loadFn)', async () => {
    assert.equal(await shouldForceFullSync('site_1'), true);
  });

  it('returns true when last_full_sync_at is more than 30 days ago', async () => {
    const old = record({ last_full_sync_at: daysAgo(31) });
    const result = await shouldForceFullSync('site_1', {
      loadFn: async () => old,
    });
    assert.equal(result, true);
  });

  it('returns false when last_full_sync_at is recent (1 day ago)', async () => {
    const fresh = record({ last_full_sync_at: daysAgo(1) });
    const result = await shouldForceFullSync('site_1', {
      loadFn: async () => fresh,
    });
    assert.equal(result, false);
  });

  it('returns false when last_full_sync_at is 15 days ago', async () => {
    const mid = record({ last_full_sync_at: daysAgo(15) });
    const result = await shouldForceFullSync('site_1', {
      loadFn: async () => mid,
    });
    assert.equal(result, false);
  });

  it('returns true on error (safe default)', async () => {
    const result = await shouldForceFullSync('site_1', {
      loadFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result, true);
  });

  it('returns true when last_full_sync_at is null on record', async () => {
    const noFull = record({ last_full_sync_at: null });
    const result = await shouldForceFullSync('site_1', {
      loadFn: async () => noFull,
    });
    assert.equal(result, true);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => shouldForceFullSync(null as never));
  });
});
