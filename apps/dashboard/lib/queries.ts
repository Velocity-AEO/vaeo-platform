import { createServerClient } from './supabase';
import type { ActionQueueRow, CommandCenterRow, CommandCenterStats, DashboardStats, RunSummary, Site, SiteWithStats } from './types';
import { calculateHealthScore } from '@vaeo/scoring';

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

    // Pending approval — items routed to human review
    db.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('execution_status', 'pending_approval'),

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
 * Returns the most recent runs from action_log stage='crawl:complete'.
 * crawl:complete fires exactly once per run, so no deduplication needed.
 */
export async function getRecentRuns(limit = 20): Promise<RunSummary[]> {
  const db = createServerClient();

  const { data: logs } = await db
    .from('action_log')
    .select('run_id, site_id, cms_type, status, ts')
    .eq('stage', 'crawl:complete')
    .order('ts', { ascending: false })
    .limit(limit);

  if (!logs?.length) return [];

  const siteIds = Array.from(new Set(logs.map(l => l.site_id))).filter(Boolean);
  const runIds  = logs.map(l => l.run_id);

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

  return logs.map(log => {
    const site   = siteMap.get(log.site_id);
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

  // Build reverse map: run_id → site_id (for scoping issues to latest run only)
  const runIdToSiteId = new Map<string, string>();
  for (const [siteId, { run_id }] of Array.from(latestBySite)) {
    runIdToSiteId.set(run_id, siteId);
  }
  const latestRunIds = Array.from(runIdToSiteId.keys());

  // Open action_queue issues scoped to the most recent run per site
  const issuesBySite  = new Map<string, number>();
  const issueTypeBySite = new Map<string, Array<{ issue_type: string }>>();

  if (latestRunIds.length > 0) {
    const { data: issueRows } = await db
      .from('action_queue')
      .select('run_id, issue_type')
      .in('run_id', latestRunIds)
      .in('execution_status', ['queued', 'pending_approval', 'failed']);

    for (const row of issueRows ?? []) {
      const siteId = runIdToSiteId.get(row.run_id);
      if (!siteId) continue;
      issuesBySite.set(siteId, (issuesBySite.get(siteId) ?? 0) + 1);
      const arr = issueTypeBySite.get(siteId) ?? [];
      arr.push({ issue_type: row.issue_type });
      issueTypeBySite.set(siteId, arr);
    }
  }

  return sites.map((s: Site) => {
    const latest = latestBySite.get(s.site_id);
    const health = calculateHealthScore(issueTypeBySite.get(s.site_id) ?? []);
    return {
      ...s,
      last_run_at:   latest?.ts      ?? null,
      last_run_id:   latest?.run_id  ?? null,
      total_issues:  issuesBySite.get(s.site_id) ?? 0,
      health_score:  health,
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
    .in('execution_status', ['queued', 'pending_approval', 'deployed', 'failed', 'rolled_back'])
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

// ── Monitor regressions ────────────────────────────────────────────────────────

/**
 * Count of monitor_results detected in the last 7 days for this tenant.
 * Used by the dashboard home regressions stat card.
 */
export async function getRegressionsCount(tenantId = '00000000-0000-0000-0000-000000000001'): Promise<number> {
  const db    = createServerClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from('monitor_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('detected_at', since);
  return count ?? 0;
}

export async function getCommandCenterStats(): Promise<CommandCenterStats> {
  const db = createServerClient();

  const [pendingRes, deployedRes, rolledBackRes, failedRes] = await Promise.all([
    db.from('action_queue').select('id', { count: 'exact', head: true })
      .eq('execution_status', 'pending_approval'),
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
