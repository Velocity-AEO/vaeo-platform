/**
 * packages/commands/src/rollback.ts
 *
 * vaeo rollback — reverses deployed fixes using the rollback_manifest written
 * at deploy time by the patch engine.
 *
 * Per-item flow:
 *   deployed | regression_detected → loadManifest:
 *     no manifest found  → skipped (warning logged, not a failure)
 *     manifest found     → executeRollback:
 *       throws           → mark 'rollback_failed', log error, continue
 *       ok               → mark 'rolled_back', increment rolled_back
 *
 * Items in any other execution_status are counted as skipped.
 *
 * Status derivation:
 *   'completed' — failed === 0
 *   'partial'   — some failed, at least one rolled_back or skipped
 *   'failed'    — entire run failed (request validation / Supabase load)
 *                 OR all items failed rollback
 *
 * Auto-rollback flow:
 *   verify sets rollback_flagged=true on regression_detected rows.
 *   An operator runs: vaeo rollback --run-id <id> --all
 *   This command picks up those rows and reverses them.
 *
 * Never throws — always returns RollbackResult.
 */

import type { CmsType } from '../../core/types.js';
import { createLogger }  from '../../action-log/src/index.js';

// ── Item shape ────────────────────────────────────────────────────────────────

export interface RollbackableItem {
  id:               string;
  run_id:           string;
  tenant_id:        string;
  site_id:          string;
  issue_type:       string;
  url:              string;
  execution_status: string;
  cms_type?:        string;
}

// ── Manifest shape ────────────────────────────────────────────────────────────

export interface AffectedResource {
  resource_type: 'metafield' | 'theme_asset' | 'redirect' | 'post_meta' | 'page_meta';
  resource_id?:  string;
  resource_key?: string;
  before_value?: unknown;
}

export interface RollbackManifest {
  manifest_id:        string;
  run_id:             string;
  tenant_id:          string;
  cms_type?:          string;
  fields_to_reverse:  number;
  /** Ordered list of CMS fields to reverse. Empty = legacy path (no-op). */
  affected_resources?: AffectedResource[];
  created_at?:        string;
}

// ── Rollback runner result (mirrors ExecuteRollbackResult) ───────────────────

export interface RollbackRunResult {
  fields_reversed: number;
}

// ── Request / result ──────────────────────────────────────────────────────────

export interface RollbackRequest {
  run_id:        string;
  tenant_id:     string;
  site_id:       string;
  cms:           CmsType;
  /** If provided, rollback only this single action_queue item. */
  action_id?:    string;
  /** If true, rollback all deployed/regression_detected items for this run. */
  rollback_all?: boolean;
}

export interface RollbackResult {
  run_id:       string;
  site_id:      string;
  tenant_id:    string;
  rolled_back:  number;
  failed:       number;
  /** Items with no manifest, already rolled back, or non-reversible status. */
  skipped:      number;
  /** Details for every item where CMS API reversal failed. */
  failed_items: Array<{ action_id: string; url: string; error: string }>;
  completed_at: string;
  status:       'completed' | 'partial' | 'failed';
  error?:       string;
}

// ── Ops interface (injectable) ────────────────────────────────────────────────

/** Execution statuses that are eligible for rollback. */
export const ROLLBACK_ELIGIBLE = new Set(['deployed', 'regression_detected']);

export interface RollbackCommandOps {
  /** Load a single item by action_id. Returns null if not found. */
  loadItem:           (actionId: string, tenantId: string) => Promise<RollbackableItem | null>;
  /**
   * Load all items where execution_status IN ('deployed', 'regression_detected')
   * for this run_id + tenant_id.
   */
  loadDeployed:       (runId: string, tenantId: string) => Promise<RollbackableItem[]>;
  /**
   * Load the rollback manifest for an item.
   * Returns null if no manifest exists (triggers skipped path).
   */
  loadManifest:       (item: RollbackableItem) => Promise<RollbackManifest | null>;
  /**
   * Execute the rollback — reverses all patch fields to their before_value.
   * Wraps executeRollback() from packages/patch-engine/src/rollback-runner.ts.
   * Throws on failure; caller handles and marks 'rollback_failed'.
   */
  executeRollback:    (item: RollbackableItem, manifest: RollbackManifest) => Promise<RollbackRunResult>;
  /**
   * Mark execution_status='rolled_back'.
   * Non-blocking — failures are swallowed in the caller.
   */
  markRolledBack:     (itemId: string, tenantId: string) => Promise<void>;
  /**
   * Mark execution_status='rollback_failed'.
   * Non-blocking — failures are swallowed in the caller.
   */
  markRollbackFailed: (itemId: string, tenantId: string) => Promise<void>;
}

