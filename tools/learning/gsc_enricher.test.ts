/**
 * tools/learning/gsc_enricher.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichLearningWithGSC,
  batchEnrichGSC,
  type GSCClient,
  type GSCMetrics,
  type EnrichDb,
} from './gsc_enricher.ts';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMetrics(url: string): GSCMetrics {
  return { url, impressions: 1000, clicks: 50, position: 3.2, ctr: 0.05, fetched_at: new Date().toISOString() };
}

function makeGSC(metrics: GSCMetrics | null = null): GSCClient {
  return { getMetrics: async () => metrics };
}

interface UpdateCall { id: string; updates: Record<string, unknown> }

function makeDb(
  rows: Array<{ id: string; url: string }> = [],
  updateCalls: UpdateCall[] = [],
  dbError: string | null = null,
): EnrichDb {
  return {
    from(_table: 'learnings') {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                is(_col2: string, _val2: null) {
                  return Promise.resolve({
                    data:  dbError ? null : rows,
                    error: dbError ? { message: dbError } : null,
                  });
                },
              };
            },
          };
        },
        update(updates: Record<string, unknown>) {
          return {
            eq(col: string, val: string) {
              if (col === 'id') updateCalls.push({ id: val, updates });
              return Promise.resolve({ error: dbError ? { message: dbError } : null });
            },
          };
        },
      };
    },
  };
}

// ── enrichLearningWithGSC ─────────────────────────────────────────────────────

describe('enrichLearningWithGSC', () => {
  it('writes GSC metrics to the learnings row', async () => {
    const metrics = makeMetrics('https://shop.com/products/hat');
    const updates: UpdateCall[] = [];
    const db = makeDb([], updates);
    await enrichLearningWithGSC('id-1', 'https://shop.com/products/hat', makeGSC(metrics), db);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 'id-1');
    assert.deepEqual(updates[0].updates['gsc_data'], metrics);
  });

  it('does not call DB when GSC returns null', async () => {
    const updates: UpdateCall[] = [];
    const db = makeDb([], updates);
    await enrichLearningWithGSC('id-1', 'https://shop.com/products/hat', makeGSC(null), db);
    assert.equal(updates.length, 0, 'no DB write when GSC returns null');
  });

  it('never throws on GSC error', async () => {
    const gsc: GSCClient = { getMetrics: async () => { throw new Error('GSC down'); } };
    const db = makeDb();
    await assert.doesNotReject(async () => {
      await enrichLearningWithGSC('id-1', 'https://shop.com/', gsc, db);
    });
  });

  it('never throws on DB error', async () => {
    const metrics = makeMetrics('https://shop.com/');
    const db = makeDb([], [], 'DB write failed');
    await assert.doesNotReject(async () => {
      await enrichLearningWithGSC('id-1', 'https://shop.com/', makeGSC(metrics), db);
    });
  });

  it('writes correct fields (impressions, clicks, position, ctr)', async () => {
    const metrics = makeMetrics('https://shop.com/products/hat');
    const updates: UpdateCall[] = [];
    const db = makeDb([], updates);
    await enrichLearningWithGSC('id-1', 'https://shop.com/products/hat', makeGSC(metrics), db);
    const gscData = updates[0].updates['gsc_data'] as GSCMetrics;
    assert.equal(gscData.impressions, 1000);
    assert.equal(gscData.clicks, 50);
    assert.ok(gscData.ctr > 0);
    assert.ok(gscData.fetched_at.length > 0);
  });
});

// ── batchEnrichGSC ────────────────────────────────────────────────────────────

describe('batchEnrichGSC', () => {
  it('enriches all rows where gsc_data is null', async () => {
    const rows = [
      { id: 'a', url: 'https://shop.com/products/hat' },
      { id: 'b', url: 'https://shop.com/products/bag' },
    ];
    const updates: UpdateCall[] = [];
    const db = makeDb(rows, updates);
    const gsc: GSCClient = { getMetrics: async (url) => makeMetrics(url) };
    const result = await batchEnrichGSC('site-1', gsc, db);
    assert.equal(result.enriched, 2);
    assert.equal(result.failed, 0);
    assert.equal(updates.length, 2);
  });

  it('returns { enriched: 0, failed: 0 } when no rows', async () => {
    const db = makeDb([]);
    const result = await batchEnrichGSC('site-1', makeGSC(null), db);
    assert.equal(result.enriched, 0);
    assert.equal(result.failed, 0);
  });

  it('never throws on DB query error', async () => {
    const db = makeDb([], [], 'query failed');
    await assert.doesNotReject(async () => {
      await batchEnrichGSC('site-1', makeGSC(null), db);
    });
  });

  it('returns { enriched: 0, failed: 0 } on DB query error', async () => {
    const db = makeDb([], [], 'query failed');
    const result = await batchEnrichGSC('site-1', makeGSC(null), db);
    assert.equal(result.enriched, 0);
    assert.equal(result.failed, 0);
  });
});
