/**
 * tools/jobs/job_runner.ts
 *
 * Poll-based job worker.
 *
 * createJobRunner returns a runner that:
 *   - polls the job queue at a configurable interval
 *   - claims and processes jobs of configured types
 *   - respects max concurrency (serial by default)
 *   - tracks run stats
 *   - exposes start() / stop() / stats()
 *
 * All processors are injectable. Never throws.
 */

import { claimNextJob, completeJob, failJob, type Job, type JobType } from './job_queue.js';
import { processCrawlJob, type CrawlProcessorDeps } from './crawl_processor.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobRunnerConfig {
  /** Job types this runner handles */
  job_types:        JobType[];
  /** Poll interval in ms (default 5000) */
  poll_interval_ms?: number;
  /** Max jobs to process per poll tick (default 1) */
  max_per_tick?:    number;
}

export interface RunnerStats {
  polls:       number;
  claimed:     number;
  succeeded:   number;
  failed:      number;
  running:     boolean;
}

export interface JobRunnerDeps {
  claimNextJob:  (types: JobType[], db: unknown) => Promise<Job | null>;
  completeJob:   (id: string, db: unknown) => Promise<void>;
  failJob:       (id: string, error: string, db: unknown) => Promise<void>;
  processJob?:   (job: Job, db: unknown) => Promise<{ success: boolean; error?: string }>;
  crawlDeps?:    CrawlProcessorDeps;
}

export interface JobRunner {
  start():  void;
  stop():   void;
  stats():  RunnerStats;
  /** Run a single poll tick (useful in tests / serverless) */
  tick():   Promise<void>;
}

// ── Default processor dispatcher ──────────────────────────────────────────────

function defaultProcessJob(crawlDeps?: CrawlProcessorDeps) {
  return async (job: Job, db: unknown): Promise<{ success: boolean; error?: string }> => {
    try {
      if (job.job_type === 'crawl_site') {
        const r = await processCrawlJob(job, db, crawlDeps);
        return { success: !r.error, error: r.error };
      }
      // Unknown job type — complete as no-op
      await completeJob(job.id, db);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}

// ── createJobRunner ───────────────────────────────────────────────────────────

export function createJobRunner(
  config: JobRunnerConfig,
  db:     unknown,
  deps:   JobRunnerDeps = { claimNextJob, completeJob, failJob },
): JobRunner {
  const pollMs    = config.poll_interval_ms ?? 5000;
  const maxPerTick = config.max_per_tick ?? 1;

  const stats: RunnerStats = { polls: 0, claimed: 0, succeeded: 0, failed: 0, running: false };

  const processJob = deps.processJob ?? defaultProcessJob(deps.crawlDeps);
  let timerId: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    stats.polls++;

    for (let i = 0; i < maxPerTick; i++) {
      let job: Job | null = null;
      try {
        job = await deps.claimNextJob(config.job_types, db);
      } catch {
        break;
      }

      if (!job) break;

      stats.claimed++;
      const result = await processJob(job, db);

      if (result.success) {
        stats.succeeded++;
      } else {
        stats.failed++;
        try {
          await deps.failJob(job.id, result.error ?? 'unknown error', db);
        } catch { /* non-fatal */ }
      }
    }
  }

  function schedule() {
    if (!stats.running) return;
    timerId = setTimeout(async () => {
      await tick();
      schedule();
    }, pollMs);
  }

  return {
    start() {
      if (stats.running) return;
      stats.running = true;
      schedule();
    },

    stop() {
      stats.running = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },

    stats() {
      return { ...stats };
    },

    tick,
  };
}