// ── Default (real) ops ────────────────────────────────────────────────────────

const realLoadItem: RollbackCommandOps['loadItem'] = async (actionId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('id', actionId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? null) as RollbackableItem | null;
};

const realLoadDeployed: RollbackCommandOps['loadDeployed'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .in('execution_status', ['deployed', 'regression_detected']);
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? []) as RollbackableItem[];
};

const realLoadManifest: RollbackCommandOps['loadManifest'] = async (item) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  // Read rollback_manifest JSONB column from action_queue — written by applyPatch()
  const { data, error } = await db
    .from('action_queue')
    .select('id, run_id, tenant_id, rollback_manifest')
    .eq('id', item.id)
    .eq('tenant_id', item.tenant_id)
    .maybeSingle();
  if (error) throw new Error(`action_queue rollback_manifest load failed: ${error.message}`);
  if (!data) return null;
  const row = data as { id: string; run_id: string; tenant_id: string; rollback_manifest: unknown };
  if (!row.rollback_manifest) return null;
  const m = row.rollback_manifest as Record<string, unknown>;
  const resources = (m['affected_resources'] as unknown[] | undefined) ?? [];
  return {
    manifest_id:       String(m['action_id'] ?? row.id),
    run_id:            String(m['run_id']    ?? row.run_id),
    tenant_id:         row.tenant_id,
    cms_type:          m['cms_type'] ? String(m['cms_type']) : undefined,
    fields_to_reverse: resources.length || 1,
    affected_resources: resources as AffectedResource[],
    created_at:        m['created_at'] ? String(m['created_at']) : undefined,
  };
};

/**
 * Dispatches one resource revert to the correct CMS API endpoint.
 *
 * Shopify:
 *   metafield   → PATCH /admin/api/2024-01/metafields/{id}.json
 *   theme_asset → PUT  /admin/api/2024-01/themes/{theme_id}/assets.json
 *   redirect    → DELETE /admin/api/2024-01/redirects/{id}.json
 *
 * WordPress:
 *   post_meta / page_meta → PATCH /wp-json/wp/v2/{posts|pages}/{id}
 */
async function realDispatchRevert(
  resource: AffectedResource,
  item:     RollbackableItem,
  cmsType:  string,
): Promise<void> {
  const rt = resource.resource_type;

  if (cmsType === 'wordpress' || rt === 'post_meta' || rt === 'page_meta') {
    const endpoint = rt === 'page_meta' ? 'pages' : 'posts';
    const wpUrl    = process.env['WP_POC_URL']          ?? '';
    const username = process.env['WP_POC_USERNAME']     ?? '';
    const password = process.env['WP_POC_APP_PASSWORD'] ?? '';
    const authB64  = Buffer.from(`${username}:${password}`).toString('base64');
    const resp = await fetch(
      `${wpUrl}/wp-json/wp/v2/${endpoint}/${resource.resource_id}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authB64}` },
        body:    JSON.stringify({ meta: { [resource.resource_key ?? '']: resource.before_value } }),
      },
    );
    if (!resp.ok) throw new Error(`WP ${rt} revert failed: ${resp.status} ${resp.statusText}`);
    return;
  }

  const storeUrl = (process.env['SHOPIFY_POC_STORE_URL'] ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token    = process.env['SHOPIFY_POC_ACCESS_TOKEN'] ?? '';
  const headers  = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };

  if (rt === 'metafield') {
    const resp = await fetch(
      `https://${storeUrl}/admin/api/2024-01/metafields/${resource.resource_id}.json`,
      { method: 'PATCH', headers, body: JSON.stringify({ metafield: { id: resource.resource_id, value: resource.before_value } }) },
    );
    if (!resp.ok) throw new Error(`Shopify metafield revert failed: ${resp.status}`);
    return;
  }

  if (rt === 'theme_asset') {
    const themeId = process.env['SHOPIFY_MAIN_THEME_ID'] ?? '';
    const resp = await fetch(
      `https://${storeUrl}/admin/api/2024-01/themes/${themeId}/assets.json`,
      { method: 'PUT', headers, body: JSON.stringify({ asset: { key: resource.resource_key, value: resource.before_value } }) },
    );
    if (!resp.ok) throw new Error(`Shopify theme_asset revert failed: ${resp.status}`);
    return;
  }

  if (rt === 'redirect') {
    const resp = await fetch(
      `https://${storeUrl}/admin/api/2024-01/redirects/${resource.resource_id}.json`,
      { method: 'DELETE', headers: { 'X-Shopify-Access-Token': token } },
    );
    // 404 = already deleted, treat as success
    if (!resp.ok && resp.status !== 404) throw new Error(`Shopify redirect delete failed: ${resp.status}`);
    return;
  }

  throw new Error(`Unknown resource_type: ${rt}`);
}

