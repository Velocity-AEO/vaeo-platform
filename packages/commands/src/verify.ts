/**
 * packages/commands/src/verify.ts
 *
 * vaeo verify — re-runs the validator ladder (lighthouse → w3c → schema → axe)
 * against every deployed fix to confirm nothing regressed post-deployment.
 *
 * visual-diff is intentionally excluded: it runs in the optimize sandbox
 * before deployment. Post-deploy verify checks live behaviour only.
 *
 * Per-item flow:
 *   deployed → runValidators(live url):
 *     all pass  → increment passed
 *     any fail  → add to regressions[], markStatus('regression_detected'),
 *                 flagRollback(item.id) — does NOT auto-rollback
 *
 * Status derivation:
 *   'passed'  — regressions.length === 0
 *   'failed'  — all checked URLs regressed (passed === 0 and failed > 0)
 *   'partial' — some passed, some regressed
 *
 * Never throws — always returns VerifyResult.
 */

import type { CmsType } from '../../core/types.js';
import { createLogger }  from '../../action-log/src/index.js';

// ── Shared item shape (same table as optimize) ────────────────────────────────

export interface DeployedItem {
  id:               string;
  run_id:           string;
  tenant_id:        string;
  site_id:          string;
  issue_type:       string;
  url:              string;
  risk_score:       number;
  category:         string;
  execution_status: string;
}

// ── Validator ladder result ───────────────────────────────────────────────────

/** Result of running the 4-validator ladder against one live URL. */
export interface LiveValidatorResult {
  url:      string;
  passed:   boolean;
  /** Names of validators that did not pass, in ladder order. */
  failures: Array<{ validator: string; detail: string }>;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface RegressionItem {
  url:        string;
  action_id:  string;
  issue_type: string;
  /** Which validator caught the regression. */
  validator:  string;
  /** Human-readable description of what failed. */
  detail:     string;
}

export interface VerifyRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
}

export interface VerifyResult {
  run_id:       string;
  site_id:      string;
  tenant_id:    string;
  urls_checked: number;
  passed:       number;
  failed:       number;
  regressions:  RegressionItem[];
  completed_at: string;
  status:       'passed' | 'failed' | 'partial';
  error?:       string;
}

// ── Ops interface (injectable) ────────────────────────────────────────────────

export interface VerifyCommandOps {
  /** Load action_queue rows with execution_status='deployed'. */
  loadDeployed:  (runId: string, tenantId: string) => Promise<DeployedItem[]>;
  /** Run lighthouse → w3c → schema → axe against the live URL. */
  runValidators: (item: DeployedItem) => Promise<LiveValidatorResult>;
  /**
   * Mark the action_queue row as 'regression_detected'.
   * Non-blocking — failures are swallowed.
   */
  markRegression:(itemId: string, tenantId: string) => Promise<void>;
  /**
   * Set rollback_flagged=true on the action_queue row.
   * Non-blocking — failures are swallowed.
   * Does NOT trigger an automatic rollback.
   */
  flagRollback:  (itemId: string, tenantId: string) => Promise<void>;
}

// ── Default (real) ops ────────────────────────────────────────────────────────

const realLoadDeployed: VerifyCommandOps['loadDeployed'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('execution_status', 'deployed');
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? []) as DeployedItem[];
};

const realRunValidators: VerifyCommandOps['runValidators'] = async (item) => {
  // Real implementation calls lighthouse, w3c, schema, axe against item.url.
  // First failure short-circuits the ladder.
  // Injected in tests.
  throw new Error(`realRunValidators: validators not configured for ${item.url} — inject via _testOps`);
};

