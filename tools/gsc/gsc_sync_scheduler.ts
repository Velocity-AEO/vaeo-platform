/**
 * tools/gsc/gsc_sync_scheduler.ts
 *
 * Scheduler for automatic GSC rankings refresh.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';
import { runTagCleanupJob } from './gsc_tag_cleanup.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GSCSyncJob {
  job_id:               string;
  site_id:              string;
  account_id:           string;
  last_synced_at:       string | null;
  next_sync_at:         string;
  sync_frequency_hours: number;
  enabled:              boolean;
}

export interface SyncResult {
  success:       boolean;
  ranking_count: number;
  error?:        string;
}

export interface BatchSyncResult {
  site_id: string;
  success: boolean;
}

// ── buildSyncJob ─────────────────────────────────────────────────────────────

export function buildSyncJob(
  site_id:         string,
  account_id:      string,
  frequency_hours?: number,
): GSCSyncJob {
  try {
    const freq = frequency_hours ?? 24;
    const next = new Date();
    next.setHours(next.getHours() + freq);

    return {
      job_id:               `gsc_sync_${randomUUID().slice(0, 8)}`,
      site_id:              site_id ?? '',
      account_id:           account_id ?? '',
      last_synced_at:       null,
      next_sync_at:         next.toISOString(),
      sync_frequency_hours: freq,
      enabled:              true,
    };
  } catch {
    return {
      job_id:               `gsc_sync_${Date.now()}`,
      site_id:              site_id ?? '',
      account_id:           account_id ?? '',
      last_synced_at:       null,
      next_sync_at:         new Date().toISOString(),
      sync_frequency_hours: 24,
      enabled:              true,
    };
  }
}

// ── isDueSoon ────────────────────────────────────────────────────────────────

export function isDueSoon(job: GSCSyncJob, window_minutes: number): boolean {
  try {
    if (!job?.next_sync_at) return false;
    const nextAt = new Date(job.next_sync_at).getTime();
    const windowMs = (window_minutes ?? 0) * 60 * 1000;
    return Date.now() >= nextAt - windowMs;
  } catch {
    return false;
  }
}

// ── getOverdueJobs ───────────────────────────────────────────────────────────

export function getOverdueJobs(jobs: GSCSyncJob[]): GSCSyncJob[] {
  try {
    if (!Array.isArray(jobs)) return [];
    const now = Date.now();
    return jobs.filter(j => {
      if (!j?.enabled) return false;
      const nextAt = new Date(j.next_sync_at).getTime();
      return now >= nextAt;
    });
  } catch {
    return [];
  }
}

// ── runSyncForSite ───────────────────────────────────────────────────────────

export async function runSyncForSite(
  site_id: string,
  deps?: {
    fetchRankingsFn?: (site_id: string) => Promise<Array<{ keyword: string; position: number }>>;
    saveRankingsFn?:  (site_id: string, rankings: any[]) => Promise<void>;
    updateJobFn?:     (site_id: string, last_synced_at: string, next_sync_at: string) => Promise<void>;
  },
): Promise<SyncResult> {
  try {
    const fetchRankings = deps?.fetchRankingsFn ?? defaultFetchRankings;
    const saveRankings  = deps?.saveRankingsFn ?? defaultSaveRankings;
    const updateJob     = deps?.updateJobFn ?? defaultUpdateJob;

    const rankings = await fetchRankings(site_id);

    await saveRankings(site_id, rankings);

    const now = new Date();
    const next = new Date();
    next.setHours(next.getHours() + 24);
    await updateJob(site_id, now.toISOString(), next.toISOString());

    return { success: true, ranking_count: rankings.length };
  } catch (err) {
    return {
      success: false,
      ranking_count: 0,
      error: err instanceof Error ? err.message : 'sync_error',
    };
  }
}

// ── runOverdueSyncs ──────────────────────────────────────────────────────────

export async function runOverdueSyncs(
  deps?: {
    loadJobsFn?: () => Promise<GSCSyncJob[]>;
    runSyncFn?:  (site_id: string) => Promise<SyncResult>;
  },
): Promise<BatchSyncResult[]> {
  try {
    const loadJobs = deps?.loadJobsFn ?? defaultLoadJobs;
    const runSync  = deps?.runSyncFn ?? ((sid: string) => runSyncForSite(sid));

    const allJobs = await loadJobs();
    const overdue = getOverdueJobs(allJobs);
    const results: BatchSyncResult[] = [];

    for (const job of overdue) {
      try {
        const result = await runSync(job.site_id);
        results.push({ site_id: job.site_id, success: result.success });
      } catch {
        results.push({ site_id: job.site_id, success: false });
      }
    }

    // Run tag cleanup once daily after sync — non-fatal
    try {
      await runTagCleanupJob(24);
    } catch {
      // Tag cleanup failure must not block sync results
    }

    return results;
  } catch {
    return [];
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultFetchRankings(_site_id: string): Promise<any[]> {
  return [];
}

async function defaultSaveRankings(_site_id: string, _rankings: any[]): Promise<void> {}

async function defaultUpdateJob(
  _site_id: string,
  _last_synced_at: string,
  _next_sync_at: string,
): Promise<void> {}

async function defaultLoadJobs(): Promise<GSCSyncJob[]> {
  return [];
}
