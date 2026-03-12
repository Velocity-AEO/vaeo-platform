/**
 * tools/jobs/job_runner.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJobRunner, type JobRunnerDeps, type JobRunnerConfig } from './job_runner.ts';
import type { Job, JobType } from './job_queue.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:           crypto.randomUUID(),
    site_id:      'site-1',
    job_type:     'crawl_site',
    status:       'running',
    payload:      { site_url: 'https://example.com' },
    priority:     5,
    attempts:     1,
    max_attempts: 3,
    scheduled_at: new Date().toISOString(),
    created_at:   new Date().toISOString(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<JobRunnerDeps> & {
  jobs?: Job[];
  processResults?: { success: boolean; error?: string }[];
} = {}): JobRunnerDeps & { completed: string[]; failed: { id: string; error: string }[] } {
  const jobs:    Job[] = overrides.jobs ?? [];
  const results        = overrides.processResults ?? [];
  let   claimIndex     = 0;
  let   resultIndex    = 0;
  const completed: string[] = [];
  const failed:    { id: string; error: string }[] = [];

  return {
    claimNextJob: async () => {
      if (claimIndex < jobs.length) return jobs[claimIndex++];
      return null;
    },
    completeJob: async (id) => { completed.push(id); },
    failJob:     async (id, err) => { failed.push({ id, error: err }); },
    processJob:  overrides.processJob ?? (async () => {
      const r = results[resultIndex] ?? { success: true };
      resultIndex++;
      return r;
    }),
    completed,
    failed,
  };
}

const CFG: JobRunnerConfig = {
  job_types:        ['crawl_site'],
  poll_interval_ms: 60000,
  max_per_tick:     1,
};

// ── tick() ────────────────────────────────────────────────────────────────────

describe('tick', () => {
  it('processes one job per tick when max_per_tick=1', async () => {
    const jobs = [makeJob(), makeJob()];
    const deps = makeDeps({ jobs });
    const runner = createJobRunner(CFG, null, deps);

    await runner.tick();
    const s = runner.stats();
    assert.equal(s.claimed, 1);
    assert.equal(s.succeeded, 1);
    assert.equal(s.polls, 1);
  });

  it('processes multiple jobs per tick when max_per_tick=3', async () => {
    const jobs = [makeJob(), makeJob(), makeJob(), makeJob()];
    const deps = makeDeps({ jobs });
    const cfg  = { ...CFG, max_per_tick: 3 };
    const runner = createJobRunner(cfg, null, deps);

    await runner.tick();
    const s = runner.stats();
    assert.equal(s.claimed, 3);
    assert.equal(s.succeeded, 3);
  });

  it('stops early when no more jobs', async () => {
    const deps   = makeDeps({ jobs: [] });
    const runner = createJobRunner(CFG, null, deps);

    await runner.tick();
    assert.equal(runner.stats().claimed, 0);
  });

  it('counts failed jobs when processJob returns success=false', async () => {
    const jobs = [makeJob()];
    const deps = makeDeps({ jobs, processResults: [{ success: false, error: 'timeout' }] });
    const runner = createJobRunner(CFG, null, deps);

    await runner.tick();
    const s = runner.stats();
    assert.equal(s.failed, 1);
    assert.equal(s.succeeded, 0);
    assert.equal(deps.failed.length, 1);
    assert.equal(deps.failed[0]!.error, 'timeout');
  });

  it('increments polls on each tick call', async () => {
    const deps   = makeDeps({});
    const runner = createJobRunner(CFG, null, deps);

    await runner.tick();
    await runner.tick();
    await runner.tick();
    assert.equal(runner.stats().polls, 3);
  });

  it('handles claimNextJob throwing without propagating', async () => {
    const deps: JobRunnerDeps = {
      claimNextJob: async () => { throw new Error('DB down'); },
      completeJob:  async () => {},
      failJob:      async () => {},
    };
    const runner = createJobRunner(CFG, null, deps);
    await assert.doesNotReject(() => runner.tick());
    assert.equal(runner.stats().claimed, 0);
  });
});

// ── start / stop ──────────────────────────────────────────────────────────────

describe('start / stop', () => {
  it('starts and stops without error', () => {
    const deps   = makeDeps({});
    const runner = createJobRunner({ ...CFG, poll_interval_ms: 10000 }, null, deps);
    runner.start();
    assert.equal(runner.stats().running, true);
    runner.stop();
    assert.equal(runner.stats().running, false);
  });

  it('calling start twice does not double-schedule', () => {
    const deps   = makeDeps({});
    const runner = createJobRunner({ ...CFG, poll_interval_ms: 10000 }, null, deps);
    runner.start();
    runner.start(); // idempotent
    runner.stop();
    assert.equal(runner.stats().running, false);
  });

  it('calling stop when not running is safe', () => {
    const deps   = makeDeps({});
    const runner = createJobRunner(CFG, null, deps);
    assert.doesNotThrow(() => runner.stop());
  });
});

// ── stats() ───────────────────────────────────────────────────────────────────

describe('stats', () => {
  it('returns a copy (not mutable reference)', async () => {
    const deps   = makeDeps({ jobs: [makeJob()] });
    const runner = createJobRunner(CFG, null, deps);

    const s1 = runner.stats();
    await runner.tick();
    const s2 = runner.stats();

    assert.equal(s1.claimed, 0);
    assert.equal(s2.claimed, 1);
  });

  it('starts with all zeros', () => {
    const deps   = makeDeps({});
    const runner = createJobRunner(CFG, null, deps);
    const s      = runner.stats();

    assert.equal(s.polls,     0);
    assert.equal(s.claimed,   0);
    assert.equal(s.succeeded, 0);
    assert.equal(s.failed,    0);
    assert.equal(s.running,   false);
  });
});

// ── processJob dispatcher ─────────────────────────────────────────────────────

describe('default processJob dispatcher', () => {
  it('uses custom processJob when provided', async () => {
    let called = false;
    const deps: JobRunnerDeps = {
      claimNextJob: async () => { if (!called) return makeJob(); return null; },
      completeJob:  async () => {},
      failJob:      async () => {},
      processJob:   async () => { called = true; return { success: true }; },
    };
    const runner = createJobRunner(CFG, null, deps);
    await runner.tick();
    assert.equal(called, true);
  });

  it('handles unknown job types gracefully', async () => {
    let processCount = 0;
    const unknownJob = makeJob({ job_type: 'gsc_sync' });
    const deps: JobRunnerDeps = {
      claimNextJob: async () => { if (processCount === 0) { processCount++; return unknownJob; } return null; },
      completeJob:  async () => {},
      failJob:      async () => {},
    };
    const runner = createJobRunner({ ...CFG, job_types: ['gsc_sync'] }, null, deps);
    await runner.tick();
    assert.equal(runner.stats().succeeded, 1);
  });
});
