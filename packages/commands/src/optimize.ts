/**
 * packages/commands/src/optimize.ts
 *
 * vaeo optimize — reads the action_queue, applies fixes in guardrail priority
 * order through the patch engine, runs the validator ladder, routes high-risk
 * items to approval, and auto-deploys low-risk items.
 *
 * Per-item status transitions:
 *   queued → applyFix → runValidators:
 *     validators fail            → 'failed'       (continue to next item)
 *     applyFix throws            → 'failed'        (continue to next item)
 *     pass + approval_required   → 'pending_approval'
 *     pass + risk > max_risk     → 'pending_approval'
 *     pass + risk within range   → 'deployed'
 *
 * Validator ladder (runs in order, first failure stops the ladder):
 *   lighthouse → w3c → schema → axe → visual-diff
 *
 * Never throws — always returns OptimizeResult.
 */

import type { CmsType } from '../../core/types.js';
import { createLogger }  from '../../action-log/src/index.js';

// ── Queue item shape (loaded from Supabase action_queue) ──────────────────────

export interface ActionQueueItem {
  id:               string;
  run_id:           string;
  tenant_id:        string;
  site_id:          string;
  issue_type:       string;
  url:              string;
  risk_score:       number;
  priority:         number;
  category:         string;
  proposed_fix:     Record<string, unknown>;
  approval_required: boolean;
  auto_deploy:      boolean;
  execution_status: string;
}

// ── Validator ladder result ───────────────────────────────────────────────────

export interface ValidatorSuiteResult {
  url:      string;
  passed:   boolean;
  /** Names of validators that did not pass, in ladder order. */
  failures: string[];
}

// ── Request / result ──────────────────────────────────────────────────────────

export interface OptimizeRequest {
  run_id:               string;
  tenant_id:            string;
  site_id:              string;
  /** Items with risk_score ≤ this value deploy automatically. Default: 3. */
  auto_approve_max_risk?: number;
}

export interface OptimizeResult {
  run_id:                  string;
  site_id:                 string;
  tenant_id:               string;
  fixes_attempted:         number;
  fixes_deployed:          number;
  fixes_pending_approval:  number;
  fixes_failed:            number;
  completed_at:            string;
  /** completed = zero failures; partial = some failed; failed = entire run failed. */
  status:                  'completed' | 'partial' | 'failed';
  error?:                  string;
}

// ── Ops interface (injectable) ────────────────────────────────────────────────

export interface OptimizeCommandOps {
  /** Load action_queue rows with execution_status='queued', ordered by priority ASC then risk_score ASC. */
  loadQueue:    (runId: string, tenantId: string) => Promise<ActionQueueItem[]>;
  /** Apply the proposed fix in sandbox via the patch engine. */
  applyFix:     (item: ActionQueueItem) => Promise<void>;
  /** Run the full validator ladder (lighthouse → w3c → schema → axe → visual-diff). */
  runValidators:(item: ActionQueueItem) => Promise<ValidatorSuiteResult>;
  /** Promote the sandbox fix to live. */
  deployFix:    (item: ActionQueueItem) => Promise<void>;
  /** Update execution_status in action_queue. */
  markStatus:   (itemId: string, tenantId: string, status: string) => Promise<void>;
}

// ── Default (real) ops ────────────────────────────────────────────────────────

const realLoadQueue: OptimizeCommandOps['loadQueue'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('execution_status', 'queued')
    .order('priority', { ascending: true })
    .order('risk_score', { ascending: true });
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? []) as ActionQueueItem[];
};

const realApplyFix: OptimizeCommandOps['applyFix'] = async (_item) => {
  // Real implementation delegates to PatchEngine with the CMS adapter.
  // Injected in tests.
  throw new Error('realApplyFix: PatchEngine not configured — inject via _testOps');
};

const realRunValidators: OptimizeCommandOps['runValidators'] = async (item) => {
  // Real implementation calls lighthouse, w3c, schema, axe, visual-diff in order.
  // First failure short-circuits the ladder.
  // Injected in tests.
  throw new Error(`realRunValidators: validators not configured for ${item.url} — inject via _testOps`);
};

const realDeployFix: OptimizeCommandOps['deployFix'] = async (_item) => {
  throw new Error('realDeployFix: PatchEngine not configured — inject via _testOps');
};

const realMarkStatus: OptimizeCommandOps['markStatus'] = async (itemId, tenantId, status) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: status, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`action_queue status update failed: ${error.message}`);
};

// ── runOptimize ───────────────────────────────────────────────────────────────

const DEFAULT_AUTO_APPROVE_MAX_RISK = 3;

/**
 * Main optimize entry point.
 *
 * Steps:
 *   1. Validate request.
 *   2. Load queued action_queue items ordered by priority/risk.
 *   3. For each item:
 *        a. applyFix (patch engine sandbox)
 *        b. runValidators (ladder)
 *        c. Route: failed | pending_approval | deployed
 *   4. ActionLog optimize:complete with counts.
 *   5. Return OptimizeResult — never throw.
 */
