/**
 * packages/commands/src/promote.ts
 *
 * vaeo promote — human approval gate for fixes sitting in pending_approval.
 *
 * Promote re-validates each item before touching live (the site may have
 * changed since the original audit), then applies the fix to the live CMS
 * and marks the row 'deployed'. Items that fail re-validation or whose patch
 * engine call throws are marked 'failed' and do not block the others.
 *
 * Per-item flow:
 *   pending_approval → runValidators(re-check live url):
 *     validators fail  → mark 'failed', continue
 *     validators pass  → applyLive:
 *       applyLive throws → mark 'failed', continue
 *       applyLive ok     → markDeployed (execution_status='deployed',
 *                          approved_at=now()), writeProof, increment promoted
 *
 * Items already at execution_status other than 'pending_approval' are counted
 * as skipped (not re-processed).
 *
 * Status derivation:
 *   'completed' — failed === 0
 *   'partial'   — some failed, at least one promoted or skipped
 *   'failed'    — entire run failed (request validation / Supabase load)
 *
 * Never throws — always returns PromoteResult.
 */

import { createLogger } from '../../action-log/src/index.js';

// ── Queue item shape ──────────────────────────────────────────────────────────

export interface PendingItem {
  id:               string;
  run_id:           string;
  tenant_id:        string;
  site_id:          string;
  issue_type:       string;
  url:              string;
  risk_score:       number;
  category:         string;
  proposed_fix:     Record<string, unknown>;
  execution_status: string;
}

// ── Validator result (same shape as verify/optimize) ─────────────────────────

export interface RevalidateResult {
  url:      string;
  passed:   boolean;
  failures: string[];
}

// ── Request / result ──────────────────────────────────────────────────────────

export interface PromoteRequest {
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  /** If provided, promote only this single action_queue item. */
  action_id?:   string;
  /** If true, promote all pending_approval items for this run. */
  promote_all?: boolean;
}

export interface PromoteResult {
  run_id:       string;
  site_id:      string;
  tenant_id:    string;
  promoted:     number;
  failed:       number;
  /** Items already deployed or not in pending_approval state. */
  skipped:      number;
  completed_at: string;
  status:       'completed' | 'partial' | 'failed';
  error?:       string;
}

// ── Ops interface (injectable) ────────────────────────────────────────────────

export interface PromoteCommandOps {
  /**
   * Load a single item by action_id.
   * Returns null if not found or not owned by tenant.
   */
  loadItem:       (actionId: string, tenantId: string) => Promise<PendingItem | null>;
  /**
   * Load all items with execution_status='pending_approval' for this run.
   */
  loadPending:    (runId: string, tenantId: string) => Promise<PendingItem[]>;
  /** Re-run validators against the live URL to confirm fix is still valid. */
  runValidators:  (item: PendingItem) => Promise<RevalidateResult>;
  /** Apply the fix directly to the live CMS (not sandbox). */
  applyLive:      (item: PendingItem) => Promise<void>;
  /**
   * Mark execution_status='deployed' and record approved_at timestamp.
   * Non-blocking — failures are swallowed in the caller.
   */
  markDeployed:   (itemId: string, tenantId: string, approvedAt: string) => Promise<void>;
  /**
   * Mark execution_status='failed'.
   * Non-blocking — failures are swallowed in the caller.
   */
  markFailed:     (itemId: string, tenantId: string) => Promise<void>;
  /**
   * Write a proof artifact record (URL, promoted_at, promoted_by=operator).
   * Non-blocking — failures are swallowed in the caller.
   */
  writeProof:     (item: PendingItem, promotedAt: string) => Promise<void>;
}

// ── Default (real) ops ────────────────────────────────────────────────────────

const realLoadItem: PromoteCommandOps['loadItem'] = async (actionId, tenantId) => {
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
  return (data ?? null) as PendingItem | null;
};

const realLoadPending: PromoteCommandOps['loadPending'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('execution_status', 'pending_approval');
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? []) as PendingItem[];
};

const realRunValidators: PromoteCommandOps['runValidators'] = async (item) => {
  throw new Error(`realRunValidators: not configured for ${item.url} — inject via _testOps`);
};

const realApplyLive: PromoteCommandOps['applyLive'] = async (_item) => {
  throw new Error('realApplyLive: PatchEngine not configured — inject via _testOps');
};

const realMarkDeployed: PromoteCommandOps['markDeployed'] = async (itemId, tenantId, approvedAt) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'deployed', approved_at: approvedAt, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markDeployed failed: ${error.message}`);
};

const realMarkFailed: PromoteCommandOps['markFailed'] = async (itemId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markFailed failed: ${error.message}`);
};

const realWriteProof: PromoteCommandOps['writeProof'] = async (_item, _promotedAt) => {
  // Real implementation writes a proof_artifacts row to Supabase.
  // Injected in tests.
};

// ── runPromote ────────────────────────────────────────────────────────────────

/**
 * Main promote entry point.
 *
 * Steps:
 *   1. Validate request.
 *   2. Load target item(s) — single action_id or all pending_approval.
 *   3. For each item:
 *        - Skip if not in pending_approval state.
 *        - Re-run validators; mark failed + continue if they fail.
 *        - Apply to live; mark failed + continue if it throws.
 *        - markDeployed, writeProof, increment promoted.
 *   4. ActionLog promote:complete with counts.
 *   5. Return PromoteResult — never throws.
 */
