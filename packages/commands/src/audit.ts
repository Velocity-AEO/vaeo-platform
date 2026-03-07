/**
 * packages/commands/src/audit.ts
 *
 * vaeo audit — reads a crawl snapshot, runs all detectors + risk scorer,
 * applies guardrail priority ordering, and writes the ranked action queue
 * to Supabase (action_queue table).
 *
 * Design:
 *   - Injectable AuditCommandOps for unit testing without Supabase or detectors.
 *   - Never throws — all failures surface as status='failed' + error field.
 *   - ActionLog: audit:start (pending) → audit:complete (ok|failed).
 *
 * Guardrail category mapping (detector → guardrail):
 *   metadata   → content
 *   images     → enhancements
 *   (all others pass through unchanged)
 */

import type { CmsType } from '../../core/types.js';
import type { CrawlResultRow, DetectedIssue, DetectorCtx } from '../../detectors/src/index.js';
import type { ScoredIssue } from '../../risk-scorer/src/index.js';
import type { IssueCategory, ProposedAction } from '../../guardrail/src/index.js';
import { PRIORITY_MAP } from '../../guardrail/src/index.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Category mapping ──────────────────────────────────────────────────────────

/**
 * Maps DetectorCategory → IssueCategory (guardrail vocabulary).
 * 'metadata' → 'content', 'images' → 'enhancements', all others pass through.
 */
function toIssueCategory(detectorCategory: string): IssueCategory {
  if (detectorCategory === 'metadata') return 'content';
  if (detectorCategory === 'images')   return 'enhancements';
  return detectorCategory as IssueCategory;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  cms:       CmsType;
}

/** One row written to the action_queue Supabase table. Matches live schema. */
export interface ActionQueueRow {
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  cms_type:          string;
  issue_type:        string;
  url:               string;
  risk_score:        number;
  priority:          number;           // 1–8 from PRIORITY_MAP
  /** category and auto_deploy stored inside proposed_fix JSONB (not top-level columns). */
  proposed_fix:      Record<string, unknown>;
  approval_required: boolean;
  execution_status:  'queued';
}

export interface AuditResult {
  run_id:                string;
  site_id:               string;
  tenant_id:             string;
  issues_found:          number;
  issues_by_priority:    Record<number, number>;  // priority 1-8 → count
  action_queue_populated: boolean;
  completed_at:          string;
  status:                'completed' | 'failed';
  error?:                string;
}

// ── Ops interface (injectable) ────────────────────────────────────────────────

export interface AuditCommandOps {
  /** Load crawl_results rows for the given run_id from Supabase. */
  loadCrawlRows:  (runId: string, tenantId: string) => Promise<CrawlResultRow[]>;
  /** Run all detectors against the crawl rows. May be sync or async. */
  detectIssues:   (rows: CrawlResultRow[], ctx: DetectorCtx) => DetectedIssue[] | Promise<DetectedIssue[]>;
  /** Score all detected issues. May be sync or async. */
  scoreIssues:    (issues: DetectedIssue[]) => ScoredIssue[] | Promise<ScoredIssue[]>;
  /** Evaluate issues against guardrail priority ladder. May be sync or async. */
  evaluateOrder:  (issues: ScoredIssue[]) => ProposedAction[] | Promise<ProposedAction[]>;
  /** Write action_queue rows to Supabase. Returns number of rows inserted. */
  writeQueue:     (rows: ActionQueueRow[]) => Promise<number>;
}

// ── Default (real) ops ────────────────────────────────────────────────────────

const realLoadCrawlRows: AuditCommandOps['loadCrawlRows'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('crawl_results')
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`crawl_results load failed: ${error.message}`);
  return (data ?? []) as CrawlResultRow[];
};

const realDetectIssues: AuditCommandOps['detectIssues'] = async (rows, ctx) => {
  const { runAllDetectors } = await import('../../detectors/src/index.js');
  return runAllDetectors(rows, ctx);
};

