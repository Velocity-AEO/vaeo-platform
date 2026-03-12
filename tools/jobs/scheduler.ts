/**
 * tools/jobs/scheduler.ts
 *
 * Schedule recurring crawl jobs for sites.
 *
 * - scheduleSiteCrawl: enqueue a crawl_site job for one site
 * - scheduleAllSites: enqueue crawl_site jobs for all active sites
 * - getScheduleStatus: return next scheduled crawl time and last run info
 *
 * All functions are injectable and never throw.
 */

import { enqueueJob, type JobType } from './job_queue.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduleOptions {
  /** ISO datetime string — defaults to now */
  scheduled_at?:  string;
  priority?:      number;
  max_attempts?:  number;
  /** Extra payload fields (e.g. max_urls) */
  payload?:       Record<string, unknown>;
}

export interface ScheduleResult {
  ok:       boolean;
  site_id:  string;
  job_id?:  string;
  error?:   string;
}

export interface ScheduleAllResult {
  total:     number;
  scheduled: number;
  failed:    number;
  results:   ScheduleResult[];
}

export interface SiteRecord {
  site_id:  string;
  site_url: string;
}

export interface ScheduleStatus {
  site_id:      string;
  has_pending:  boolean;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
}

// ── DB interface (injectable) ─────────────────────────────────────────────────

export interface SchedulerDb {
  from(table: 'jobs'): SchedulerJobTable;
  from(table: 'sites'): SchedulerSiteTable;
  from(table: string): SchedulerJobTable | SchedulerSiteTable;
}

interface JobRow { id: string; site_id: string; status: string; scheduled_at: string; created_at: string; completed_at?: string }
interface SiteRow { site_id: string; site_url: string; active?: boolean }

interface SchedulerQuery<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  eq(col: string, val: unknown):  SchedulerQuery<T>;
  in(col: string, vals: unknown[]): SchedulerQuery<T>;
  order(col: string, opts: { ascending: boolean }): SchedulerQuery<T>;
  limit(n: number): SchedulerQuery<T>;
}

interface SchedulerJobTable {
  select(cols: string): SchedulerQuery<JobRow>;
  insert(row: Record<string, unknown>): {
    select(col: string): {
      maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
    };
  };
}

interface SchedulerSiteTable {
  select(cols: string): SchedulerQuery<SiteRow>;
}

// ── scheduleSiteCrawl ─────────────────────────────────────────────────────────

export async function scheduleSiteCrawl(
  siteId:   string,
  siteUrl:  string,
  db:       unknown,
  opts:     ScheduleOptions = {},
): Promise<ScheduleResult> {
  try {
    const result = await enqueueJob(
      {
        site_id:      siteId,
        job_type:     'crawl_site' as JobType,
        priority:     opts.priority ?? 5,
        max_attempts: opts.max_attempts ?? 3,
        scheduled_at: opts.scheduled_at,
        payload:      { site_url: siteUrl, ...(opts.payload ?? {}) },
      },
      db,
    );

    if (!result.ok) return { ok: false, site_id: siteId, error: result.error };
    return { ok: true, site_id: siteId, job_id: result.job_id };
  } catch (err) {
    return { ok: false, site_id: siteId, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── scheduleAllSites ──────────────────────────────────────────────────────────

export async function scheduleAllSites(
  db:   unknown,
  opts: ScheduleOptions = {},
): Promise<ScheduleAllResult> {
  try {
    const sdb = db as SchedulerDb;
    const { data, error } = await sdb.from('sites').select('site_id,site_url');

    if (error || !data) {
      return { total: 0, scheduled: 0, failed: 0, results: [] };
    }

    const sites = data as SiteRow[];
    const results: ScheduleResult[] = [];
    let scheduled = 0;
    let failed    = 0;

    for (const site of sites) {
      const r = await scheduleSiteCrawl(site.site_id, site.site_url, db, opts);
      results.push(r);
      if (r.ok) scheduled++;
      else      failed++;
    }

    return { total: sites.length, scheduled, failed, results };
  } catch {
    return { total: 0, scheduled: 0, failed: 0, results: [] };
  }
}

// ── getScheduleStatus ─────────────────────────────────────────────────────────

export async function getScheduleStatus(
  siteId: string,
  db:     unknown,
): Promise<ScheduleStatus> {
  const base: ScheduleStatus = { site_id: siteId, has_pending: false };

  try {
    const sdb = db as SchedulerDb;

    // Pending/running jobs
    const { data: pending } = await sdb
      .from('jobs')
      .select('id,site_id,status,scheduled_at,created_at')
      .eq('site_id', siteId)
      .in('status', ['pending', 'running'])
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (pending && pending.length > 0) {
      base.has_pending = true;
      base.next_run_at = (pending[0] as JobRow).scheduled_at;
    }

    // Last completed/failed job
    const { data: last } = await sdb
      .from('jobs')
      .select('id,site_id,status,scheduled_at,created_at,completed_at')
      .eq('site_id', siteId)
      .in('status', ['done', 'failed', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (last && last.length > 0) {
      const lastJob = last[0] as JobRow;
      base.last_run_at = lastJob.completed_at ?? lastJob.created_at;
      base.last_status = lastJob.status;
    }

    return base;
  } catch {
    return base;
  }
}