export async function runPromote(
  request:   PromoteRequest,
  _testOps?: Partial<PromoteCommandOps>,
): Promise<PromoteResult> {
  const ops: PromoteCommandOps = {
    loadItem:      realLoadItem,
    loadPending:   realLoadPending,
    runValidators: realRunValidators,
    applyLive:     realApplyLive,
    markDeployed:  realMarkDeployed,
    markFailed:    realMarkFailed,
    writeProof:    realWriteProof,
    ..._testOps,
  };

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    command:   'promote',
  });

  // ── Validate ────────────────────────────────────────────────────────────────

  if (!request.run_id)    return failedResult(request, 'run_id is required');
  if (!request.tenant_id) return failedResult(request, 'tenant_id is required');
  if (!request.site_id)   return failedResult(request, 'site_id is required');

  if (!request.action_id && !request.promote_all) {
    return failedResult(request, 'Either --action-id or --all is required');
  }

  // ── promote:start ───────────────────────────────────────────────────────────

  log({ stage: 'promote:start', status: 'pending' });

  // ── Step 1: Load items ──────────────────────────────────────────────────────

  let items: PendingItem[];
  try {
    if (request.action_id) {
      const item = await ops.loadItem(request.action_id, request.tenant_id);
      items = item ? [item] : [];
    } else {
      items = await ops.loadPending(request.run_id, request.tenant_id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ stage: 'promote:failed', status: 'failed', metadata: { error: msg } });
    return failedResult(request, msg);
  }

  // ── No items found ──────────────────────────────────────────────────────────

  if (items.length === 0) {
    const completed_at = new Date().toISOString();
    log({
      stage:    'promote:complete',
      status:   'ok',
      metadata: { promoted: 0, failed: 0, skipped: 0 },
    });
    return {
      run_id:       request.run_id,
      site_id:      request.site_id,
      tenant_id:    request.tenant_id,
      promoted:     0,
      failed:       0,
      skipped:      0,
      completed_at,
      status:       'completed',
    };
  }

  // ── Step 2: Process each item ───────────────────────────────────────────────

  let promoted = 0;
  let failed   = 0;
  let skipped  = 0;

  for (const item of items) {
    // Skip if not in pending_approval state
    if (item.execution_status !== 'pending_approval') {
      log({
        stage:    'promote:item_skipped',
        status:   'ok',
        metadata: { item_id: item.id, url: item.url, execution_status: item.execution_status },
      });
      skipped++;
      continue;
    }

    // Step 2a: Re-run validators
    let validation: RevalidateResult;
    try {
      validation = await ops.runValidators(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'promote:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, reason: `runValidators: ${msg}` },
      });
      try { await ops.markFailed(item.id, item.tenant_id); } catch { /* non-blocking */ }
      failed++;
      continue;
    }

    // Step 2b: Validator failure → skip promotion
    if (!validation.passed) {
      log({
        stage:    'promote:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, failures: validation.failures },
      });
      try { await ops.markFailed(item.id, item.tenant_id); } catch { /* non-blocking */ }
      failed++;
      continue;
    }

    // Step 2c: Apply to live
    try {
      await ops.applyLive(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'promote:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, reason: `applyLive: ${msg}` },
      });
      try { await ops.markFailed(item.id, item.tenant_id); } catch { /* non-blocking */ }
      failed++;
      continue;
    }

    // Step 2d–e: Mark deployed + write proof
    const approvedAt = new Date().toISOString();
    try { await ops.markDeployed(item.id, item.tenant_id, approvedAt); } catch { /* non-blocking */ }
    try { await ops.writeProof(item, approvedAt);                       } catch { /* non-blocking */ }

    log({
      stage:    'promote:item_promoted',
      status:   'ok',
      metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, approved_at: approvedAt },
    });
    promoted++;
  }

  // ── Derive overall status ───────────────────────────────────────────────────

  const overallStatus: PromoteResult['status'] =
    failed === 0 ? 'completed' : promoted > 0 || skipped > 0 ? 'partial' : 'failed';

  const completed_at = new Date().toISOString();

  log({
    stage:    'promote:complete',
    status:   'ok',
    metadata: { promoted, failed, skipped },
  });

  return {
    run_id:       request.run_id,
    site_id:      request.site_id,
    tenant_id:    request.tenant_id,
    promoted,
    failed,
    skipped,
    completed_at,
    status:       overallStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failedResult(req: PromoteRequest, error: string): PromoteResult {
  return {
    run_id:       req.run_id    ?? '',
    site_id:      req.site_id   ?? '',
    tenant_id:    req.tenant_id ?? '',
    promoted:     0,
    failed:       0,
    skipped:      0,
    completed_at: new Date().toISOString(),
    status:       'failed',
    error,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

export async function runPromoteCli(opts: {
  runId:      string;
  tenantId:   string;
  siteId:     string;
  actionId?:  string;
  all?:       boolean;
}): Promise<void> {
  const result = await runPromote({
    run_id:       opts.runId,
    tenant_id:    opts.tenantId,
    site_id:      opts.siteId,
    action_id:    opts.actionId,
    promote_all:  opts.all,
  });

  if (result.status !== 'failed' || result.error === undefined) {
    console.log(
      `${result.status === 'completed' ? '✓' : '⚠'} Promote ${result.status} — ` +
      `${result.promoted} promoted, ${result.failed} failed, ${result.skipped} skipped`,
    );
  } else {
    console.error(`✗ Promote failed: ${result.error}`);
    process.exitCode = 1;
  }
}
