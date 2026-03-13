/**
 * tools/gsc/gsc_sync_scheduler.ts
 *
 * Scheduler for automatic GSC rankings refresh.
 * Nightly jobs use delta sync; full re-pull only on first connect or manual trigger.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';
import { runTagCleanupJob } from './gsc_tag_cleanup.js';
import { cleanExpiredDedupRecords } from '../notifications/notification_dedup.js';
import {
  runDeltaSync,
  type DeltaSyncConfig,
  type DeltaSyncResult,
} from './gsc_delta_sync.js';
import {
  loadSyncRecord,
  saveSyncRecord,
  shouldForceFullSync,
} from './gsc_sync_tracker.js';

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
    /** Override the delta sync runner for testing */
    deltaSyncFn?: (config: DeltaSyncConfig) => Promise<DeltaSyncResult>;
    /** Override the sync record loader for testing */
    loadSyncFn?: (site_id: string) => Promise<import('./gsc_sync_tracker.js').SyncRecord | null>;
    /** Override the save sync record for testing */
    saveSyncFn?: (site_id: string, result: DeltaSyncResult) => Promise<boolean>;
    /** Override the force full sync check for testing */
    forceFullFn?: (site_id: string) => Promise<boolean>;
    property?: string;
  },
): Promise<SyncResult> {
  try {
    // --- Delta sync path (new) ---
    const deltaSyncFn = deps?.deltaSyncFn;
    if (deltaSyncFn || (!deps?.fetchRankingsFn && !deps?.saveRankingsFn)) {
      // Use delta sync engine
      const syncRecord  = await loadSyncRecord(site_id, { loadFn: deps?.loadSyncFn }).catch(() => null);
      const forceFullFn = deps?.forceFullFn
        ?? ((sid: string) => shouldForceFullSync(sid, { loadFn: deps?.loadSyncFn }));
      const force_full  = await forceFullFn(site_id).catch(() => false);

      const config: DeltaSyncConfig = {
        site_id,
        property:     deps?.property ?? `sc-domain:${site_id}`,
        last_sync_at: syncRecord?.last_sync_at ?? null,
        force_full,
      };

      const runFn  = deltaSyncFn ?? runDeltaSync;
      const result = await runFn(config).catch((err: unknown) => ({
        site_id,
        sync_mode:        'full' as const,
        date_range_start: '',
        date_range_end:   '',
        days_fetched:     0,
        rows_fetched:     0,
        rows_new:         0,
        rows_updated:     0,
        api_calls_made:   0,
        synced_at:        new Date().toISOString(),
        error:            err instanceof Error ? err.message : String(err),
      }));

      // Save sync record (non-fatal)
      const saveFn = deps?.saveSyncFn
        ?? ((sid: string, res: DeltaSyncResult) => saveSyncRecord(sid, res, { loadFn: deps?.loadSyncFn }));
      await saveFn(site_id, result).catch(() => {});

      if (result.error) {
        return { success: false, ranking_count: 0, error: result.error };
      }
      return { success: true, ranking_count: result.rows_fetched };
    }

    // --- Legacy path (backwards compat) ---
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

// ── triggerFullSync ───────────────────────────────────────────────────────────

export async function triggerFullSync(
  site_id: string,
  deps?: {
    syncFn?:   (config: DeltaSyncConfig) => Promise<DeltaSyncResult>;
    saveFn?:   (site_id: string, result: DeltaSyncResult) => Promise<boolean>;
    property?: string;
    logFn?:    (msg: string) => void;
  },
): Promise<DeltaSyncResult> {
  const logFn = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    const config: DeltaSyncConfig = {
      site_id,
      property:     deps?.property ?? `sc-domain:${site_id}`,
      last_sync_at: null,
      force_full:   true,
    };

    const syncFn = deps?.syncFn ?? runDeltaSync;
    const result = await syncFn(config);

    logFn(
      `[GSC_SYNC] site=${site_id} mode=${result.sync_mode} days=${result.days_fetched} ` +
      `rows=${result.rows_fetched} new=${result.rows_new} updated=${result.rows_updated} ` +
      `api_calls=${result.api_calls_made}`,
    );

    // Persist sync record (non-fatal)
    const saveFn = deps?.saveFn ?? ((sid: string, res: DeltaSyncResult) => saveSyncRecord(sid, res));
    await saveFn(site_id, result).catch(() => {});

    return result;
  } catch (err) {
    return {
      site_id,
      sync_mode:        'full',
      date_range_start: '',
      date_range_end:   '',
      days_fetched:     0,
      rows_fetched:     0,
      rows_new:         0,
      rows_updated:     0,
      api_calls_made:   0,
      synced_at:        new Date().toISOString(),
      error:            err instanceof Error ? err.message : String(err),
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

    // Purge expired notification dedup records — non-fatal
    try {
      await cleanExpiredDedupRecords();
    } catch {
      // Dedup cleanup failure must not block sync results
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
