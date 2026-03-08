/**
 * packages/commands/src/optimize.ts
 *
 * vaeo optimize — reads the action_queue, applies fixes in guardrail priority
 * order through the patch engine, runs the validator ladder, routes high-risk
 * items to approval, and auto-deploys low-risk items.
 *
 * Per-item status transitions:
 *   queued → runValidators → applyFix:
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

import type { CmsType }         from '../../core/types.js';
import type { ShopifyFixRequest } from '../../adapters/shopify/src/index.js';
import { createLogger }          from '../../action-log/src/index.js';

// ── Queue item shape (loaded from Supabase action_queue) ──────────────────────

export interface ActionQueueItem {
  id:               string;
  run_id:           string;
  tenant_id:        string;
  site_id:          string;
  cms_type?:        string;
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
  cms:                  CmsType;
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
  loadQueue:             (runId: string, tenantId: string) => Promise<ActionQueueItem[]>;
  /** Apply the proposed fix in sandbox via the patch engine. */
  applyFix:              (item: ActionQueueItem) => Promise<void>;
  /** Run the full validator ladder (lighthouse → w3c → schema → axe → visual-diff). */
  runValidators:         (item: ActionQueueItem) => Promise<ValidatorSuiteResult>;
  /** Promote the sandbox fix to live. */
  deployFix:             (item: ActionQueueItem) => Promise<void>;
  /** Update execution_status in action_queue. */
  markStatus:            (itemId: string, tenantId: string, status: string) => Promise<void>;
  /**
   * Write rollback_manifest JSONB to action_queue after applyFix succeeds.
   * Non-blocking — never throws. Optional (skipped in tests that don't inject it).
   */
  writeRollbackManifest?: (item: ActionQueueItem) => Promise<void>;
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

// ── AI content generation ─────────────────────────────────────────────────────

/** Issue types that require AI-generated text before the CMS adapter runs. */
const AI_ISSUE_TYPES = new Set([
  'META_TITLE_MISSING',
  'META_TITLE_DUPLICATE',
  'META_DESC_MISSING',
  'META_DESC_DUPLICATE',
  'IMG_ALT_MISSING',
]);

export function needsAiGeneration(issueType: string): boolean {
  return AI_ISSUE_TYPES.has(issueType);
}

function characterLimitFor(issueType: string): number {
  if (issueType.startsWith('META_TITLE')) return 60;
  if (issueType.startsWith('META_DESC'))  return 155;
  return 125; // IMG_ALT_MISSING
}

/**
 * Derives a human-readable brand name from the page URL.
 * Checks VAEO_BRAND_NAME env var first; falls back to capitalised domain segment.
 * e.g. cococabanalife.com → 'Cococabanalife' (good enough for AI hint)
 */
function deriveBrandName(url: string): string {
  const override = process.env['VAEO_BRAND_NAME'];
  if (override) return override;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const namePart = hostname.split('.')[0] ?? hostname;
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  } catch {
    return '';
  }
}

/**
 * Writes AI generation results back to the action_queue row (non-throwing).
 * Updates proposed_fix JSONB and optionally sets approval_required=true.
 */
async function patchQueueItemAiResult(
  itemId:          string,
  tenantId:        string,
  patchedFix:      Record<string, unknown>,
  approvalRequired?: boolean,
): Promise<void> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { getConfig }    = await import('../../core/config.js');
    const cfg = getConfig();
    const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
    const update: Record<string, unknown> = {
      proposed_fix: patchedFix,
      updated_at:   new Date().toISOString(),
    };
    if (approvalRequired !== undefined) update['approval_required'] = approvalRequired;
    const { error } = await db
      .from('action_queue')
      .update(update)
      .eq('id', itemId)
      .eq('tenant_id', tenantId);
    if (error) {
      process.stderr.write(`[ai] Supabase patch failed for ${itemId}: ${error.message}\n`);
    }
  } catch (err) {
    process.stderr.write(`[ai] Supabase patch threw for ${itemId}: ${String(err)}\n`);
  }
}

/** Injectable type matching generateContent from @vaeo/ai-adapter. */
type AiGenerateFn = (
  input: {
    fix_type: string;
    [k: string]: unknown;
  },
) => Promise<{
  success:          boolean;
  generated_text?:  string;
  confidence_score?: number;
  reasoning?:       string;
  low_confidence?:  boolean;
  error?:           string;
}>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps issue_type → ShopifyFixRequest.fix_type.
 * Falls back to 'meta_title' for unknown types.
 */
