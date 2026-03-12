/**
 * tools/jobs/job_queue.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueJob,
  claimNextJob,
  completeJob,
  failJob,
  cancelJob,
  getJobStatus,
  getPendingJobs,
  type Job,
  type JobType,
} from './job_queue.ts';

// ── Mock DB ───────────────────────────────────────────────────────────────────

interface InsertCall { row: Record<string, unknown> }
interface UpdateCall { id: unknown; updates: Record<string, unknown> }

function makeDb(
  storedJobs:  Job[]        = [],
  insertCalls: InsertCall[] = [],
  updateCalls: UpdateCall[] = [],
  dbError:     string | null = null,
) {
  const jobs = [...storedJobs];
  const newId = crypto.randomUUID();

  return {
    from(_table: 'jobs') {
      return {
        insert(row: Record<string, unknown>) {
          insertCalls.push({ row });
          return {
            select(_col: string) {
              return {
                maybeSingle: async () => ({
                  data:  dbError ? null : { id: newId },
                  error: dbError ? { message: dbError } : null,
                }),
              };
            },
          };
        },
        select(_cols: string) {
          // Build a chainable query
          let filtered = [...jobs];
          const builder: any = {
            eq(col: string, val: unknown) {
              filtered = filtered.filter((j) => (j as any)[col] === val);
              return builder;
            },
            in(col: string, vals: unknown[]) {
              filtered = filtered.filter((j) => vals.includes((j as any)[col]));
              return builder;
            },
            lte(col: string, val: string) {
              filtered = filtered.filter((j) => (j as any)[col] <= val);
              return builder;
            },
            lt(col: string, val: string) {
              filtered = filtered.filter((j) => (j as any)[col] < val);
              return builder;
            },
            or(_filter: string) { return builder; },
            order(_col: string, _opts: object) { return builder; },
            limit(n: number) { filtered = filtered.slice(0, n); return builder; },
            then<T>(onfulfilled?: (v: { data: Job[] | null; error: null }) => T): Promise<T> {
              return Promise.resolve({ data: dbError ? null : filtered, error: dbError ? { message: dbError } : null } as any).then(onfulfilled as any);
            },
          };
          return builder;
        },
        update(updates: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              updateCalls.push({ id: val, updates });
              // Apply in memory
              jobs.forEach((j) => { if ((j as any)[col] === val) Object.assign(j, updates); });
              return Promise.resolve({ error: dbError ? { message: dbError } : null });
            },
          };
        },
      };
    },
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id:           crypto.randomUUID(),
    site_id:      'site-1',
    job_type:     'crawl_site',
    status:       'pending',
    payload:      {},
    priority:     5,
    attempts:     0,
    max_attempts: 3,
    scheduled_at: new Date(Date.now() - 1000).toISOString(),
    created_at:   new Date().toISOString(),
    ...overrides,
  };
}

// ── enqueueJob ────────────────────────────────────────────────────────────────

describe('enqueueJob', () => {
  it('returns ok=true and job_id on success', async () => {
    const db = makeDb();
    const r  = await enqueueJob({ site_id: 's1', job_type: 'crawl_site' }, db);
    assert.equal(r.ok, true);
    assert.ok(typeof r.job_id === 'string');
  });

  it('uses default priority=5 and max_attempts=3', async () => {
    const inserts: InsertCall[] = [];
    const db = makeDb([], inserts);
    await enqueueJob({ site_id: 's1', job_type: 'triage_site' }, db);
    assert.equal(inserts[0].row['priority'], 5);
    assert.equal(inserts[0].row['max_attempts'], 3);
  });

  it('uses default scheduled_at of now', async () => {
    const inserts: InsertCall[] = [];
    const db = makeDb([], inserts);
    const before = Date.now();
    await enqueueJob({ site_id: 's1', job_type: 'gsc_sync' }, db);
    const after = Date.now();
    const t = Date.parse(inserts[0].row['scheduled_at'] as string);
    assert.ok(t >= before && t <= after);
  });

  it('accepts custom payload, priority, and scheduled_at', async () => {
    const inserts: InsertCall[] = [];
    const db = makeDb([], inserts);
    const sat = '2030-01-01T00:00:00.000Z';
    await enqueueJob({ site_id: 's1', job_type: 'apply_fixes', payload: { key: 'val' }, priority: 9, scheduled_at: sat }, db);
    assert.equal(inserts[0].row['priority'], 9);
    assert.deepEqual(inserts[0].row['payload'], { key: 'val' });
    assert.equal(inserts[0].row['scheduled_at'], sat);
  });

  it('returns ok=false on DB error', async () => {
    const db = makeDb([], [], [], 'DB down');
    const r  = await enqueueJob({ site_id: 's1', job_type: 'crawl_site' }, db);
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === 'string');
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => enqueueJob({ site_id: 's1', job_type: 'crawl_site' }, null));
  });
});

// ── claimNextJob ──────────────────────────────────────────────────────────────

describe('claimNextJob', () => {
  it('returns null when no pending jobs', async () => {
    const db = makeDb([]);
    const r  = await claimNextJob(['crawl_site'], db);
    assert.equal(r, null);
  });

  it('returns a job and marks it running', async () => {
    const j  = job();
    const updates: UpdateCall[] = [];
    const db = makeDb([j], [], updates);
    const r  = await claimNextJob(['crawl_site'], db);
    assert.ok(r !== null);
    assert.equal(r.status, 'running');
    assert.ok(updates.some((u) => u.updates['status'] === 'running'));
  });

  it('increments attempts', async () => {
    const j  = job({ attempts: 1 });
    const updates: UpdateCall[] = [];
    const db = makeDb([j], [], updates);
    const r  = await claimNextJob(['crawl_site'], db);
    assert.equal(r?.attempts, 2);
  });

  it('returns null when attempts >= max_attempts', async () => {
    const j  = job({ attempts: 3, max_attempts: 3 });
    const db = makeDb([j]);
    const r  = await claimNextJob(['crawl_site'], db);
    assert.equal(r, null);
  });

  it('returns null on DB error', async () => {
    const db = makeDb([], [], [], 'fail');
    const r  = await claimNextJob(['crawl_site'], db);
    assert.equal(r, null);
  });
});

// ── completeJob / cancelJob ───────────────────────────────────────────────────

describe('completeJob', () => {
  it('sets status=done', async () => {
    const updates: UpdateCall[] = [];
    const db = makeDb([], [], updates);
    await completeJob('job-1', db);
    assert.equal(updates[0].updates['status'], 'done');
    assert.ok(updates[0].updates['completed_at']);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => completeJob('j', null));
  });
});

describe('cancelJob', () => {
  it('sets status=cancelled', async () => {
    const updates: UpdateCall[] = [];
    const db = makeDb([], [], updates);
    await cancelJob('job-1', db);
    assert.equal(updates[0].updates['status'], 'cancelled');
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => cancelJob('j', null));
  });
});

// ── failJob ───────────────────────────────────────────────────────────────────

describe('failJob', () => {
  it('sets status=failed when attempts >= max_attempts', async () => {
    const j  = job({ attempts: 3, max_attempts: 3 });
    const updates: UpdateCall[] = [];
    const db = makeDb([j], [], updates);
    await failJob(j.id, 'timeout', db);
    const u = updates.find((u) => u.updates['status'] === 'failed');
    assert.ok(u);
  });

  it('resets to pending for retry when attempts < max_attempts', async () => {
    const j  = job({ attempts: 1, max_attempts: 3 });
    const updates: UpdateCall[] = [];
    const db = makeDb([j], [], updates);
    await failJob(j.id, 'flake', db);
    const u = updates.find((u) => u.updates['status'] === 'pending');
    assert.ok(u);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => failJob('j', 'err', null));
  });
});

// ── getJobStatus / getPendingJobs ─────────────────────────────────────────────

describe('getJobStatus', () => {
  it('returns job by id', async () => {
    const j  = job({ id: 'known-id' });
    const db = makeDb([j]);
    const r  = await getJobStatus('known-id', db);
    assert.ok(r !== null);
    assert.equal(r.id, 'known-id');
  });

  it('returns null when not found', async () => {
    const db = makeDb([]);
    const r  = await getJobStatus('nope', db);
    assert.equal(r, null);
  });

  it('never throws on error', async () => {
    await assert.doesNotReject(() => getJobStatus('x', null));
  });
});

describe('getPendingJobs', () => {
  it('returns pending and running jobs for site', async () => {
    const jobs = [
      job({ status: 'pending' }),
      job({ status: 'running' }),
      job({ status: 'done' }),
    ];
    const db = makeDb(jobs);
    const r  = await getPendingJobs('site-1', db);
    assert.ok(r.every((j) => j.status === 'pending' || j.status === 'running'));
  });

  it('returns empty array on error', async () => {
    const r = await getPendingJobs('site-1', null);
    assert.deepEqual(r, []);
  });
});