const realExecuteRollback: RollbackCommandOps['executeRollback'] = async (item, manifest) => {
  const cmsType   = manifest.cms_type ?? item.cms_type ?? 'shopify';
  const resources = manifest.affected_resources ?? [];

  if (resources.length === 0) {
    // Legacy path: no affected_resources in manifest — fall back to Shopify adapter stub
    const { revertFix } = await import('../../adapters/shopify/src/index.js');
    const result = await revertFix({
      action_id:    item.id,
      access_token: process.env['SHOPIFY_POC_ACCESS_TOKEN'] ?? '',
      store_url:    process.env['SHOPIFY_POC_STORE_URL']    ?? '',
      fix_type:     item.issue_type,
      before_value: {},
    });
    if (!result.success) throw new Error(result.error ?? 'shopify revertFix failed');
    return { fields_reversed: 1 };
  }

  let reversed = 0;
  for (const resource of resources) {
    await realDispatchRevert(resource, item, cmsType);
    process.stderr.write(`[rollback] REVERSED ${item.url} — ${resource.resource_key ?? resource.resource_type}\n`);
    reversed++;
  }
  return { fields_reversed: reversed };
};

const realMarkRolledBack: RollbackCommandOps['markRolledBack'] = async (itemId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'rolled_back', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markRolledBack failed: ${error.message}`);
};

const realMarkRollbackFailed: RollbackCommandOps['markRollbackFailed'] = async (itemId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'rollback_failed', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markRollbackFailed failed: ${error.message}`);
};

// ── runRollback ───────────────────────────────────────────────────────────────

/**
 * Main rollback entry point.
 *
 * Steps:
 *   1. Validate request.
 *   2. Load target item(s).
 *   3. For each item:
 *        - Skip if not in a rollback-eligible status.
 *        - Load manifest; skip with warning if none found.
 *        - executeRollback; mark rollback_failed + continue on throw.
 *        - markRolledBack on success.
 *   4. ActionLog rollback:complete with counts.
 *   5. Return RollbackResult — never throws.
 */