function deriveFixType(issueType: string): ShopifyFixRequest['fix_type'] {
  if (issueType.startsWith('META_TITLE')) return 'meta_title';
  if (issueType.startsWith('META_DESC'))  return 'meta_description';
  if (issueType.startsWith('H1_'))        return 'h1';
  if (issueType.startsWith('IMG_'))       return 'image_alt';
  if (issueType.startsWith('SCHEMA_'))    return 'schema';
  if (issueType.startsWith('ERR_') || issueType.includes('3xx')) return 'redirect';
  return 'meta_title';
}

// ── Real ops ──────────────────────────────────────────────────────────────────

/**
 * Dispatch applyFix to the correct CMS adapter based on cms_type.
 * Shopify: SHOPIFY_POC_ACCESS_TOKEN + SHOPIFY_STORE_URL
 * WordPress: WP_POC_URL + WP_POC_USERNAME + WP_POC_APP_PASSWORD
 *
 * If the issue type requires AI content generation (META_TITLE_*, META_DESC_*,
 * IMG_ALT_MISSING) and proposed_fix.generated_text is not already set, runs
 * generateContent() first and writes the result back to Supabase before
 * handing off to the CMS adapter.
 *
 * _aiGenerate is injectable for unit tests; defaults to the real adapter.
 */
