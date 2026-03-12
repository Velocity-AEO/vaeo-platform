/**
 * tools/jobs/job_orchestrator.ts
 *
 * Multi-site job orchestration with concurrency limits
 * and priority lanes. Injectable deps. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type JobPriority = 'high' | 'normal' | 'low';

export interface OrchestratorJob {
  job_id:        string;
  site_id:       string;
  tenant_id:     string;
  priority:      JobPriority;
  status:        'queued' | 'running' | 'done' | 'failed';
  started_at?:   string;
  completed_at?: string;
  error?:        string;
  pages_crawled?: number;
  issues_found?:  number;
}

export interface OrchestratorResult {
  total_jobs:  number;
  completed:   number;
  failed:      number;
  skipped:     number;
  duration_ms: number;
}

export interface JobRunResult {
  success:       boolean;
  pages_crawled?: number;
  issues_found?:  number;
  error?:        string;
}

export interface OrchestratorDb {
  insertJob:  (job: OrchestratorJob) => Promise<void>;
  updateJob:  (job_id: string, updates: Partial<OrchestratorJob>) => Promise<void>;
  getJobs:    (tenant_id: string) => Promise<OrchestratorJob[]>;
  cancelQueued: (tenant_id: string) => Promise<number>;
}

export interface OrchestratorDeps {
  runJob?:        (job: OrchestratorJob) => Promise<JobRunResult>;
  maxConcurrent?: number;
}

// ── Concurrency defaults per priority ────────────────────────────────────────

const DEFAULT_CONCURRENCY: Record<JobPriority, number> = {
  high:   5,
  normal: 3,
  low:    1,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function runBatch(
  batch: OrchestratorJob[],
  db: OrchestratorDb,
  runJob: (job: OrchestratorJob) => Promise<JobRunResult>,
): Promise<{ completed: number; failed: number }> {
  let completed = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    batch.map(async (job) => {
      // Mark running
      job.status = 'running';
      job.started_at = new Date().toISOString();
      await db.updateJob(job.job_id, { status: 'running', started_at: job.started_at }).catch(() => {});

      try {
        const result = await runJob(job);
        if (result.success) {
          job.status = 'done';
          job.pages_crawled = result.pages_crawled;
          job.issues_found = result.issues_found;
          completed++;
        } else {
          job.status = 'failed';
          job.error = result.error ?? 'Unknown error';
          failed++;
        }
      } catch (err) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        failed++;
      }

      job.completed_at = new Date().toISOString();
      await db.updateJob(job.job_id, {
        status:        job.status,
        completed_at:  job.completed_at,
        pages_crawled: job.pages_crawled,
        issues_found:  job.issues_found,
        error:         job.error,
      }).catch(() => {});
    }),
  );

  return { completed, failed };
}

// ── orchestrateJobs ─────────────────────────────────────────────────────────

export async function orchestrateJobs(
  tenant_id: string,
  site_ids:  string[],
  priority:  JobPriority,
  db:        OrchestratorDb,
  deps?:     OrchestratorDeps,
): Promise<OrchestratorResult> {
  const start = Date.now();

  try {
    if (site_ids.length === 0) {
      return { total_jobs: 0, completed: 0, failed: 0, skipped: 0, duration_ms: Date.now() - start };
    }

    const maxConcurrent = deps?.maxConcurrent ?? DEFAULT_CONCURRENCY[priority];
    const defaultRunJob: (job: OrchestratorJob) => Promise<JobRunResult> =
      async () => ({ success: true, pages_crawled: 0, issues_found: 0 });
    const runJob = deps?.runJob ?? defaultRunJob;

    // Create jobs
    const jobs: OrchestratorJob[] = site_ids.map((site_id) => ({
      job_id:    generateId(),
      site_id,
      tenant_id,
      priority,
      status:    'queued' as const,
    }));

    // Insert all jobs
    for (const job of jobs) {
      await db.insertJob(job).catch(() => {});
    }

    // Process in batches
    let totalCompleted = 0;
    let totalFailed = 0;

    for (let i = 0; i < jobs.length; i += maxConcurrent) {
      const batch = jobs.slice(i, i + maxConcurrent);
      const { completed, failed } = await runBatch(batch, db, runJob);
      totalCompleted += completed;
      totalFailed += failed;
    }

    return {
      total_jobs:  jobs.length,
      completed:   totalCompleted,
      failed:      totalFailed,
      skipped:     0,
      duration_ms: Date.now() - start,
    };
  } catch {
    return {
      total_jobs:  site_ids.length,
      completed:   0,
      failed:      0,
      skipped:     site_ids.length,
      duration_ms: Date.now() - start,
    };
  }
}

// ── getQueueStatus ──────────────────────────────────────────────────────────

export async function getQueueStatus(
  tenant_id: string,
  db:        OrchestratorDb,
): Promise<{
  queued:    number;
  running:   number;
  done:      number;
  failed:    number;
  next_job?: OrchestratorJob;
}> {
  try {
    const jobs = await db.getJobs(tenant_id);
    const queued  = jobs.filter((j) => j.status === 'queued');
    const running = jobs.filter((j) => j.status === 'running');
    const done    = jobs.filter((j) => j.status === 'done');
    const failed  = jobs.filter((j) => j.status === 'failed');

    return {
      queued:   queued.length,
      running:  running.length,
      done:     done.length,
      failed:   failed.length,
      next_job: queued[0],
    };
  } catch {
    return { queued: 0, running: 0, done: 0, failed: 0 };
  }
}

// ── cancelQueuedJobs ────────────────────────────────────────────────────────

export async function cancelQueuedJobs(
  tenant_id: string,
  db:        OrchestratorDb,
): Promise<{ cancelled: number }> {
  try {
    const count = await db.cancelQueued(tenant_id);
    return { cancelled: count };
  } catch {
    return { cancelled: 0 };
  }
}
