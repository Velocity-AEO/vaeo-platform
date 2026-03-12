/**
 * tools/rankings/rankings_service.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRankings, fetchRankingsForSite } from './rankings_service.ts';
import type { RankingsServiceConfig } from './rankings_service.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_CONFIG: RankingsServiceConfig = {
  site_id:               'site-1',
  domain:                'mystore.com',
  use_simulator_fallback: true,
};

function makeGSCFetch(rows: unknown[]): typeof globalThis.fetch {
  return async (_url: string, _opts: RequestInit): Promise<Response> => ({
    ok:   true,
    status: 200,
    json: async () => ({ rows }),
  } as unknown as Response);
}

function makeErrorFetch(): typeof globalThis.fetch {
  return async (): Promise<Response> => { throw new Error('network down'); };
}

function make401Fetch(): typeof globalThis.fetch {
  return async (): Promise<Response> => ({
    ok:     false,
    status: 401,
    json:   async () => ({ error: 'Unauthorized' }),
  } as unknown as Response);
}

const SAMPLE_ROWS = [
  { keys: ['summer dresses', 'https://mystore.com/collections/dresses'], clicks: 45, impressions: 1200, ctr: 0.037, position: 4.2 },
  { keys: ['beach bag',      'https://mystore.com/products/bag'],         clicks: 12, impressions: 340,  ctr: 0.035, position: 9.1 },
];

// ── fetchRankings ─────────────────────────────────────────────────────────────

describe('fetchRankings — no token', () => {
  it('returns simulated entries when no gsc_token', async () => {
    const results = await fetchRankings(BASE_CONFIG);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('all results have data_source=simulated when no token', async () => {
    const results = await fetchRankings(BASE_CONFIG);
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('returns [] when use_simulator_fallback=false and no token', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: undefined, use_simulator_fallback: false };
    const results = await fetchRankings(cfg);
    assert.deepEqual(results, []);
  });
});

describe('fetchRankings — gsc_live', () => {
  it('returns gsc_live entries when token present and GSC succeeds', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-123' };
    const results = await fetchRankings(cfg, { fetchFn: makeGSCFetch(SAMPLE_ROWS) });
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.data_source === 'gsc_live'));
  });

  it('returns correct keyword from GSC rows', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-123' };
    const results = await fetchRankings(cfg, { fetchFn: makeGSCFetch(SAMPLE_ROWS) });
    assert.ok(results.some(r => r.keyword === 'summer dresses'));
  });

  it('returns correct position rounded from GSC rows', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-123' };
    const results = await fetchRankings(cfg, { fetchFn: makeGSCFetch(SAMPLE_ROWS) });
    const r = results.find(r => r.keyword === 'summer dresses');
    assert.ok(r);
    assert.equal(r!.position, 4.2);
  });

  it('returns correct clicks and impressions from GSC', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-123' };
    const results = await fetchRankings(cfg, { fetchFn: makeGSCFetch(SAMPLE_ROWS) });
    const r = results.find(r => r.keyword === 'summer dresses');
    assert.equal(r!.clicks, 45);
    assert.equal(r!.impressions, 1200);
  });

  it('falls back to simulated when GSC fetch throws', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-bad', use_simulator_fallback: true };
    const results = await fetchRankings(cfg, { fetchFn: makeErrorFetch() });
    assert.ok(Array.isArray(results));
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('falls back to simulated on 401 response', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-bad', use_simulator_fallback: true };
    const results = await fetchRankings(cfg, { fetchFn: make401Fetch() });
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('returns [] on GSC error when use_simulator_fallback=false', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-bad', use_simulator_fallback: false };
    const results = await fetchRankings(cfg, { fetchFn: makeErrorFetch() });
    assert.deepEqual(results, []);
  });

  it('returns simulated when GSC returns empty rows', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-123', use_simulator_fallback: true };
    const results = await fetchRankings(cfg, { fetchFn: makeGSCFetch([]) });
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('returns [] when GSC returns empty rows and no fallback', async () => {
    const cfg: RankingsServiceConfig = { ...BASE_CONFIG, gsc_token: 'tok-123', use_simulator_fallback: false };
    const results = await fetchRankings(cfg, { fetchFn: makeGSCFetch([]) });
    assert.deepEqual(results, []);
  });
});

describe('fetchRankings — data_source field', () => {
  it('every result has data_source field', async () => {
    const results = await fetchRankings(BASE_CONFIG);
    assert.ok(results.every(r => r.data_source === 'gsc_live' || r.data_source === 'simulated'));
  });

  it('every result has fetched_at ISO string', async () => {
    const results = await fetchRankings(BASE_CONFIG);
    assert.ok(results.every(r => typeof r.fetched_at === 'string' && r.fetched_at.length > 10));
  });

  it('every result has keyword string', async () => {
    const results = await fetchRankings(BASE_CONFIG);
    assert.ok(results.every(r => typeof r.keyword === 'string'));
  });

  it('every result has position number', async () => {
    const results = await fetchRankings(BASE_CONFIG);
    assert.ok(results.every(r => typeof r.position === 'number'));
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() => fetchRankings(null as never));
  });

  it('returns [] not undefined on unrecoverable error', async () => {
    const result = await fetchRankings(null as never);
    assert.ok(Array.isArray(result));
  });
});

// ── fetchRankingsForSite ──────────────────────────────────────────────────────

describe('fetchRankingsForSite', () => {
  it('returns results for a valid site_id', async () => {
    const results = await fetchRankingsForSite('demo-store');
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns simulated results when no DB provided', async () => {
    const results = await fetchRankingsForSite('site-abc');
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('returns simulated results when DB has no token', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    const results = await fetchRankingsForSite('site-no-token', { db });
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('uses GSC when DB provides a token and GSC succeeds', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { access_token: 'live-tok' }, error: null }),
          }),
        }),
      }),
    };
    const fetchFn = makeGSCFetch(SAMPLE_ROWS);
    const results = await fetchRankingsForSite('site-with-token', { db, fetchFn });
    assert.ok(results.every(r => r.data_source === 'gsc_live'));
  });

  it('falls back to simulated when DB throws', async () => {
    const db = { from: () => { throw new Error('db down'); } };
    const results = await fetchRankingsForSite('site-1', { db });
    assert.ok(results.every(r => r.data_source === 'simulated'));
  });

  it('never throws on null site_id', async () => {
    await assert.doesNotReject(() => fetchRankingsForSite(null as never));
  });

  it('returns [] not undefined on null site_id', async () => {
    const result = await fetchRankingsForSite(null as never);
    assert.ok(Array.isArray(result));
  });
});