export async function runOptimize(
  request:   OptimizeRequest,
  _testOps?: Partial<OptimizeCommandOps>,
): Promise<OptimizeResult> {
  const ops: OptimizeCommandOps = {
    loadQueue:     realLoadQueue,
    applyFix:      realApplyFix,
    runValidators: realRunValidators,
    deployFix:     realDeployFix,
    markStatus:    realMarkStatus,
    ..._testOps,
  };

  const maxRisk = request.auto_approve_max_risk ?? DEFAULT_AUTO_APPROVE_MAX_RISK;

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    command:   'optimize',
  });

  // ── Validate ────────────────────────────────────────────────────────────────

  if (!request.run_id)    return failed(request, 'run_id is required');
  if (!request.tenant_id) return failed(request, 'tenant_id is required');
  if (!request.site_id)   return failed(request, 'site_id is required');

  // ── optimize:start ──────────────────────────────────────────────────────────

  log({ stage: 'optimize:start', status: 'pending' });

  // ── Load queue ──────────────────────────────────────────────────────────────

  let queue: ActionQueueItem[];
  try {
    queue = await ops.loadQueue(request.run_id, request.tenant_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ stage: 'optimize:failed', status: 'failed', metadata: { error: msg } });
    return failed(request, msg);
  }

  if (queue.length === 0) {
    const completed_at = new Date().toISOString();
    log({
      stage:    'optimize:complete',
      status:   'ok',
      metadata: { fixes_attempted: 0, fixes_deployed: 0, fixes_pending_approval: 0, fixes_failed: 0 },
    });
    return {
      run_id:                  request.run_id,
      site_id:                 request.site_id,
      tenant_id:               request.tenant_id,
      fixes_attempted:         0,
      fixes_deployed:          0,
      fixes_pending_approval:  0,
      fixes_failed:            0,
      completed_at,
      status:                  'completed',
    };
  }

  // ── Process each item ───────────────────────────────────────────────────────

  let deployed         = 0;
  let pendingApproval  = 0;
  let fixesFailed      = 0;

  for (const item of queue) {
    // Step a: Apply fix in sandbox
    try {
      await ops.applyFix(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'optimize:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, reason: `applyFix: ${msg}` },
      });
      try { await ops.markStatus(item.id, item.tenant_id, 'failed'); } catch { /* non-blocking */ }
      fixesFailed++;
      continue;
    }

    // Step b: Run validator ladder
    let validation: ValidatorSuiteResult;
    try {
      validation = await ops.runValidators(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'optimize:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, reason: `runValidators: ${msg}` },
      });
      try { await ops.markStatus(item.id, item.tenant_id, 'failed'); } catch { /* non-blocking */ }
      fixesFailed++;
      continue;
    }

    // Step c: Validator failure
    if (!validation.passed) {
      log({
        stage:    'optimize:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, failures: validation.failures },
      });
      try { await ops.markStatus(item.id, item.tenant_id, 'failed'); } catch { /* non-blocking */ }
      fixesFailed++;
      continue;
    }

    // Step d: Route to approval if risk > threshold OR approval explicitly required
    const needsApproval = item.approval_required || item.risk_score > maxRisk;

    if (needsApproval) {
      log({
        stage:    'optimize:item_pending_approval',
        status:   'pending',
        metadata: { item_id: item.id, url: item.url, risk_score: item.risk_score, approval_required: item.approval_required },
      });
      try { await ops.markStatus(item.id, item.tenant_id, 'pending_approval'); } catch { /* non-blocking */ }
      pendingApproval++;
      continue;
    }

    // Step e: Deploy
    try {
      await ops.deployFix(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        stage:    'optimize:item_failed',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, reason: `deployFix: ${msg}` },
      });
      try { await ops.markStatus(item.id, item.tenant_id, 'failed'); } catch { /* non-blocking */ }
      fixesFailed++;
      continue;
    }

    log({
      stage:    'optimize:item_deployed',
      status:   'ok',
      metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, risk_score: item.risk_score },
    });
    try { await ops.markStatus(item.id, item.tenant_id, 'deployed'); } catch { /* non-blocking */ }
    deployed++;
  }

  // ── Determine overall status ─────────────────────────────────────────────────

  const fixes_attempted = queue.length;
  const overallStatus: OptimizeResult['status'] =
    fixesFailed === 0           ? 'completed'
    : fixesFailed < fixes_attempted ? 'partial'
    : 'failed';

  const completed_at = new Date().toISOString();

  log({
    stage:    'optimize:complete',
    status:   'ok',
    metadata: {
      fixes_attempted,
      fixes_deployed:          deployed,
      fixes_pending_approval:  pendingApproval,
      fixes_failed:            fixesFailed,
    },
  });

  return {
    run_id:                  request.run_id,
    site_id:                 request.site_id,
    tenant_id:               request.tenant_id,
    fixes_attempted,
    fixes_deployed:          deployed,
    fixes_pending_approval:  pendingApproval,
    fixes_failed:            fixesFailed,
    completed_at,
    status:                  overallStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failed(req: OptimizeRequest, error: string): OptimizeResult {
  return {
    run_id:                  req.run_id    ?? '',
    site_id:                 req.site_id   ?? '',
    tenant_id:               req.tenant_id ?? '',
    fixes_attempted:         0,
    fixes_deployed:          0,
    fixes_pending_approval:  0,
    fixes_failed:            0,
    completed_at:            new Date().toISOString(),
    status:                  'failed',
    error,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

export async function runOptimizeCli(opts: {
  runId:             string;
  tenantId:          string;
  siteId:            string;
  autoApproveMaxRisk?: number;
}): Promise<void> {
  const result = await runOptimize({
    run_id:               opts.runId,
    tenant_id:            opts.tenantId,
    site_id:              opts.siteId,
    auto_approve_max_risk: opts.autoApproveMaxRisk,
  });

  if (result.status !== 'failed') {
    console.log(
      `✓ Optimize ${result.status} — ` +
      `${result.fixes_deployed} deployed, ` +
      `${result.fixes_pending_approval} pending approval, ` +
      `${result.fixes_failed} failed`,
    );
  } else {
    console.error(`✗ Optimize failed: ${result.error}`);
    process.exitCode = 1;
  }
}