const realScoreIssues: AuditCommandOps['scoreIssues'] = async (issues) => {
  const { scoreIssues } = await import('../../risk-scorer/src/index.js');
  return scoreIssues(issues);
};

const realEvaluateOrder: AuditCommandOps['evaluateOrder'] = async (issues) => {
  const { evaluate } = await import('../../guardrail/src/index.js');
  // Pass empty resolvedCategories — audit always starts with nothing resolved.
  const decision = evaluate(
    issues.map((issue, idx) => ({
      idempotency_key: `${issue.run_id}:${issue.url}:${issue.issue_type}:${idx}`,
      category:        toIssueCategory(issue.category),
      patch_type:      derivePatchType(issue.issue_type),
      url:             issue.url,
    })),
    new Set<IssueCategory>(),
  );
  return [...decision.allowed, ...decision.deferred, ...decision.blocked.map((b) => b.action)];
};

const realWriteQueue: AuditCommandOps['writeQueue'] = async (rows) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db.from('action_queue').insert(rows);
  if (error) throw new Error(`action_queue insert failed: ${error.message}`);
  return rows.length;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derives a patch_type string from issue_type for the action queue. */
function derivePatchType(issueType: string): string {
  if (issueType.startsWith('ERR_'))    return 'error_fix';
  if (issueType.startsWith('META_'))   return 'meta_patch';
  if (issueType.startsWith('H1_') || issueType.startsWith('H2_')) return 'heading_patch';
  if (issueType.startsWith('IMG_'))    return 'image_patch';
  if (issueType.startsWith('SCHEMA_')) return 'schema_patch';
  return 'content_patch';
}

/** Builds a fresh issues_by_priority map (all 8 priorities start at 0). */
function emptyByPriority(): Record<number, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
}

// ── runAudit ─────────────────────────────────────────────────────────────────

/**
 * Main audit entry point.
 *
 * Steps:
 *   1. Validate request fields.
 *   2. Load crawl_results rows from Supabase.
 *   3. Run runAllDetectors → DetectedIssue[].
 *   4. Run scoreIssues → ScoredIssue[].
 *   5. Map detector categories → guardrail IssueCategory.
 *   6. Sort by priority 1-8 (then risk_score desc within each priority).
 *   7. Write action_queue rows to Supabase.
 *   8. Return AuditResult — never throws.
 */