export async function runRollback(
  request:   RollbackRequest,
  _testOps?: Partial<RollbackCommandOps>,
): Promise<RollbackResult> {
  const ops: RollbackCommandOps = {
    loadItem:           realLoadItem,
    loadDeployed:       realLoadDeployed,
    loadManifest:       realLoadManifest,
    executeRollback:    realExecuteRollback,
    markRolledBack:     realMarkRolledBack,
    markRollbackFailed: realMarkRollbackFailed,
    ..._testOps,
  };

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       request.cms,
    command:   'rollback',
  });

  // ── Validate ────────────────────────────────────────────────────────────────

  if (!request.run_id)    return failedResult(request, 'run_id is required');
  if (!request.tenant_id) return failedResult(request, 'tenant_id is required');
  if (!request.site_id)   return failedResult(request, 'site_id is required');

  if (!request.action_id && !request.rollback_all) {
    return failedResult(request, 'Either --action-id or --all is required');
  }

  // ── rollback:start ──────────────────────────────────────────────────────────

  log({ stage: 'rollback:start', status: 'pending' });

  // ── Step 1: Load items ──────────────────────────────────────────────────────

  let items: RollbackableItem[];
  try {
    if (request.action_id) {
      const item = await ops.loadItem(request.action_id, request.tenant_id);
      items = item ? [item] : [];
    } else {
      items = await ops.loadDeployed(request.run_id, request.tenant_id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ stage: 'rollback:failed', status: 'failed', metadata: { error: msg } });
    return failedResult(request, msg);
  }

  // ── No items found ──────────────────────────────────────────────────────────

  if (items.length === 0) {
    const completed_at = new Date().toISOString();
    log({
      stage:    'rollback:complete',
      status:   'ok',
      metadata: { rolled_back: 0, failed: 0, skipped: 0 },
    });
    return {
      run_id:       request.run_id,
      site_id:      request.site_id,
      tenant_id:    request.tenant_id,
      rolled_back:  0,
      failed:       0,
      skipped:      0,
      failed_items: [],
      completed_at,
      status:       'completed',
    };
  }

  // ── Step 2: Process each item ───────────────────────────────────────────────

  let rolledBack = 0;
  let failed     = 0;
  let skipped    = 0;
  const failedItems: RollbackResult['failed_items'] = [];

  for (const item of items) {
    // Skip items not in a rollback-eligible status
    if (!ROLLBACK_ELIGIBLE.has(item.execution_status)) {
      log({
        stage:    'rollback:item_skipped',
        status:   'ok',
        metadata: { item_id: item.id, url: item.url, execution_status: item.execution_status, reason: 'not eligible' },
      });
      skipped++;
      continue;
    }

    // Step 2a: Load manifest
    let manifest: RollbackManifest | null;
    try {
      manifest = await ops.loadManifest(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'rollback:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, reason: `loadManifest: ${msg}` },
      });
      try { await ops.markRollbackFailed(item.id, item.tenant_id); } catch { /* non-blocking */ }
      failedItems.push({ action_id: item.id, url: item.url, error: `loadManifest: ${msg}` });
      failed++;
      continue;
    }

    // Step 2b: No manifest → skipped with warning
    if (!manifest) {
      log({
        stage:    'rollback:item_skipped',
        status:   'ok',
        metadata: { item_id: item.id, url: item.url, reason: 'no rollback manifest found' },
      });
      skipped++;
      continue;
    }

    // Step 2c: Execute rollback
    try {
      const result = await ops.executeRollback(item, manifest);
      log({
        stage:    'rollback:item_rolled_back',
        status:   'ok',
        metadata: { item_id: item.id, url: item.url, fields_reversed: result.fields_reversed },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'rollback:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, reason: msg },
      });
      try { await ops.markRollbackFailed(item.id, item.tenant_id); } catch { /* non-blocking */ }
      failedItems.push({ action_id: item.id, url: item.url, error: msg });
      failed++;
      continue;
    }

    // Step 2d: Mark rolled_back
    try { await ops.markRolledBack(item.id, item.tenant_id); } catch { /* non-blocking */ }
    rolledBack++;
  }

  // ── Derive overall status ───────────────────────────────────────────────────

  const overallStatus: RollbackResult['status'] =
    failed === 0                          ? 'completed'
    : rolledBack > 0 || skipped > 0       ? 'partial'
    : 'failed';

  const completed_at = new Date().toISOString();

  log({
    stage:    'rollback:complete',
    status:   'ok',
    metadata: { rolled_back: rolledBack, failed, skipped },
  });

  return {
    run_id:       request.run_id,
    site_id:      request.site_id,
    tenant_id:    request.tenant_id,
    rolled_back:  rolledBack,
    failed,
    skipped,
    failed_items: failedItems,
    completed_at,
    status:       overallStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failedResult(req: RollbackRequest, error: string): RollbackResult {
  return {
    run_id:       req.run_id    ?? '',
    site_id:      req.site_id   ?? '',
    tenant_id:    req.tenant_id ?? '',
    rolled_back:  0,
    failed:       0,
    skipped:      0,
    failed_items: [],
    completed_at: new Date().toISOString(),
    status:       'failed',
    error,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

export async function runRollbackCli(opts: {
  runId:       string;
  tenantId:    string;
  siteId:      string;
  cms:         CmsType;
  actionId?:   string;
  all?:        boolean;
}): Promise<void> {
  const result = await runRollback({
    run_id:       opts.runId,
    tenant_id:    opts.tenantId,
    site_id:      opts.siteId,
    cms:          opts.cms,
    action_id:    opts.actionId,
    rollback_all: opts.all,
  });

  if (result.status !== 'failed' || result.error === undefined) {
    console.log(
      `${result.status === 'completed' ? '✓' : '⚠'} Rollback ${result.status} — ` +
      `${result.rolled_back} reversed, ${result.failed} failed, ${result.skipped} skipped`,
    );
  } else {
    console.error(`✗ Rollback failed: ${result.error}`);
    process.exitCode = 1;
  }
}
