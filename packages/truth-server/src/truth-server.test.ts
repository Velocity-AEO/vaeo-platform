/**
 * packages/truth-server/src/truth-server.test.ts
 *
 * Unit tests for saveSnapshot() and loadSnapshot().
 * All tests use injected Supabase clients — no real DB calls.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveSnapshot,
  loadSnapshot,
  _injectSupabase,
  _resetInjections,
} from './index.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Mock factories ────────────────────────────────────────────────────────────

/** Snapshot row returned by site_snapshots queries */
const FAKE_SNAP = {
  snapshot_id:  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  run_id:       'run-1',
  tenant_id:    'tenant-1',
  site_id:      'site-1',
  site_url:     'https://example.com',
  cms_type:     'shopify',
  urls_crawled: 3,
  created_at:   '2025-01-01T00:00:00.000Z',
};

/** Crawl result row returned by crawl_results queries */
const FAKE_ROW = {
  url:            'https://example.com/',
  status_code:    200,
  title:          'Home',
  meta_desc:      'Welcome',
  h1:             ['Welcome'],
  h2:             [],
  images:         [],
  internal_links: [],
  schema_blocks:  [],
  canonical:      'https://example.com/',
  redirect_chain: [],
  load_time_ms:   55,
};

/**
 * Builds a minimal Supabase mock.
 * - insertOk: true → insert succeeds; false → insert returns error
 * - snapRow:  row for site_snapshots single() query (null = not found)
 * - crawlRows: rows for crawl_results query
 */
function makeMock({
  insertOk   = true,
  insertThrows = false,
  snapRow    = FAKE_SNAP as Record<string, unknown> | null,
  crawlRows  = [FAKE_ROW] as Record<string, unknown>[],
  fromThrows = false,
}: {
  insertOk?:    boolean;
  insertThrows?: boolean;
  snapRow?:     Record<string, unknown> | null;
  crawlRows?:   Record<string, unknown>[];
  fromThrows?:  boolean;
} = {}): SupabaseClient {
  const insertFn = insertThrows
    ? () => { throw new Error('insert exploded'); }
    : () => Promise.resolve({
        data:  null,
        error: insertOk ? null : { message: 'DB write failed' },
      });

  const fromFn = fromThrows
    ? () => { throw new Error('from() exploded'); }
    : (table: string) => {
        if (table === 'site_snapshots') {
          return {
            insert: insertFn,
            select: (_cols: string) => ({
              eq: (_k: string, _v: unknown) => ({
                eq: (_k2: string, _v2: unknown) => ({
                  single: () => Promise.resolve(
                    snapRow
                      ? { data: snapRow, error: null }
                      : { data: null, error: { message: 'Row not found' } },
                  ),
                }),
              }),
            }),
          };
        }
        if (table === 'crawl_results') {
          return {
            select: (_cols: string) => ({
              eq: (_k: string, _v: unknown) => ({
                eq: (_k2: string, _v2: unknown) =>
                  Promise.resolve({ data: crawlRows, error: null }),
              }),
            }),
          };
        }
        return {};
      };

  return { from: fromFn } as unknown as SupabaseClient;
}

const BASE_SAVE: Parameters<typeof saveSnapshot>[0] = {
  run_id:        'run-1',
  tenant_id:     'tenant-1',
  site_id:       'site-1',
  site_url:      'https://example.com',
  cms_type:      'shopify',
  urls_crawled:  3,
  crawl_results: [],
};

const BASE_LOAD: Parameters<typeof loadSnapshot>[0] = {
  run_id:    'run-1',
  tenant_id: 'tenant-1',
};

// ── saveSnapshot tests ────────────────────────────────────────────────────────

describe('saveSnapshot', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with snapshot_id', async () => {
    _injectSupabase(makeMock({ insertOk: true }));

    const result = await saveSnapshot(BASE_SAVE);

    assert.equal(result.success, true);
    assert.ok(result.snapshot_id, 'snapshot_id must be set');
    assert.equal(result.run_id, BASE_SAVE.run_id);
    assert.equal(result.site_id, BASE_SAVE.site_id);
    assert.ok(result.saved_at);
    assert.equal(result.error, undefined);
  });

  it('returns success=false without throwing on Supabase error', async () => {
    _injectSupabase(makeMock({ insertOk: false }));

    let threw = false;
    let result: Awaited<ReturnType<typeof saveSnapshot>> | undefined;
    try {
      result = await saveSnapshot(BASE_SAVE);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'saveSnapshot must not throw');
    assert.ok(result);
    assert.equal(result.success, false);
    assert.ok(result.error, 'error message must be set');
  });

  it('snapshot_id is a valid UUID v4 format', async () => {
    _injectSupabase(makeMock({ insertOk: true }));

    const result = await saveSnapshot(BASE_SAVE);
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    assert.ok(UUID_V4.test(result.snapshot_id), `"${result.snapshot_id}" is not a valid UUID v4`);
  });

  it('never throws when insert throws synchronously', async () => {
    _injectSupabase(makeMock({ insertThrows: true }));

    let threw = false;
    try {
      await saveSnapshot(BASE_SAVE);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'saveSnapshot must never throw');
  });
});

// ── loadSnapshot tests ────────────────────────────────────────────────────────

describe('loadSnapshot', () => {
  afterEach(() => _resetInjections());

  it('returns found=true with crawl_results', async () => {
    _injectSupabase(makeMock({ snapRow: FAKE_SNAP, crawlRows: [FAKE_ROW] }));

    const result = await loadSnapshot(BASE_LOAD);

    assert.equal(result.found, true);
    assert.equal(result.run_id, BASE_LOAD.run_id);
    assert.equal(result.snapshot_id, FAKE_SNAP.snapshot_id);
    assert.equal(result.site_url, FAKE_SNAP.site_url);
    assert.equal(result.crawl_results.length, 1);
    assert.equal(result.crawl_results[0]?.url, FAKE_ROW.url);
  });

  it('returns found=false when snapshot row does not exist', async () => {
    _injectSupabase(makeMock({ snapRow: null, crawlRows: [] }));

    const result = await loadSnapshot({ run_id: 'missing-run', tenant_id: 'tenant-1' });

    assert.equal(result.found, false);
    assert.deepEqual(result.crawl_results, []);
    assert.equal(result.snapshot_id, null);
  });

  it('returns found=false without throwing on Supabase error', async () => {
    _injectSupabase(makeMock({ fromThrows: true }));

    let threw = false;
    let result: Awaited<ReturnType<typeof loadSnapshot>> | undefined;
    try {
      result = await loadSnapshot(BASE_LOAD);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'loadSnapshot must not throw');
    assert.ok(result);
    assert.equal(result.found, false);
    assert.ok(result.error, 'error message must be set');
  });

  it('never throws when Supabase is unavailable (null)', async () => {
    _injectSupabase(null);

    let threw = false;
    try {
      await loadSnapshot(BASE_LOAD);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'loadSnapshot must never throw');
  });
});
