import { createServerClient } from './supabase';
import type { ActionQueueRow, CommandCenterRow, CommandCenterStats, DashboardStats, RunSummary, Site, SiteWithStats } from './types';

// ── Dashboard home ────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = createServerClient();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);   // UTC midnight — matches action_log.ts stored as UTC ISO
  const todayIso  = today.toISOString();
  const minus24h  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Runs today — distinct run_ids in action_log where stage='crawl:complete' and ts >= today
  const { data: todayLogs } = await db
    .from('action_log')
    .select('run_id')
    .eq('stage', 'crawl:complete')
    .gte('ts', todayIso);

  const distinctRuns = new Set((todayLogs ?? []).map((r: { run_id: string }) => r.run_id));

  const [deployedRes, pendingRes, regressionRes] = await Promise.all([
    // Fixes deployed today
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'deployed')
      .gte('updated_at', todayIso),

    // Pending approval — queued + approval_required (open items, all time)
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'queued')
      .eq('approval_required', true),

    // Failed fixes in last 24 h (true failures, not intentional rollbacks)
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'failed')
      .gte('updated_at', minus24h),
  ]);

  return {
    total_runs_today:       distinctRuns.size,
    fixes_deployed_today:   deployedRes.count  ?? 0,
    fixes_pending_approval: pendingRes.count   ?? 0,
    active_regressions:     regressionRes.count ?? 0,  // now counts 'failed' not 'rolled_back'
  };
}

// ── Recent / all runs ─────────────────────────────────────────────────────────

/**
 * Returns runs derived from action_log stage='crawl:complete' entries.
 * Each run is the most-recent action_log entry for that run_id.
 */
