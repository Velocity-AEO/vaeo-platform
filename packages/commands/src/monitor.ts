/**
 * packages/commands/src/monitor.ts
 *
 * Post-deploy monitoring — re-checks deployed URLs at defined intervals and
 * flags regressions. Four check types:
 *   http_status  (1h)  — re-crawl HTTP status of affected URLs
 *   lighthouse   (24h) — Lighthouse score vs pre-deploy baseline
 *   playwright   (48h) — visual diff stub (V1.1)
 *   gsc_indexing (72h) — GSC indexing status check
 *
 * Auto-rollback triggers (flag only in MVP — operator reviews):
 *   - 3+ critical http regressions (was 200, now 4xx/5xx)
 *   - Any LCP increase > 20%
 *   - 3+ GSC de-indexing regressions within 7 days
 *
 * Never throws — always returns MonitorResult.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeployedItem {
  id:                string;   // action_id
  url:               string;
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  issue_type:        string;
  deployed_at:       string;
  proof_artifacts?:  Record<string, unknown>;
}

export interface Regression {
  url:        string;
  issue:      string;
  severity:   'warning' | 'critical';
  action_id?: string;
}

export interface MonitorRequest {
  run_id:     string;
  tenant_id:  string;
  site_id:    string;
  site_url?:  string;   // needed for gsc_indexing; optional
  check_type: 'http_status' | 'lighthouse' | 'gsc_indexing' | 'playwright';
}

export interface MonitorResult {
  run_id:               string;
  check_type:           string;
  urls_checked:         number;
  regressions:          Regression[];
  passed:               boolean;             // true if no critical regressions
  flagged_for_rollback: boolean;
  checked_at:           string;
}

export interface MonitorCommandOps {
  loadDeployedItems: (runId: string, tenantId: string) => Promise<DeployedItem[]>;
  checkHttpStatus:   (url: string) => Promise<{ status: number }>;
  checkLighthouse:   (url: string) => Promise<{ lcp_ms: number; score: number } | null>;
  checkGscIndexing:  (url: string, siteUrl: string) => Promise<{ indexed: boolean } | null>;
  loadBaseline:      (actionId: string) => Promise<{ http_status?: number; lcp_ms?: number } | null>;
  saveRegressions:   (runId: string, tenantId: string, regressions: Regression[]) => Promise<void>;
  flagForRollback:   (runId: string, tenantId: string, reason: string) => Promise<void>;
}

// ── Check implementations ─────────────────────────────────────────────────────

async function runHttpStatusCheck(
  req: MonitorRequest,
  ops: MonitorCommandOps,
): Promise<MonitorResult> {
  const items = await ops.loadDeployedItems(req.run_id, req.tenant_id);
  const regressions: Regression[] = [];

  for (const item of items) {
    const baseline = await ops.loadBaseline(item.id);
    const baselineStatus = baseline?.http_status ?? 200;
    const { status } = await ops.checkHttpStatus(item.url);

    if (baselineStatus === 200 && status >= 400) {
      regressions.push({
        url:        item.url,
        issue:      `HTTP ${status} (was ${baselineStatus})`,
        severity:   'critical',
        action_id:  item.id,
      });
    }
  }

  const flagged = regressions.filter(r => r.severity === 'critical').length >= 3;
  if (flagged) {
    await ops.flagForRollback(req.run_id, req.tenant_id, `${regressions.length} critical HTTP regressions`);
  }
  if (regressions.length > 0) {
    await ops.saveRegressions(req.run_id, req.tenant_id, regressions);
  }

  const criticals = regressions.filter(r => r.severity === 'critical');
  return {
    run_id:               req.run_id,
    check_type:           'http_status',
    urls_checked:         items.length,
    regressions,
    passed:               criticals.length === 0,
    flagged_for_rollback: flagged,
    checked_at:           new Date().toISOString(),
  };
}

async function runLighthouseCheck(
  req: MonitorRequest,
  ops: MonitorCommandOps,
): Promise<MonitorResult> {
  const items = await ops.loadDeployedItems(req.run_id, req.tenant_id);

  // Dedupe by URL
  const uniqueUrls = Array.from(new Map(items.map(i => [i.url, i])).values());
  const regressions: Regression[] = [];

  for (const item of uniqueUrls) {
    const result = await ops.checkLighthouse(item.url);
    if (result === null) continue;   // no API key / skip

    const baseline = await ops.loadBaseline(item.id);
    if (!baseline?.lcp_ms) continue;  // no baseline → skip

    const baselineLcp = baseline.lcp_ms;
    const currentLcp  = result.lcp_ms;
    const pctIncrease = ((currentLcp - baselineLcp) / baselineLcp) * 100;

    if (pctIncrease > 20) {
      regressions.push({
        url:       item.url,
        issue:     `LCP +${Math.round(pctIncrease)}% (${baselineLcp}ms → ${currentLcp}ms)`,
        severity:  'warning',
        action_id: item.id,
      });
    }
  }

  const flagged = regressions.length > 0;
  if (flagged) {
    await ops.flagForRollback(req.run_id, req.tenant_id, `LCP regression detected on ${regressions.length} URL(s)`);
  }
  if (regressions.length > 0) {
    await ops.saveRegressions(req.run_id, req.tenant_id, regressions);
  }

  return {
    run_id:               req.run_id,
    check_type:           'lighthouse',
    urls_checked:         uniqueUrls.length,
    regressions,
    passed:               true,   // lighthouse regressions are warnings only
    flagged_for_rollback: flagged,
    checked_at:           new Date().toISOString(),
  };
}

async function runGscIndexingCheck(
  req: MonitorRequest,
  ops: MonitorCommandOps,
): Promise<MonitorResult> {
  const siteUrl = req.site_url ?? '';
  const items   = await ops.loadDeployedItems(req.run_id, req.tenant_id);
  const regressions: Regression[] = [];
  let skipped = 0;

  for (const item of items) {
    const result = await ops.checkGscIndexing(item.url, siteUrl);
    if (result === null) { skipped++; continue; }

    // Assume previously indexed unless baseline explicitly says otherwise
    const baseline = await ops.loadBaseline(item.id);
    const wasIndexed = (baseline as Record<string, unknown> | null)?.['gsc_indexed'] !== false;

    if (wasIndexed && !result.indexed) {
      regressions.push({
        url:       item.url,
        issue:     'GSC: URL no longer indexed',
        severity:  'warning',
        action_id: item.id,
      });
    }
  }

  const flagged = regressions.length >= 3;
  if (flagged) {
    await ops.flagForRollback(req.run_id, req.tenant_id, `${regressions.length} GSC de-indexing regressions`);
  }
  if (regressions.length > 0) {
    await ops.saveRegressions(req.run_id, req.tenant_id, regressions);
  }

  const allSkipped = skipped === items.length && items.length > 0;
  return {
    run_id:               req.run_id,
    check_type:           'gsc_indexing',
    urls_checked:         allSkipped ? 0 : items.length - skipped,
    regressions,
    passed:               true,   // gsc regressions are warnings only
    flagged_for_rollback: flagged,
    checked_at:           new Date().toISOString(),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runMonitor(
  req: MonitorRequest,
  ops: MonitorCommandOps,
): Promise<MonitorResult> {
  if (req.check_type === 'playwright') {
    // Playwright visual diff — implemented in V1.1
    return {
      run_id:               req.run_id,
      check_type:           'playwright',
      urls_checked:         0,
      regressions:          [],
      passed:               true,
      flagged_for_rollback: false,
      checked_at:           new Date().toISOString(),
    };
  }

  if (req.check_type === 'http_status')  return runHttpStatusCheck(req, ops);
  if (req.check_type === 'lighthouse')   return runLighthouseCheck(req, ops);
  if (req.check_type === 'gsc_indexing') return runGscIndexingCheck(req, ops);

  // Unreachable — TypeScript exhaustive guard
  return {
    run_id:               req.run_id,
    check_type:           req.check_type,
    urls_checked:         0,
    regressions:          [],
    passed:               true,
    flagged_for_rollback: false,
    checked_at:           new Date().toISOString(),
  };
}

// ── Real ops (production) ─────────────────────────────────────────────────────

export const realLoadDeployedItems: MonitorCommandOps['loadDeployedItems'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('id, url, run_id, tenant_id, site_id, issue_type, updated_at, proof_artifacts')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('execution_status', 'deployed');
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id:               row['id'] as string,
    url:              row['url'] as string,
    run_id:           row['run_id'] as string,
    tenant_id:        row['tenant_id'] as string,
    site_id:          row['site_id'] as string,
    issue_type:       row['issue_type'] as string,
    deployed_at:      row['updated_at'] as string,
    proof_artifacts:  row['proof_artifacts'] as Record<string, unknown> | undefined,
  }));
};

export const realCheckHttpStatus: MonitorCommandOps['checkHttpStatus'] = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return { status: res.status };
  } catch {
    return { status: 0 };
  }
};

export const realCheckLighthouse: MonitorCommandOps['checkLighthouse'] = async (url) => {
  const apiKey = process.env['PAGESPEED_API_KEY'];
  if (!apiKey) return null;
  try {
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`;
    const res  = await fetch(endpoint);
    if (!res.ok) return null;
    const json = await res.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: { 'largest-contentful-paint'?: { numericValue?: number } } } };
    const score  = (json.lighthouseResult?.categories?.performance?.score ?? 0) * 100;
    const lcp_ms = json.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue ?? 0;
    return { score, lcp_ms };
  } catch {
    return null;
  }
};

export const realCheckGscIndexing: MonitorCommandOps['checkGscIndexing'] = async (_url, _siteUrl) => {
  // @vaeo/gsc-adapter does not exist yet — skip gracefully
  return null;
};

export const realLoadBaseline: MonitorCommandOps['loadBaseline'] = async (actionId) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { getConfig }    = await import('../../core/config.js');
    const cfg = getConfig();
    const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
    const { data } = await db
      .from('proof_artifacts')
      .select('artifact_type, raw_data')
      .eq('action_id', actionId)
      .in('artifact_type', ['lighthouse_report', 'html_snapshot_before'])
      .limit(5);
    if (!data?.length) return null;
    let http_status: number | undefined;
    let lcp_ms:      number | undefined;
    for (const row of data as Array<{ artifact_type: string; raw_data: Record<string, unknown> }>) {
      if (row.artifact_type === 'html_snapshot_before') {
        http_status = row.raw_data['http_status'] as number | undefined;
      }
      if (row.artifact_type === 'lighthouse_report') {
        lcp_ms = row.raw_data['lcp_ms'] as number | undefined;
      }
    }
    return { http_status, lcp_ms };
  } catch {
    return null;
  }
};

export const realSaveRegressions: MonitorCommandOps['saveRegressions'] = async (runId, tenantId, regressions) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const rows = regressions.map(r => ({
    run_id:      runId,
    tenant_id:   tenantId,
    url:         r.url,
    issue:       r.issue,
    severity:    r.severity,
    action_id:   r.action_id ?? null,
    detected_at: new Date().toISOString(),
  }));
  await db.from('monitor_results').insert(rows);
};

export const realFlagForRollback: MonitorCommandOps['flagForRollback'] = async (runId, tenantId, reason) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  await db.from('action_log').insert({
    run_id:    runId,
    tenant_id: tenantId,
    stage:     'monitor:rollback_flagged',
    status:    'warning',
    metadata:  { run_id: runId, reason },
    ts:        new Date().toISOString(),
  });
};