export async function dispatchAdapterFix(
  item:         ActionQueueItem,
  sandbox:      boolean,
  _aiGenerate?: AiGenerateFn,
): Promise<void> {
  const actionId = item.id;
  const cmsType  = (item.cms_type ?? 'shopify') as 'shopify' | 'wordpress';
  const fixType  = deriveFixType(item.issue_type);

  // ── AI content generation (guardrail-first, spec Section 7) ─────────────────
  if (needsAiGeneration(item.issue_type) && !item.proposed_fix['generated_text']) {
    // Resolve AI function — real adapter or injected stub
    const generateContent: AiGenerateFn = _aiGenerate ?? (
      async (input) => {
        const mod = await import('../../adapters/ai/src/index.js');
        return mod.generateContent(input as Parameters<typeof mod.generateContent>[0]);
      }
    );

    // Build type-safe input for this issue type
    let aiInput: Record<string, unknown>;
    if (item.issue_type === 'IMG_ALT_MISSING') {
      aiInput = {
        fix_type:         item.issue_type,
        image_src:        String(item.proposed_fix['image_src'] ?? item.url),
        surrounding_text: String(item.proposed_fix['surrounding_text'] ?? ''),
        page_title:       String(item.proposed_fix['page_title'] ?? ''),
        character_limit:  characterLimitFor(item.issue_type),
      };
    } else {
      aiInput = {
        fix_type:        item.issue_type,
        page_url:        item.url,
        page_title:      String(item.proposed_fix['current_title'] ?? ''),
        body_preview:    String(item.proposed_fix['body_preview'] ?? ''),
        top_keywords:    (item.proposed_fix['top_keywords'] as unknown[]) ?? [],
        brand_name:      deriveBrandName(item.url),
        character_limit: characterLimitFor(item.issue_type),
      };
    }

    const aiResult = await generateContent(aiInput);

    if (aiResult.success && aiResult.generated_text) {
      process.stderr.write(
        `[ai] generated for action ${actionId}: "${aiResult.generated_text}" ` +
        `(confidence=${aiResult.confidence_score}, low_confidence=${aiResult.low_confidence})\n`,
      );
      const patchedFix = { ...item.proposed_fix, generated_text: aiResult.generated_text };
      item.proposed_fix      = patchedFix;
      const flagApproval     = aiResult.low_confidence === true ? true : undefined;
      if (flagApproval) item.approval_required = true;
      await patchQueueItemAiResult(actionId, item.tenant_id, patchedFix, flagApproval);
    } else {
      const errMsg = aiResult.error ?? 'unknown AI error';
      process.stderr.write(`[ai] generation failed for ${actionId}: ${errMsg}\n`);
      const patchedFix = { ...item.proposed_fix, fix_source: 'manual' };
      item.proposed_fix      = patchedFix;
      item.approval_required = true;
      await patchQueueItemAiResult(actionId, item.tenant_id, patchedFix, true);
    }
  }

  const { applyPatch } = await import('../../patch-engine/src/index.js');

  const patchResult = await applyPatch({
    action_id:    actionId,
    run_id:       item.run_id,
    tenant_id:    item.tenant_id,
    site_id:      item.site_id,
    cms_type:     cmsType,
    issue_type:   item.issue_type,
    proposed_fix: item.proposed_fix,
    sandbox,
  });

  if (!patchResult.success) {
    throw new Error(patchResult.error ?? 'applyPatch failed');
  }

  if (cmsType === 'wordpress') {
    const { applyFix: wpApplyFix } = await import('../../adapters/wordpress/src/index.js');
    const fixResult = await wpApplyFix({
      action_id:    actionId,
      site_url:     process.env['WP_POC_URL'] ?? '',
      username:     process.env['WP_POC_USERNAME'] ?? '',
      app_password: process.env['WP_POC_APP_PASSWORD'] ?? '',
      fix_type:     fixType as 'meta_title' | 'meta_description' | 'h1' | 'schema' | 'redirect',
      target_url:   item.url,
      before_value: (item.proposed_fix['before_value'] as Record<string, unknown>) ?? {},
      after_value:  item.proposed_fix,
    });
    if (!fixResult.success) {
      throw new Error(fixResult.error ?? 'wordpress applyFix failed');
    }
  } else {
    const { applyFix: shopifyApplyFix } = await import('../../adapters/shopify/src/index.js');
    // SHOPIFY_ADMIN_DOMAIN = myshopify.com domain for Admin API.
    // Falls back to SHOPIFY_STORE_URL if it IS a myshopify.com domain;
    // otherwise POC default (cococabanalife.com routes to hautedoorliving.myshopify.com).
    const adminDomainEnv = process.env['SHOPIFY_ADMIN_DOMAIN'] ?? '';
    let storeUrl: string;
    if (adminDomainEnv) {
      storeUrl = adminDomainEnv.replace(/^https?:\/\//, '').replace(/\/$/, '');
    } else {
      const raw = (process.env['SHOPIFY_STORE_URL'] ?? process.env['SHOPIFY_POC_STORE_URL'] ?? '')
        .replace(/^https?:\/\//, '').replace(/\/$/, '');
      storeUrl = raw.includes('.myshopify.com') ? raw : 'hautedoorliving.myshopify.com';
    }
    const fixResult = await shopifyApplyFix({
      action_id:    actionId,
      access_token: process.env['SHOPIFY_POC_ACCESS_TOKEN'] ?? '',
      store_url:    storeUrl,
      fix_type:     fixType,
      target_url:   item.url,
      before_value: (item.proposed_fix['before_value'] as Record<string, unknown>) ?? {},
      after_value:  item.proposed_fix,
      sandbox,
    });
    if (!fixResult.success) {
      throw new Error(fixResult.error ?? 'shopify applyFix failed');
    }
  }
}

// ── Rollback manifest builder ─────────────────────────────────────────────────

type ResourceType = 'metafield' | 'theme_asset' | 'redirect' | 'post_meta' | 'page_meta';

function deriveResourceType(issueType: string, cmsType: 'shopify' | 'wordpress'): ResourceType {
  if (issueType.startsWith('META_TITLE') || issueType.startsWith('META_DESC') || issueType.startsWith('IMG_')) {
    return cmsType === 'wordpress' ? 'post_meta' : 'metafield';
  }
  if (issueType.startsWith('H1_') || issueType.startsWith('SCHEMA_')) {
    return cmsType === 'wordpress' ? 'post_meta' : 'theme_asset';
  }
  if (issueType.includes('REDIRECT') || issueType.startsWith('ERR_')) {
    return 'redirect';
  }
  return cmsType === 'wordpress' ? 'post_meta' : 'metafield';
}

/**
 * Builds the rollback_manifest JSONB written to action_queue after a successful applyFix.
 * Pure function — no I/O, easily testable.
 */
export function buildRollbackManifest(item: ActionQueueItem): Record<string, unknown> {
  const cmsType      = ((item.cms_type ?? 'shopify') as 'shopify' | 'wordpress');
  const resourceType = deriveResourceType(item.issue_type, cmsType);
  const fix          = item.proposed_fix;
  return {
    run_id:   item.run_id,
    cms_type: cmsType,
    affected_resources: [{
      resource_type: resourceType,
      resource_id:   fix['resource_id']   as string | undefined,
      resource_key:  fix['resource_key']  as string | undefined,
      before_value:  (fix['before_value'] as Record<string, unknown> | undefined)?.['current_value']
                     ?? fix['current_value'],
    }],
    created_at: new Date().toISOString(),
  };
}

const realWriteRollbackManifest: NonNullable<OptimizeCommandOps['writeRollbackManifest']> = async (item) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { getConfig }    = await import('../../core/config.js');
    const cfg = getConfig();
    const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
    const manifest = buildRollbackManifest(item);
    const { error } = await db
      .from('action_queue')
      .update({ rollback_manifest: manifest, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('tenant_id', item.tenant_id);
    if (error) {
      process.stderr.write(`[optimize] writeRollbackManifest failed for ${item.id}: ${error.message}\n`);
    }
  } catch (err) {
    process.stderr.write(`[optimize] writeRollbackManifest threw for ${item.id}: ${String(err)}\n`);
  }
};

/**
 * Applies a fix in sandbox mode:
 *   1. applyPatch() — stores rollback manifest, calls patch-engine adapter stub
 *   2. CMS-routed applyFix() — Shopify or WordPress based on cms_type
 * Throws on any failure so runOptimize can count it as failed.
 */
const realApplyFix: OptimizeCommandOps['applyFix'] = async (item) => {
  await dispatchAdapterFix(item, true);
};

const realRunValidators: OptimizeCommandOps['runValidators'] = async (item) => {
  // Fetch schema_blocks from crawl_results for this URL (non-blocking if unavailable)
  let schemaBlocks: string[] | undefined;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { getConfig }    = await import('../../core/config.js');
    const cfg = getConfig();
    const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
    const { data } = await db
      .from('crawl_results')
      .select('schema_blocks')
      .eq('run_id', item.run_id)
      .eq('url', item.url)
      .limit(1)
      .maybeSingle();
    if (data?.['schema_blocks']) {
      const raw = data['schema_blocks'];
      schemaBlocks = Array.isArray(raw) ? (raw as unknown[]).map(String) : undefined;
    }
  } catch { /* non-blocking — schema validation skipped if unavailable */ }

  const { runValidators } = await import('../../validators/src/index.js');
  const result = await runValidators({
    url:            item.url,
    schema_blocks:  schemaBlocks,
    run_lighthouse: false, // lighthouse runs separately via PageSpeed API, not in sandbox loop
  });

  if (!result.passed) {
    process.stderr.write(
      `[validator] BLOCKED ${item.url} — failed: ${result.blocked_by.join(', ')}\n`,
    );
    // Write error_log + validator_results to action_queue (non-blocking)
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { getConfig }    = await import('../../core/config.js');
      const cfg = getConfig();
      const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
      await db.from('action_queue')
        .update({
          error_log:         JSON.stringify(result.blocked_by),
          validator_results: result,
          updated_at:        new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('tenant_id', item.tenant_id);
    } catch { /* non-blocking */ }
  }

  return {
    url:      item.url,
    passed:   result.passed,
    failures: result.blocked_by,
  };
};

/**
 * Promotes a fix to live (sandbox: false).
 * LIVE DEPLOY path — emits a prominent stderr log before proceeding.
 * Throws on any failure.
 */
const realDeployFix: OptimizeCommandOps['deployFix'] = async (item) => {
  process.stderr.write(
    `[optimize] LIVE DEPLOY — action_id=${item.id}, fix_type=${item.issue_type}, url=${item.url}\n`,
  );
  await dispatchAdapterFix(item, false);
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
    // writeRollbackManifest: only wired in production; tests inject via _testOps
    ...(_testOps === undefined ? { writeRollbackManifest: realWriteRollbackManifest } : {}),
    ..._testOps,
  };

  const maxRisk = request.auto_approve_max_risk ?? DEFAULT_AUTO_APPROVE_MAX_RISK;

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       request.cms,
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
    // Pre-check: manual-only fixes (e.g. IMG_DIMENSIONS_MISSING without product_id/image_id)
    // cannot be auto-applied — route directly to pending_approval without hitting the adapter.
    if (item.proposed_fix['fix_source'] === 'manual') {
      log({
        stage:    'optimize:item_pending_approval',
        status:   'pending',
        metadata: { item_id: item.id, url: item.url, issue_type: item.issue_type, reason: 'manual fix required — no adapter call' },
      });
      try { await ops.markStatus(item.id, item.tenant_id, 'pending_approval'); } catch { /* non-blocking */ }
      pendingApproval++;
      continue;
    }

    // Step a: Run validator ladder (pre-flight before any apply)
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

    // Step b: Validator failure — skip apply entirely
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

    // Step c: Apply fix in sandbox
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

    // Write rollback_manifest after successful apply (non-blocking)
    if (ops.writeRollbackManifest) {
      ops.writeRollbackManifest(item).catch(() => { /* non-blocking */ });
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
  cms:               CmsType;
  autoApproveMaxRisk?: number;
}): Promise<void> {
  const result = await runOptimize({
    run_id:               opts.runId,
    tenant_id:            opts.tenantId,
    site_id:              opts.siteId,
    cms:                  opts.cms,
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