export async function runAudit(
  request:   AuditRequest,
  _testOps?: Partial<AuditCommandOps>,
): Promise<AuditResult> {
  const ops: AuditCommandOps = {
    loadCrawlRows:  realLoadCrawlRows,
    detectIssues:   realDetectIssues,
    scoreIssues:    realScoreIssues,
    evaluateOrder:  realEvaluateOrder,
    writeQueue:     realWriteQueue,
    ..._testOps,
  };

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       request.cms,
    command:   'audit',
  });

  // ── Validate ────────────────────────────────────────────────────────────────

  if (!request.run_id) {
    return failed(request, 'run_id is required');
  }
  if (!request.tenant_id) {
    return failed(request, 'tenant_id is required');
  }
  if (!request.site_id) {
    return failed(request, 'site_id is required');
  }
  if (!request.cms) {
    return failed(request, 'cms is required');
  }

  // ── audit:start ─────────────────────────────────────────────────────────────

  log({
    stage:     'audit:start',
    status:    'pending',
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    run_id:    request.run_id,
    cms:       request.cms,
  });

  try {
    // ── Step 1: Load crawl rows ───────────────────────────────────────────────

    const rows = await ops.loadCrawlRows(request.run_id, request.tenant_id);

    if (rows.length === 0) {
      return failed(request, `No crawl_results found for run_id=${request.run_id}`);
    }

    // ── Step 2: Detect issues ─────────────────────────────────────────────────

    const ctx: DetectorCtx = {
      run_id:    request.run_id,
      tenant_id: request.tenant_id,
      site_id:   request.site_id,
      cms:       request.cms,
    };

    const detected = await Promise.resolve(ops.detectIssues(rows, ctx));

    // ── Step 3: Score issues ──────────────────────────────────────────────────

    const scored = await Promise.resolve(ops.scoreIssues(detected));

    // ── Step 4: Map categories + sort by priority then risk_score desc ────────

    const withPriority = scored.map((issue) => {
      const issueCategory = toIssueCategory(issue.category);
      const priority      = PRIORITY_MAP[issueCategory] ?? 8;
      return { issue, issueCategory, priority };
    });

    withPriority.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.issue.risk_score - a.issue.risk_score;
    });

    // ── Step 5: Build action_queue rows ───────────────────────────────────────

    const queueRows: ActionQueueRow[] = withPriority.map(({ issue, issueCategory, priority }) => ({
      run_id:            request.run_id,
      tenant_id:         request.tenant_id,
      site_id:           request.site_id,
      cms_type:          request.cms,
      issue_type:        issue.issue_type,
      url:               issue.url,
      risk_score:        issue.risk_score,
      priority,
      proposed_fix:      {
        ...issue.proposed_fix,
        category:    issueCategory,
        auto_deploy: issue.auto_deploy,
      },
      approval_required: issue.approval_required,
      execution_status:  'queued' as const,
    }));

    // ── Step 6: Write to Supabase ─────────────────────────────────────────────

    let action_queue_populated = false;
    if (queueRows.length > 0) {
      await ops.writeQueue(queueRows);
      action_queue_populated = true;
    }

    // ── Step 7: Build issues_by_priority ─────────────────────────────────────

    const issues_by_priority = emptyByPriority();
    for (const { priority } of withPriority) {
      const p = priority as keyof typeof issues_by_priority;
      issues_by_priority[p] = (issues_by_priority[p] ?? 0) + 1;
    }

    // ── audit:complete ────────────────────────────────────────────────────────

    const completed_at = new Date().toISOString();

    log({
      stage:    'audit:complete',
      status:   'ok',
      command:  'audit',
      metadata: {
        issues_found:          scored.length,
        issues_by_priority,
        action_queue_populated,
      },
    });

    return {
      run_id:                request.run_id,
      site_id:               request.site_id,
      tenant_id:             request.tenant_id,
      issues_found:          scored.length,
      issues_by_priority,
      action_queue_populated,
      completed_at,
      status:                'completed',
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({
      stage:    'audit:failed',
      status:   'failed',
      command:  'audit',
      metadata: { error: message },
    });
    return failed(request, message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failed(req: AuditRequest, error: string): AuditResult {
  return {
    run_id:                req.run_id    ?? '',
    site_id:               req.site_id   ?? '',
    tenant_id:             req.tenant_id ?? '',
    issues_found:          0,
    issues_by_priority:    emptyByPriority(),
    action_queue_populated: false,
    completed_at:          new Date().toISOString(),
    status:                'failed',
    error,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

export async function runAuditCli(opts: {
  runId:    string;
  tenantId: string;
  siteId:   string;
  cms:      string;
}): Promise<void> {
  const result = await runAudit({
    run_id:    opts.runId,
    tenant_id: opts.tenantId,
    site_id:   opts.siteId,
    cms:       opts.cms as CmsType,
  });

  if (result.status === 'completed') {
    console.log(
      `✓ Audit completed — ${result.issues_found} issues found, ` +
      `action queue populated: ${result.action_queue_populated}`,
    );
    console.log(
      `  Priority breakdown: ` +
      Object.entries(result.issues_by_priority)
        .filter(([, count]) => count > 0)
        .map(([p, count]) => `P${p}=${count}`)
        .join(', '),
    );
  } else {
    console.error(`✗ Audit failed: ${result.error}`);
    process.exitCode = 1;
  }
}