const realMarkRegression: VerifyCommandOps['markRegression'] = async (itemId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'regression_detected', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markRegression failed: ${error.message}`);
};

const realFlagRollback: VerifyCommandOps['flagRollback'] = async (itemId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ rollback_flagged: true, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`flagRollback failed: ${error.message}`);
};

// ── runVerify ─────────────────────────────────────────────────────────────────

/**
 * Main verify entry point.
 *
 * Steps:
 *   1. Validate request.
 *   2. Load deployed action_queue items.
 *   3. For each item: runValidators against live URL.
 *      - Pass: increment passed counter.
 *      - Fail: add regression(s), markRegression, flagRollback.
 *   4. ActionLog verify:complete with counts and regression list.
 *   5. Return VerifyResult — never throws.
 */
export async function runVerify(
  request:   VerifyRequest,
  _testOps?: Partial<VerifyCommandOps>,
): Promise<VerifyResult> {
  const ops: VerifyCommandOps = {
    loadDeployed:  realLoadDeployed,
    runValidators: realRunValidators,
    markRegression: realMarkRegression,
    flagRollback:  realFlagRollback,
    ..._testOps,
  };

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    command:   'verify',
  });

  // ── Validate ────────────────────────────────────────────────────────────────

  if (!request.run_id)    return failedResult(request, 'run_id is required');
  if (!request.tenant_id) return failedResult(request, 'tenant_id is required');
  if (!request.site_id)   return failedResult(request, 'site_id is required');

  // ── verify:start ────────────────────────────────────────────────────────────

  log({ stage: 'verify:start', status: 'pending' });

  // ── Step 1: Load deployed items ─────────────────────────────────────────────

  let deployed: DeployedItem[];
  try {
    deployed = await ops.loadDeployed(request.run_id, request.tenant_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ stage: 'verify:failed', status: 'failed', metadata: { error: msg } });
    return failedResult(request, msg);
  }

  // ── No deployed items ───────────────────────────────────────────────────────

  if (deployed.length === 0) {
    const completed_at = new Date().toISOString();
    log({
      stage:    'verify:complete',
      status:   'ok',
      metadata: { urls_checked: 0, passed: 0, failed: 0, regressions: [] },
    });
    return {
      run_id:       request.run_id,
      site_id:      request.site_id,
      tenant_id:    request.tenant_id,
      urls_checked: 0,
      passed:       0,
      failed:       0,
      regressions:  [],
      completed_at,
      status:       'passed',
    };
  }

  // ── Step 2–5: Validate each deployed item ───────────────────────────────────

  let passedCount   = 0;
  let failedCount   = 0;
  const regressions: RegressionItem[] = [];

  for (const item of deployed) {
    let result: LiveValidatorResult;
    try {
      result = await ops.runValidators(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Treat validator crash as a single-failure regression
      regressions.push({
        url:        item.url,
        action_id:  item.id,
        issue_type: item.issue_type,
        validator:  'unknown',
        detail:     `Validator error: ${msg}`,
      });
      log({
        stage:    'verify:item_error',
        status:   'error',
        metadata: { item_id: item.id, url: item.url, error: msg },
      });
      try { await ops.markRegression(item.id, item.tenant_id); } catch { /* non-blocking */ }
      try { await ops.flagRollback(item.id, item.tenant_id);   } catch { /* non-blocking */ }
      failedCount++;
      continue;
    }

    if (result.passed) {
      passedCount++;
      log({
        stage:    'verify:item_passed',
        status:   'ok',
        metadata: { item_id: item.id, url: item.url },
      });
    } else {
      failedCount++;
      // One RegressionItem per failing validator
      for (const failure of result.failures) {
        regressions.push({
          url:        item.url,
          action_id:  item.id,
          issue_type: item.issue_type,
          validator:  failure.validator,
          detail:     failure.detail,
        });
      }
      log({
        stage:    'verify:item_regression',
        status:   'error',
        metadata: {
          item_id:   item.id,
          url:       item.url,
          failures:  result.failures.map((f) => f.validator),
        },
      });
      try { await ops.markRegression(item.id, item.tenant_id); } catch { /* non-blocking */ }
      try { await ops.flagRollback(item.id, item.tenant_id);   } catch { /* non-blocking */ }
    }
  }

  // ── Derive overall status ───────────────────────────────────────────────────

  const urls_checked = deployed.length;
  const overallStatus: VerifyResult['status'] =
    failedCount === 0             ? 'passed'
    : passedCount === 0           ? 'failed'
    : 'partial';

  const completed_at = new Date().toISOString();

  log({
    stage:    'verify:complete',
    status:   overallStatus === 'passed' ? 'ok' : 'error',
    metadata: {
      urls_checked,
      passed:      passedCount,
      failed:      failedCount,
      regressions: regressions.map((r) => ({ url: r.url, validator: r.validator })),
    },
  });

  return {
    run_id:       request.run_id,
    site_id:      request.site_id,
    tenant_id:    request.tenant_id,
    urls_checked,
    passed:       passedCount,
    failed:       failedCount,
    regressions,
    completed_at,
    status:       overallStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failedResult(req: VerifyRequest, error: string): VerifyResult {
  return {
    run_id:       req.run_id    ?? '',
    site_id:      req.site_id   ?? '',
    tenant_id:    req.tenant_id ?? '',
    urls_checked: 0,
    passed:       0,
    failed:       0,
    regressions:  [],
    completed_at: new Date().toISOString(),
    status:       'failed',
    error,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

export async function runVerifyCli(opts: {
  runId:    string;
  tenantId: string;
  siteId:   string;
}): Promise<void> {
  const result = await runVerify({
    run_id:    opts.runId,
    tenant_id: opts.tenantId,
    site_id:   opts.siteId,
  });

  if (result.status !== 'failed' || result.error === undefined) {
    const regressLabel = result.regressions.length > 0
      ? `, ${result.regressions.length} regression(s) flagged for rollback`
      : '';
    console.log(
      `${result.status === 'passed' ? '✓' : '⚠'} Verify ${result.status} — ` +
      `${result.urls_checked} checked, ${result.passed} passed, ${result.failed} failed` +
      regressLabel,
    );
  } else {
    console.error(`✗ Verify failed: ${result.error}`);
    process.exitCode = 1;
  }
}
