/**
 * tools/jobs/scheduler.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduleSiteCrawl,
  scheduleAllSites,
  getScheduleStatus,
} from './scheduler.ts';

// ── Mock DB ───────────────────────────────────────────────────────────────────

interface JobRow { id: string; site_id: string; status: string; scheduled_at: string; created_at: string; completed_at?: string }
interface SiteRow { site_id: string; site_url: string }

function makeDb(
  jobs:        JobRow[]  = [],
  sites:       SiteRow[] = [],
  siteError:   string | null = null,
  insertError: string | null = null,
) {
  const newId = crypto.randomUUID();

  return {
    from(table: string) {
      if (table === 'sites') {
        return {
          select(_cols: string) {
            let filtered = [...sites];
            const builder: any = {
              eq(col: string, val: unknown) { filtered = filtered.filter((s) => (s as any)[col] === val); return builder; },
              in(col: string, vals: unknown[]) { filtered = filtered.filter((s) => vals.includes((s as any)[col])); return builder; },
              order(_c: string, _o: object) { return builder; },
              limit(n: number) { filtered = filtered.slice(0, n); return builder; },
              then<T>(fn?: (v: { data: SiteRow[] | null; error: null }) => T): Promise<T> {
                return Promise.resolve({ data: siteError ? null : filtered, error: siteError ? { message: siteError } : null } as any).then(fn as any);
              },
            };
            return builder;
          },
        };
      }

      // jobs table
      const jobsCopy = [...jobs];
      return {
        insert(row: Record<string, unknown>) {
          if (!insertError) jobsCopy.push(row as any);
          return {
            select(_col: string) {
              return {
                maybeSingle: async () => ({
                  data:  insertError ? null : { id: newId },
                  error: insertError ? { message: insertError } : null,
                }),
              };
            },
          };
        },
        select(_cols: string) {
          let filtered = [...jobsCopy];
          const builder: any = {
            eq(col: string, val: unknown) { filtered = filtered.filter((j) => (j as any)[col] === val); return builder; },
            in(col: string, vals: unknown[]) { filtered = filtered.filter((j) => vals.includes((j as any)[col])); return builder; },
            order(_c: string, _o: object) { return builder; },
            limit(n: number) { filtered = filtered.slice(0, n); return builder; },
            then<T>(fn?: (v: { data: JobRow[] | null; error: null }) => T): Promise<T> {
              return Promise.resolve({ data: filtered, error: null } as any).then(fn as any);
            },
          };
          return builder;
        },
      };
    },
  };
}

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id:           crypto.randomUUID(),
    site_id:      'site-1',
    status:       'pending',
    scheduled_at: new Date().toISOString(),
    created_at:   new Date().toISOString(),
    ...overrides,
  };
}

// ── scheduleSiteCrawl ─────────────────────────────────────────────────────────

describe('scheduleSiteCrawl', () => {
  it('returns ok=true and job_id on success', async () => {
    const db = makeDb();
    const r  = await scheduleSiteCrawl('site-1', 'https://example.com', db);
    assert.equal(r.ok, true);
    assert.ok(typeof r.job_id === 'string');
    assert.equal(r.site_id, 'site-1');
  });

  it('includes site_url in job payload', async () => {
    const db = makeDb();
    const r  = await scheduleSiteCrawl('site-1', 'https://example.com', db);
    assert.equal(r.ok, true);
  });

  it('accepts custom scheduled_at', async () => {
    const db  = makeDb();
    const sat = '2030-06-01T00:00:00.000Z';
    const r   = await scheduleSiteCrawl('site-1', 'https://example.com', db, { scheduled_at: sat });
    assert.equal(r.ok, true);
  });

  it('accepts custom priority', async () => {
    const db = makeDb();
    const r  = await scheduleSiteCrawl('site-1', 'https://example.com', db, { priority: 9 });
    assert.equal(r.ok, true);
  });

  it('merges extra payload fields', async () => {
    const db = makeDb();
    const r  = await scheduleSiteCrawl('site-1', 'https://example.com', db, { payload: { max_urls: 200 } });
    assert.equal(r.ok, true);
  });

  it('returns ok=false on DB error', async () => {
    const db = makeDb([], [], null, 'DB down');
    const r  = await scheduleSiteCrawl('site-1', 'https://example.com', db);
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === 'string');
  });

  it('never throws when db is null', async () => {
    await assert.doesNotReject(() => scheduleSiteCrawl('s', 'http://x.com', null));
  });
});

// ── scheduleAllSites ──────────────────────────────────────────────────────────

describe('scheduleAllSites', () => {
  it('schedules a job for each site', async () => {
    const sites = [
      { site_id: 'site-1', site_url: 'https://a.com' },
      { site_id: 'site-2', site_url: 'https://b.com' },
    ];
    const db = makeDb([], sites);
    const r  = await scheduleAllSites(db);
    assert.equal(r.total, 2);
    assert.equal(r.scheduled, 2);
    assert.equal(r.failed, 0);
  });

  it('returns total=0 on DB error fetching sites', async () => {
    const db = makeDb([], [], 'conn fail');
    const r  = await scheduleAllSites(db);
    assert.equal(r.total, 0);
    assert.equal(r.scheduled, 0);
  });

  it('counts failed sites when enqueue fails', async () => {
    const sites = [{ site_id: 'site-1', site_url: 'https://a.com' }];
    // sites select succeeds; jobs insert errors
    const db = makeDb([], sites, null, 'insert fail');
    const r  = await scheduleAllSites(db);
    assert.equal(r.total, 1);
    assert.equal(r.failed, 1);
    assert.equal(r.scheduled, 0);
  });

  it('returns results array with one entry per site', async () => {
    const sites = [
      { site_id: 'site-1', site_url: 'https://a.com' },
      { site_id: 'site-2', site_url: 'https://b.com' },
      { site_id: 'site-3', site_url: 'https://c.com' },
    ];
    const db = makeDb([], sites);
    const r  = await scheduleAllSites(db);
    assert.equal(r.results.length, 3);
    assert.ok(r.results.every((x) => x.ok));
  });

  it('returns empty results for empty sites table', async () => {
    const db = makeDb([], []);
    const r  = await scheduleAllSites(db);
    assert.equal(r.total, 0);
    assert.deepEqual(r.results, []);
  });

  it('never throws when db is null', async () => {
    await assert.doesNotReject(() => scheduleAllSites(null));
  });
});

// ── getScheduleStatus ─────────────────────────────────────────────────────────

describe('getScheduleStatus', () => {
  it('returns has_pending=true when pending job exists', async () => {
    const j  = jobRow({ status: 'pending' });
    const db = makeDb([j]);
    const r  = await getScheduleStatus('site-1', db);
    assert.equal(r.has_pending, true);
    assert.ok(r.next_run_at);
  });

  it('returns has_pending=false when no pending jobs', async () => {
    const db = makeDb([]);
    const r  = await getScheduleStatus('site-1', db);
    assert.equal(r.has_pending, false);
    assert.equal(r.next_run_at, undefined);
  });

  it('populates last_run_at from most recent done job', async () => {
    const j  = jobRow({ status: 'done', completed_at: '2025-01-01T00:00:00.000Z' });
    const db = makeDb([j]);
    const r  = await getScheduleStatus('site-1', db);
    assert.equal(r.last_run_at, '2025-01-01T00:00:00.000Z');
    assert.equal(r.last_status, 'done');
  });

  it('populates last_run_at from created_at when completed_at is absent', async () => {
    const j  = jobRow({ status: 'failed' });
    const db = makeDb([j]);
    const r  = await getScheduleStatus('site-1', db);
    assert.ok(r.last_run_at);
    assert.equal(r.last_status, 'failed');
  });

  it('returns base status on DB error', async () => {
    const db = makeDb([], [], 'db fail');
    const r  = await getScheduleStatus('site-1', db);
    assert.equal(r.site_id, 'site-1');
    assert.equal(r.has_pending, false);
  });

  it('never throws when db is null', async () => {
    await assert.doesNotReject(() => getScheduleStatus('s', null));
  });
});