export async function getRecentRuns(limit = 20): Promise<RunSummary[]> {
  const db = createServerClient();

  // Overfetch so we can deduplicate by run_id
  const { data: logs } = await db
    .from('action_log')
    .select('run_id, site_id, cms_type, status, ts')
    .eq('stage', 'crawl:complete')
    .order('ts', { ascending: false })
    .limit(limit * 5);

  if (!logs?.length) return [];

  // Deduplicate — keep first (most recent) entry per run_id
  const seen = new Set<string>();
  const deduped: typeof logs = [];
  for (const log of logs) {
    if (!seen.has(log.run_id)) {
      seen.add(log.run_id);
      deduped.push(log);
      if (deduped.length >= limit) break;
    }
  }

  const siteIds = Array.from(new Set(deduped.map(l => l.site_id))).filter(Boolean);
  const runIds  = deduped.map(l => l.run_id);

  const [sitesRes, crawlRes, fixRes] = await Promise.all([
    db.from('sites').select('site_id, site_url, cms_type').in('site_id', siteIds),
    db.from('crawl_results').select('run_id').in('run_id', runIds),
    db.from('action_queue').select('run_id').in('run_id', runIds).eq('execution_status', 'deployed'),
  ]);

  const siteMap = new Map(
    (sitesRes.data ?? []).map((s: Pick<Site, 'site_id' | 'site_url' | 'cms_type'>) => [s.site_id, s]),
  );

  const urlsByRun = new Map<string, number>();
  for (const r of crawlRes.data ?? []) {
    urlsByRun.set(r.run_id, (urlsByRun.get(r.run_id) ?? 0) + 1);
  }

  const fixesByRun = new Map<string, number>();
  for (const r of fixRes.data ?? []) {
    fixesByRun.set(r.run_id, (fixesByRun.get(r.run_id) ?? 0) + 1);
  }

  return deduped.map(log => {
    const site = siteMap.get(log.site_id);
    // Map action_log status ('ok' -> 'completed') for StatusBadge
    const status = log.status === 'ok' ? 'completed' : (log.status ?? 'partial');
    return {
      run_id:         log.run_id,
      site_url:       site?.site_url ?? log.site_id,
      cms_type:       site?.cms_type ?? (log.cms_type as string) ?? 'shopify',
      status,
      urls_crawled:   urlsByRun.get(log.run_id) ?? 0,
      fixes_deployed: fixesByRun.get(log.run_id) ?? 0,
      started_at:     log.ts,
      site_id:        log.site_id,
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

// ── Sites list ────────────────────────────────────────────────────────────────

export async function getAllSites(): Promise<SiteWithStats[]> {
  const db = createServerClient();

  const { data: sites } = await db
    .from('sites')
    .select('*')
    .order('created_at', { ascending: false });

  if (!sites?.length) return [];

  const siteIds = sites.map((s: Site) => s.site_id);

  // Latest crawl per site from action_log
  const { data: logRows } = await db
    .from('action_log')
    .select('site_id, run_id, ts')
    .in('site_id', siteIds)
    .eq('stage', 'crawl:complete')
    .order('ts', { ascending: false });

  const latestBySite = new Map<string, { run_id: string; ts: string }>();
  for (const row of logRows ?? []) {
    if (!latestBySite.has(row.site_id)) {
      latestBySite.set(row.site_id, { run_id: row.run_id, ts: row.ts });
    }
  }

  // Total action_queue issues per site
  const { data: issueRows } = await db
    .from('action_queue')
    .select('site_id')
    .in('site_id', siteIds);

  const issuesBySite = new Map<string, number>();
  for (const row of issueRows ?? []) {
    issuesBySite.set(row.site_id, (issuesBySite.get(row.site_id) ?? 0) + 1);
  }

  return sites.map((s: Site) => {
    const latest = latestBySite.get(s.site_id);
    return {
      ...s,
      last_run_at:  latest?.ts      ?? null,
      last_run_id:  latest?.run_id  ?? null,
      total_issues: issuesBySite.get(s.site_id) ?? 0,
    };
  });
}

// ── Single run summary ────────────────────────────────────────────────────────

/** Reconstruct a RunSummary for a specific run_id from action_log. */
export async function getRunSummary(runId: string): Promise<RunSummary | null> {
  const db = createServerClient();

  const { data: logs } = await db
    .from('action_log')
    .select('run_id, site_id, cms_type, status, ts')
    .eq('run_id', runId)
    .eq('stage', 'crawl:complete')
    .order('ts', { ascending: false })
    .limit(1);

  if (!logs?.length) return null;
  const log = logs[0];

  const [siteRes, crawlRes, fixRes] = await Promise.all([
    db.from('sites').select('site_url, cms_type').eq('site_id', log.site_id).limit(1),
    db.from('crawl_results').select('crawl_id').eq('run_id', runId),
    db.from('action_queue').select('id').eq('run_id', runId).eq('execution_status', 'deployed'),
  ]);

  const site = siteRes.data?.[0];
  const status = log.status === 'ok' ? 'completed' : (log.status ?? 'partial');

  return {
    run_id:         runId,
    site_url:       site?.site_url ?? log.site_id,
    cms_type:       site?.cms_type ?? (log.cms_type as string) ?? 'shopify',
    status,
    urls_crawled:   crawlRes.data?.length ?? 0,
    fixes_deployed: fixRes.data?.length ?? 0,
    started_at:     log.ts,
    site_id:        log.site_id,
  };
}

// ── Command Center ────────────────────────────────────────────────────────────

/** All action_queue rows across all statuses, enriched with site_url. */
export async function getCommandCenterItems(): Promise<CommandCenterRow[]> {
  const db = createServerClient();

  const { data: rows } = await db
    .from('action_queue')
    .select('*')
    .in('execution_status', ['queued', 'deployed', 'failed', 'rolled_back'])
    .order('priority', { ascending: true })
    .order('risk_score', { ascending: false });

  if (!rows?.length) return [];

  const siteIds = Array.from(new Set(rows.map((r: ActionQueueRow) => r.site_id))).filter(Boolean);
  const { data: sites } = await db
    .from('sites')
    .select('site_id, site_url')
    .in('site_id', siteIds);

  const siteMap = new Map(
    (sites ?? []).map((s: Pick<Site, 'site_id' | 'site_url'>) => [s.site_id, s.site_url]),
  );

  return (rows as ActionQueueRow[]).map(r => ({
    ...r,
    site_url: siteMap.get(r.site_id) ?? r.site_id,
  }));
}

export async function getCommandCenterStats(): Promise<CommandCenterStats> {
  const db = createServerClient();

  const [pendingRes, deployedRes, rolledBackRes, failedRes] = await Promise.all([
    db.from('action_queue').select('id', { count: 'exact', head: true })
      .eq('execution_status', 'queued').eq('approval_required', true),
    db.from('action_queue').select('id', { count: 'exact', head: true })
      .eq('execution_status', 'deployed'),
    db.from('action_queue').select('id', { count: 'exact', head: true })
      .eq('execution_status', 'rolled_back'),
    db.from('action_queue').select('id', { count: 'exact', head: true })
      .eq('execution_status', 'failed'),
  ]);

  return {
    pending_approval: pendingRes.count  ?? 0,
    deployed:         deployedRes.count ?? 0,
    rolled_back:      rolledBackRes.count ?? 0,
    failed:           failedRes.count   ?? 0,
  };
}
