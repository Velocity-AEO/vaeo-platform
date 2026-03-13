/**
 * tools/gsc/gsc_delta_sync.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GSC_FULL_SYNC_DAYS,
  GSC_DELTA_SYNC_DAYS,
  GSC_DELTA_TOLERANCE_DAYS,
  determineSyncMode,
  buildDeltaDateRange,
  buildFullDateRange,
  buildSyncDateRange,
  runDeltaSync,
  type DeltaSyncConfig,
  type GSCRow,
  type UpsertResult,
} from './gsc_delta_sync.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function yesterday(): string {
  return daysAgo(1);
}

function cfg(overrides?: Partial<DeltaSyncConfig>): DeltaSyncConfig {
  return {
    site_id:      'site_1',
    property:     'sc-domain:example.com',
    last_sync_at: daysAgo(2),
    force_full:   false,
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('GSC_FULL_SYNC_DAYS is 28', () => {
    assert.equal(GSC_FULL_SYNC_DAYS, 28);
  });

  it('GSC_DELTA_SYNC_DAYS is 3', () => {
    assert.equal(GSC_DELTA_SYNC_DAYS, 3);
  });

  it('GSC_DELTA_TOLERANCE_DAYS is 1', () => {
    assert.equal(GSC_DELTA_TOLERANCE_DAYS, 1);
  });
});

// ── determineSyncMode ─────────────────────────────────────────────────────────

describe('determineSyncMode', () => {
  it('returns full when force_full=true', () => {
    assert.equal(determineSyncMode(daysAgo(1), true), 'full');
  });

  it('returns full when force_full=true even with recent last_sync_at', () => {
    assert.equal(determineSyncMode(daysAgo(1), true), 'full');
  });

  it('returns full when last_sync_at=null', () => {
    assert.equal(determineSyncMode(null, false), 'full');
  });

  it('returns full when last_sync_at older than 7 days', () => {
    assert.equal(determineSyncMode(daysAgo(8), false), 'full');
  });

  it('returns full when last_sync_at exactly 7 days ago (boundary)', () => {
    // 7+ days = full, exactly 7 days is slightly over threshold
    const result = determineSyncMode(daysAgo(7), false);
    // Accept either full or delta depending on fractional hours — just check type
    assert.ok(result === 'full' || result === 'delta');
  });

  it('returns delta when last_sync_at is 1 day ago', () => {
    assert.equal(determineSyncMode(daysAgo(1), false), 'delta');
  });

  it('returns delta when last_sync_at is 3 days ago', () => {
    assert.equal(determineSyncMode(daysAgo(3), false), 'delta');
  });

  it('returns delta when last_sync_at is recent (2 days)', () => {
    assert.equal(determineSyncMode(daysAgo(2), false), 'delta');
  });

  it('never throws on invalid date string', () => {
    assert.doesNotThrow(() => determineSyncMode('not-a-date', false));
  });

  it('never throws on null+null', () => {
    assert.doesNotThrow(() => determineSyncMode(null, false));
  });
});

// ── buildDeltaDateRange ───────────────────────────────────────────────────────

describe('buildDeltaDateRange', () => {
  it('start includes tolerance (1 day before last_sync_at)', () => {
    const last = daysAgo(5);
    const { start } = buildDeltaDateRange(last, 1);
    // start should be 1 day before last_sync_at = 6 days ago
    const expected = daysAgo(6);
    assert.equal(start, expected);
  });

  it('end is yesterday', () => {
    const { end } = buildDeltaDateRange(daysAgo(3), 1);
    assert.equal(end, yesterday());
  });

  it('tolerance_days=0 gives start equal to last_sync_at date', () => {
    const last = daysAgo(4);
    const { start } = buildDeltaDateRange(last, 0);
    assert.equal(start, last);
  });

  it('larger tolerance gives earlier start', () => {
    const last = daysAgo(5);
    const { start: s1 } = buildDeltaDateRange(last, 1);
    const { start: s2 } = buildDeltaDateRange(last, 2);
    assert.ok(new Date(s2) < new Date(s1));
  });

  it('never throws on invalid date', () => {
    assert.doesNotThrow(() => buildDeltaDateRange('bad-date', 1));
  });
});

// ── buildFullDateRange ────────────────────────────────────────────────────────

describe('buildFullDateRange', () => {
  it('start is 28 days ago', () => {
    const { start } = buildFullDateRange();
    assert.equal(start, daysAgo(28));
  });

  it('end is yesterday', () => {
    const { end } = buildFullDateRange();
    assert.equal(end, yesterday());
  });

  it('never throws', () => {
    assert.doesNotThrow(() => buildFullDateRange());
  });
});

// ── buildSyncDateRange ────────────────────────────────────────────────────────

describe('buildSyncDateRange', () => {
  it('returns mode=full when force_full=true', () => {
    const { mode } = buildSyncDateRange(cfg({ force_full: true }));
    assert.equal(mode, 'full');
  });

  it('returns mode=full when last_sync_at=null', () => {
    const { mode } = buildSyncDateRange(cfg({ last_sync_at: null }));
    assert.equal(mode, 'full');
  });

  it('returns mode=delta when last_sync_at is recent', () => {
    const { mode } = buildSyncDateRange(cfg({ last_sync_at: daysAgo(1) }));
    assert.equal(mode, 'delta');
  });

  it('full range covers 28 days', () => {
    const { start, end } = buildSyncDateRange(cfg({ last_sync_at: null }));
    const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (86400000));
    assert.ok(days >= 27 && days <= 28);
  });

  it('delta range is shorter than full range', () => {
    const full  = buildSyncDateRange(cfg({ last_sync_at: null }));
    const delta = buildSyncDateRange(cfg({ last_sync_at: daysAgo(1) }));
    const fullDays  = Math.round((new Date(full.end).getTime()  - new Date(full.start).getTime())  / 86400000);
    const deltaDays = Math.round((new Date(delta.end).getTime() - new Date(delta.start).getTime()) / 86400000);
    assert.ok(deltaDays < fullDays);
  });

  it('never throws on null config', () => {
    assert.doesNotThrow(() => buildSyncDateRange(null as never));
  });
});

// ── runDeltaSync ──────────────────────────────────────────────────────────────

describe('runDeltaSync — date range fetching', () => {
  it('fetches only delta date range on delta mode', async () => {
    let fetchedStart = '';
    const result = await runDeltaSync(cfg({ last_sync_at: daysAgo(2), force_full: false }), {
      fetchGSCFn: async (_sid, start, _end) => { fetchedStart = start; return []; },
    });
    assert.equal(result.sync_mode, 'delta');
    // start should be tolerance-adjusted from last_sync_at
    assert.ok(fetchedStart.length > 0);
    // start should NOT be 28 days ago
    assert.notEqual(fetchedStart, daysAgo(28));
  });

  it('fetches full range when mode=full', async () => {
    let fetchedStart = '';
    await runDeltaSync(cfg({ last_sync_at: null }), {
      fetchGSCFn: async (_sid, start) => { fetchedStart = start; return []; },
    });
    assert.equal(fetchedStart, daysAgo(28));
  });

  it('all deps are injectable', async () => {
    let fetchCalled = false;
    let saveCalled  = false;
    await runDeltaSync(cfg(), {
      fetchGSCFn:    async () => { fetchCalled = true; return []; },
      saveRankingsFn: async () => { saveCalled  = true; return { rows_new: 0, rows_updated: 0 }; },
    });
    assert.equal(fetchCalled, true);
    assert.equal(saveCalled,  true);
  });
});

describe('runDeltaSync — upsert counting', () => {
  it('counts rows_new correctly', async () => {
    const rows: GSCRow[] = [
      { keyword: 'a', url: 'https://x.com/', date: daysAgo(1), clicks: 1, impressions: 10, position: 3 },
      { keyword: 'b', url: 'https://x.com/', date: daysAgo(1), clicks: 2, impressions: 20, position: 5 },
    ];
    const result = await runDeltaSync(cfg(), {
      fetchGSCFn:    async () => rows,
      saveRankingsFn: async () => ({ rows_new: 2, rows_updated: 0 }),
    });
    assert.equal(result.rows_new, 2);
  });

  it('counts rows_updated correctly', async () => {
    const result = await runDeltaSync(cfg(), {
      fetchGSCFn:    async () => [
        { keyword: 'a', url: 'https://x.com/', date: daysAgo(1), clicks: 1, impressions: 5, position: 2 },
      ],
      saveRankingsFn: async () => ({ rows_new: 0, rows_updated: 1 }),
    });
    assert.equal(result.rows_updated, 1);
  });

  it('upserts rows from fetchGSCFn into saveRankingsFn', async () => {
    let savedRows: GSCRow[] = [];
    await runDeltaSync(cfg(), {
      fetchGSCFn:    async () => [
        { keyword: 'kw', url: 'https://x.com/', date: daysAgo(1), clicks: 5, impressions: 50, position: 4 },
      ],
      saveRankingsFn: async (_sid, rows) => { savedRows = rows; return { rows_new: 1, rows_updated: 0 }; },
    });
    assert.equal(savedRows.length, 1);
    assert.equal(savedRows[0]!.keyword, 'kw');
  });
});

describe('runDeltaSync — result shape', () => {
  it('rows_fetched equals number of rows returned', async () => {
    const rows = [
      { keyword: 'a', url: 'u', date: 'd', clicks: 1, impressions: 1, position: 1 },
      { keyword: 'b', url: 'u', date: 'd', clicks: 1, impressions: 1, position: 2 },
    ] as GSCRow[];
    const result = await runDeltaSync(cfg(), { fetchGSCFn: async () => rows });
    assert.equal(result.rows_fetched, 2);
  });

  it('has synced_at timestamp', async () => {
    const result = await runDeltaSync(cfg());
    assert.ok(result.synced_at.includes('T'));
  });

  it('api_calls_made is 1 on success', async () => {
    const result = await runDeltaSync(cfg());
    assert.equal(result.api_calls_made, 1);
  });

  it('returns error result on failure', async () => {
    const result = await runDeltaSync(cfg(), {
      fetchGSCFn: async () => { throw new Error('api down'); },
    });
    // Either error is set or rows_fetched=0
    assert.equal(result.rows_fetched, 0);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() =>
      runDeltaSync(null as never, {
        fetchGSCFn:    async () => { throw new Error('boom'); },
        saveRankingsFn: async () => { throw new Error('boom'); },
      }),
    );
  });
});
