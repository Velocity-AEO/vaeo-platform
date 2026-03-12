/**
 * tools/jobs/job_orchestrator.test.ts
 *
 * Tests for multi-site job orchestration, queue status, and cancellation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  orchestrateJobs,
  getQueueStatus,
  cancelQueuedJobs,
  type OrchestratorJob,
  type OrchestratorDb,
  type JobRunResult,
} from './job_orchestrator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(): OrchestratorDb & { jobs: OrchestratorJob[] } {
  const jobs: OrchestratorJob[] = [];
  return {
    jobs,
    insertJob: async (job) => { jobs.push({ ...job }); },
    updateJob: async (job_id, updates) => {
      const j = jobs.find((x) => x.job_id === job_id);
      if (j) Object.assign(j, updates);
    },
    getJobs: async (tenant_id) => jobs.filter((j) => j.tenant_id === tenant_id),
    cancelQueued: async (tenant_id) => {
      let count = 0;
      for (const j of jobs) {
        if (j.tenant_id === tenant_id && j.status === 'queued') {
          j.status = 'failed';
          j.error = 'cancelled by user';
          count++;
        }
      }
      return count;
    },
  };
}

const successRunner = async (): Promise<JobRunResult> => ({
  success: true, pages_crawled: 10, issues_found: 3,
});

const failRunner = async (): Promise<JobRunResult> => ({
  success: false, error: 'crawl failed',
});

// ── orchestrateJobs — basic ─────────────────────────────────────────────────

describe('orchestrateJobs — basic', () => {
  it('returns zero counts for empty site_ids', async () => {
    const db = makeDb();
    const result = await orchestrateJobs('t-1', [], 'normal', db);
    assert.equal(result.total_jobs, 0);
    assert.equal(result.completed, 0);
    assert.equal(result.failed, 0);
  });

  it('creates a job for each site_id', async () => {
    const db = makeDb();
    await orchestrateJobs('t-1', ['s1', 's2', 's3'], 'normal', db);
    assert.equal(db.jobs.length, 3);
  });

  it('returns correct total_jobs count', async () => {
    const db = makeDb();
    const result = await orchestrateJobs('t-1', ['s1', 's2'], 'normal', db);
    assert.equal(result.total_jobs, 2);
  });

  it('records duration_ms > 0', async () => {
    const db = makeDb();
    const result = await orchestrateJobs('t-1', ['s1'], 'normal', db);
    assert.ok(result.duration_ms >= 0);
  });

  it('marks all jobs as done on success', async () => {
    const db = makeDb();
    await orchestrateJobs('t-1', ['s1', 's2'], 'normal', db, { runJob: successRunner });
    assert.ok(db.jobs.every((j) => j.status === 'done'));
  });

  it('records pages_crawled and issues_found', async () => {
    const db = makeDb();
    await orchestrateJobs('t-1', ['s1'], 'normal', db, { runJob: successRunner });
    assert.equal(db.jobs[0]!.pages_crawled, 10);
    assert.equal(db.jobs[0]!.issues_found, 3);
  });
});

// ── orchestrateJobs — failures ──────────────────────────────────────────────

describe('orchestrateJobs — failures', () => {
  it('counts failed jobs', async () => {
    const db = makeDb();
    const result = await orchestrateJobs('t-1', ['s1', 's2'], 'normal', db, { runJob: failRunner });
    assert.equal(result.failed, 2);
    assert.equal(result.completed, 0);
  });

  it('marks failed jobs with error message', async () => {
    const db = makeDb();
    await orchestrateJobs('t-1', ['s1'], 'normal', db, { runJob: failRunner });
    assert.equal(db.jobs[0]!.status, 'failed');
    assert.equal(db.jobs[0]!.error, 'crawl failed');
  });

  it('handles thrown errors in runJob', async () => {
    const db = makeDb();
    const throwRunner = async () => { throw new Error('boom'); };
    const result = await orchestrateJobs('t-1', ['s1'], 'normal', db, { runJob: throwRunner });
    assert.equal(result.failed, 1);
    assert.equal(db.jobs[0]!.error, 'boom');
  });

  it('handles mixed success and failure', async () => {
    const db = makeDb();
    let callCount = 0;
    const mixedRunner = async (): Promise<JobRunResult> => {
      callCount++;
      return callCount % 2 === 0
        ? { success: false, error: 'fail' }
        : { success: true, pages_crawled: 5, issues_found: 1 };
    };
    const result = await orchestrateJobs('t-1', ['s1', 's2', 's3', 's4'], 'normal', db, { runJob: mixedRunner });
    assert.equal(result.completed, 2);
    assert.equal(result.failed, 2);
  });
});

// ── orchestrateJobs — concurrency ───────────────────────────────────────────

describe('orchestrateJobs — concurrency', () => {
  it('respects maxConcurrent override', async () => {
    const db = makeDb();
    let maxSeen = 0;
    let current = 0;
    const trackRunner = async (): Promise<JobRunResult> => {
      current++;
      if (current > maxSeen) maxSeen = current;
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return { success: true };
    };
    await orchestrateJobs('t-1', ['s1', 's2', 's3', 's4'], 'high', db, {
      runJob: trackRunner,
      maxConcurrent: 2,
    });
    assert.ok(maxSeen <= 2, `maxConcurrent exceeded: ${maxSeen}`);
  });

  it('uses default concurrency 5 for high priority', async () => {
    const db = makeDb();
    let maxSeen = 0;
    let current = 0;
    const trackRunner = async (): Promise<JobRunResult> => {
      current++;
      if (current > maxSeen) maxSeen = current;
      await new Promise((r) => setTimeout(r, 5));
      current--;
      return { success: true };
    };
    await orchestrateJobs('t-1', ['s1', 's2', 's3', 's4', 's5', 's6'], 'high', db, { runJob: trackRunner });
    assert.ok(maxSeen <= 5, `high priority concurrency exceeded: ${maxSeen}`);
  });

  it('uses default concurrency 1 for low priority', async () => {
    const db = makeDb();
    let maxSeen = 0;
    let current = 0;
    const trackRunner = async (): Promise<JobRunResult> => {
      current++;
      if (current > maxSeen) maxSeen = current;
      await new Promise((r) => setTimeout(r, 5));
      current--;
      return { success: true };
    };
    await orchestrateJobs('t-1', ['s1', 's2', 's3'], 'low', db, { runJob: trackRunner });
    assert.equal(maxSeen, 1);
  });
});

// ── orchestrateJobs — job metadata ──────────────────────────────────────────

describe('orchestrateJobs — metadata', () => {
  it('sets tenant_id on all jobs', async () => {
    const db = makeDb();
    await orchestrateJobs('t-42', ['s1', 's2'], 'normal', db);
    assert.ok(db.jobs.every((j) => j.tenant_id === 't-42'));
  });

  it('sets priority on all jobs', async () => {
    const db = makeDb();
    await orchestrateJobs('t-1', ['s1'], 'high', db);
    assert.equal(db.jobs[0]!.priority, 'high');
  });

  it('sets started_at and completed_at timestamps', async () => {
    const db = makeDb();
    await orchestrateJobs('t-1', ['s1'], 'normal', db, { runJob: successRunner });
    assert.ok(db.jobs[0]!.started_at);
    assert.ok(db.jobs[0]!.completed_at);
  });
});

// ── getQueueStatus ──────────────────────────────────────────────────────────

describe('getQueueStatus', () => {
  it('returns correct counts by status', async () => {
    const db = makeDb();
    db.jobs.push(
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'normal', status: 'queued' },
      { job_id: 'j2', site_id: 's2', tenant_id: 't-1', priority: 'normal', status: 'running' },
      { job_id: 'j3', site_id: 's3', tenant_id: 't-1', priority: 'normal', status: 'done' },
      { job_id: 'j4', site_id: 's4', tenant_id: 't-1', priority: 'normal', status: 'failed' },
    );
    const status = await getQueueStatus('t-1', db);
    assert.equal(status.queued, 1);
    assert.equal(status.running, 1);
    assert.equal(status.done, 1);
    assert.equal(status.failed, 1);
  });

  it('returns next_job as first queued job', async () => {
    const db = makeDb();
    db.jobs.push(
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'high', status: 'queued' },
      { job_id: 'j2', site_id: 's2', tenant_id: 't-1', priority: 'normal', status: 'queued' },
    );
    const status = await getQueueStatus('t-1', db);
    assert.equal(status.next_job?.job_id, 'j1');
  });

  it('returns zeros for empty tenant', async () => {
    const db = makeDb();
    const status = await getQueueStatus('t-empty', db);
    assert.equal(status.queued, 0);
    assert.equal(status.running, 0);
  });
});

// ── cancelQueuedJobs ────────────────────────────────────────────────────────

describe('cancelQueuedJobs', () => {
  it('cancels queued jobs only', async () => {
    const db = makeDb();
    db.jobs.push(
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'normal', status: 'queued' },
      { job_id: 'j2', site_id: 's2', tenant_id: 't-1', priority: 'normal', status: 'running' },
      { job_id: 'j3', site_id: 's3', tenant_id: 't-1', priority: 'normal', status: 'queued' },
    );
    const result = await cancelQueuedJobs('t-1', db);
    assert.equal(result.cancelled, 2);
    assert.equal(db.jobs.find((j) => j.job_id === 'j2')!.status, 'running');
  });

  it('returns 0 when no queued jobs', async () => {
    const db = makeDb();
    db.jobs.push(
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'normal', status: 'done' },
    );
    const result = await cancelQueuedJobs('t-1', db);
    assert.equal(result.cancelled, 0);
  });
});
