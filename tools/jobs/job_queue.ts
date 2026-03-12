/**
 * tools/jobs/job_queue.ts
 *
 * Persistent job queue backed by the `jobs` Supabase table.
 * Injectable DB — never throws, returns result objects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobType =
  | 'crawl_site'
  | 'triage_site'
  | 'apply_fixes'
  | 'sandbox_verify'
  | 'regression_check'
  | 'gsc_sync';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Job {
  id:            string;
  site_id:       string;
  job_type:      JobType;
  status:        JobStatus;
  payload:       Record<string, unknown>;
  priority:      number;
  attempts:      number;
  max_attempts:  number;
  scheduled_at:  string;
  started_at?:   string;
  completed_at?: string;
  error?:        string;
  created_at:    string;
}

// ── DB interface (injectable) ─────────────────────────────────────────────────

export interface JobDb {
  from(table: 'jobs'): JobTable;
}

interface JobQuery extends PromiseLike<{ data: Job[] | null; error: { message: string } | null }> {
  eq(col: string, val: unknown):    JobQuery;
  in(col: string, vals: unknown[]): JobQuery;
  lte(col: string, val: string):    JobQuery;
  lt(col: string, val: string):     JobQuery;
  or(filter: string):               JobQuery;
  order(col: string, opts: { ascending: boolean }): JobQuery;
  limit(n: number):                 JobQuery;
}

interface SingleQuery extends PromiseLike<{ data: Job | null; error: { message: string } | null }> {
  eq(col: string, val: unknown): SingleQuery;
}

interface JobTable {
  insert(row: Record<string, unknown>): {
    select(col: string): {
      maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
    };
  };
  select(cols: string): JobQuery;
  update(row: Record<string, unknown>): {
    eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
  };
}

// ── enqueueJob ────────────────────────────────────────────────────────────────

export async function enqueueJob(
  params: {
    site_id:       string;
    job_type:      JobType;
    payload?:      Record<string, unknown>;
    priority?:     number;
    scheduled_at?: string;
    max_attempts?: number;
  },
  db: unknown,
): Promise<{ ok: boolean; job_id?: string; error?: string }> {
  try {
    const jdb = db as JobDb;
    const row = {
      site_id:      params.site_id,
      job_type:     params.job_type,
      status:       'pending',
      payload:      params.payload ?? {},
      priority:     params.priority ?? 5,
      max_attempts: params.max_attempts ?? 3,
      scheduled_at: params.scheduled_at ?? new Date().toISOString(),
      attempts:     0,
    };

    const { data, error } = await jdb.from('jobs').insert(row).select('id').maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: 'no id returned' };
    return { ok: true, job_id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── claimNextJob ──────────────────────────────────────────────────────────────

export async function claimNextJob(
  job_types: JobType[],
  db:        unknown,
): Promise<Job | null> {
  try {
    const jdb = db as JobDb;
    const now = new Date().toISOString();

    // Get oldest eligible pending job
    const { data, error } = await jdb
      .from('jobs')
      .select('*')
      .in('job_type', job_types)
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const job = data[0] as Job;

    // Only claim if attempts < max_attempts
    if (job.attempts >= job.max_attempts) return null;

    const nextAttempts = job.attempts + 1;

    // Mark as running
    await jdb.from('jobs').update({
      status:     'running',
      attempts:   nextAttempts,
      started_at: now,
    }).eq('id', job.id);

    return { ...job, status: 'running', attempts: nextAttempts, started_at: now };
  } catch {
    return null;
  }
}

// ── completeJob ───────────────────────────────────────────────────────────────

export async function completeJob(job_id: string, db: unknown): Promise<void> {
  try {
    const jdb = db as JobDb;
    await jdb.from('jobs').update({
      status:       'done',
      completed_at: new Date().toISOString(),
    }).eq('id', job_id);
  } catch { /* non-fatal */ }
}

// ── failJob ───────────────────────────────────────────────────────────────────

export async function failJob(job_id: string, error: string, db: unknown): Promise<void> {
  try {
    const jdb = db as JobDb;

    // Look up current attempts
    const { data } = await jdb.from('jobs').select('attempts, max_attempts').eq('id', job_id) as any;
    const job = (data as Job[] | null)?.[0];
    const attempts     = job?.attempts     ?? 0;
    const max_attempts = job?.max_attempts ?? 3;

    if (attempts >= max_attempts) {
      await jdb.from('jobs').update({ status: 'failed', error }).eq('id', job_id);
    } else {
      await jdb.from('jobs').update({ status: 'pending', error, started_at: null }).eq('id', job_id);
    }
  } catch { /* non-fatal */ }
}

// ── cancelJob ─────────────────────────────────────────────────────────────────

export async function cancelJob(job_id: string, db: unknown): Promise<void> {
  try {
    const jdb = db as JobDb;
    await jdb.from('jobs').update({ status: 'cancelled' }).eq('id', job_id);
  } catch { /* non-fatal */ }
}

// ── getJobStatus ──────────────────────────────────────────────────────────────

export async function getJobStatus(job_id: string, db: unknown): Promise<Job | null> {
  try {
    const jdb = db as JobDb;
    const { data, error } = await jdb.from('jobs').select('*').eq('id', job_id).limit(1) as any;
    if (error || !data || (data as Job[]).length === 0) return null;
    return (data as Job[])[0] ?? null;
  } catch {
    return null;
  }
}

// ── getPendingJobs ────────────────────────────────────────────────────────────

export async function getPendingJobs(site_id: string, db: unknown): Promise<Job[]> {
  try {
    const jdb = db as JobDb;
    const { data, error } = await jdb
      .from('jobs')
      .select('*')
      .eq('site_id', site_id)
      .in('status', ['pending', 'running'])
      .order('scheduled_at', { ascending: true }) as any;
    if (error || !data) return [];
    return data as Job[];
  } catch {
    return [];
  }
}
