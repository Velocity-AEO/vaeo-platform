import { createServerClient } from './supabase';
import type { ActionQueueRow, CrawlSnapshot, DashboardStats, RunSummary, Site } from './types';

// ── Dashboard home ────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const db  = createServerClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [snapshotsRes, deployedRes, pendingRes, regressionRes] = await Promise.all([
    // Runs today — count distinct run_ids in crawl_snapshots
    db.from('crawl_snapshots')
      .select('run_id', { count: 'exact', head: true })
      .gte('started_at', todayIso),

    // Fixes deployed today
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'deployed')
      .gte('updated_at', todayIso),

    // Fixes pending approval (all time — these are open items)
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'pending_approval'),

    // Active regressions
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'regression_detected'),
  ]);

  return {
    total_runs_today:       snapshotsRes.count ?? 0,
    fixes_deployed_today:   deployedRes.count  ?? 0,
    fixes_pending_approval: pendingRes.count   ?? 0,
    active_regressions:     regressionRes.count ?? 0,
  };
}

export async function getRecentRuns(limit = 20): Promise<RunSummary[]> {
  const db = createServerClient();

  // Get recent crawl snapshots
  const { data: snapshots } = await db
    .from('crawl_snapshots')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (!snapshots?.length) return [];

  // Join site URLs
  const siteIds = Array.from(new Set(snapshots.map((s: CrawlSnapshot) => s.site_id)));
  const { data: sites } = await db
    .from('sites')
    .select('site_id, site_url, cms_type')
    .in('site_id', siteIds);

  const siteMap = new Map((sites ?? []).map((s: Pick<Site, 'site_id' | 'site_url' | 'cms_type'>) => [s.site_id, s]));

  // Join fix counts per run
  const runIds = snapshots.map((s: CrawlSnapshot) => s.run_id);
  const { data: fixCounts } = await db
    .from('action_queue')
    .select('run_id, execution_status')
    .in('run_id', runIds)
    .eq('execution_status', 'deployed');

  const deployedByRun = new Map<string, number>();
  for (const row of fixCounts ?? []) {
    deployedByRun.set(row.run_id, (deployedByRun.get(row.run_id) ?? 0) + 1);
  }

  return snapshots.map((s: CrawlSnapshot) => {
    const site = siteMap.get(s.site_id);
    return {
      run_id:         s.run_id,
      site_url:       site?.site_url ?? s.site_id,
      cms_type:       site?.cms_type ?? s.cms_type,
      status:         s.status,
      urls_crawled:   s.urls_crawled,
      fixes_deployed: deployedByRun.get(s.run_id) ?? 0,
      started_at:     s.started_at,
      site_id:        s.site_id,
    };
  });
}

// ── Run detail ────────────────────────────────────────────────────────────────

export async function getRunActions(runId: string): Promise<ActionQueueRow[]> {
  const db = createServerClient();
  const { data } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', runId)
    .order('priority', { ascending: true })
    .order('risk_score', { ascending: false });
  return (data ?? []) as ActionQueueRow[];
}

export async function getRunSnapshot(runId: string): Promise<CrawlSnapshot | null> {
  const db = createServerClient();
  const { data } = await db
    .from('crawl_snapshots')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();
  return data as CrawlSnapshot | null;
}

// ── Sites list ────────────────────────────────────────────────────────────────

export async function getAllSites(): Promise<(Site & { last_run_at: string | null; last_run_id: string | null })[]> {
  const db = createServerClient();
  const { data: sites } = await db
    .from('sites')
    .select('*')
    .order('created_at', { ascending: false });

  if (!sites?.length) return [];

  const siteIds = sites.map((s: Site) => s.site_id);
  const { data: snapshots } = await db
    .from('crawl_snapshots')
    .select('site_id, run_id, started_at')
    .in('site_id', siteIds)
    .order('started_at', { ascending: false });

  // Latest run per site
  const latestBySize = new Map<string, { run_id: string; started_at: string }>();
  for (const snap of snapshots ?? []) {
    if (!latestBySize.has(snap.site_id)) {
      latestBySize.set(snap.site_id, { run_id: snap.run_id, started_at: snap.started_at });
    }
  }

  return sites.map((s: Site) => {
    const latest = latestBySize.get(s.site_id);
    return {
      ...s,
      last_run_at: latest?.started_at ?? null,
      last_run_id: latest?.run_id     ?? null,
    };
  });
}

// ── Global approval queue ─────────────────────────────────────────────────────

export async function getPendingApprovals(): Promise<(ActionQueueRow & { site_url: string })[]> {
  const db = createServerClient();
  const { data: rows } = await db
    .from('action_queue')
    .select('*')
    .eq('execution_status', 'pending_approval')
    .order('risk_score', { ascending: false });

  if (!rows?.length) return [];

  const siteIds = Array.from(new Set(rows.map((r: ActionQueueRow) => r.site_id)));
  const { data: sites } = await db
    .from('sites')
    .select('site_id, site_url')
    .in('site_id', siteIds);

  const siteMap = new Map((sites ?? []).map((s: Pick<Site, 'site_id' | 'site_url'>) => [s.site_id, s.site_url]));

  return rows.map((r: ActionQueueRow) => ({
    ...r,
    site_url: siteMap.get(r.site_id) ?? r.site_id,
  }));
}
