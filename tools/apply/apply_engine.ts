/**
 * tools/apply/apply_engine.ts
 *
 * Apply engine — takes approved items from action_queue and executes
 * the actual fixes via the Shopify Admin API.
 *
 * Dispatches by issue_type:
 *   title_fix     → update Shopify metafield global.title_tag
 *   meta_fix      → update Shopify metafield global.description_tag
 *   schema_fix    → inject/update JSON-LD schema via metafield
 *   redirect_fix  → create Shopify URL redirect
 *   canonical_fix → update canonical via metafield
 *
 * On success: marks action_queue item as 'deployed', writes ActionLog entry.
 * On failure: marks as 'failed', logs error. Does NOT rollback automatically.
 *
 * Never throws — always returns ApplyResult.
 */

import type { ShopifyFixRequest, ShopifyFixResult } from '../../packages/adapters/shopify/src/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApprovedItem {
  id:               string;
  run_id:           string;
  tenant_id:        string;
  site_id:          string;
  issue_type:       string;
  url:              string;
  risk_score:       number;
  priority:         number;
  proposed_fix:     Record<string, unknown>;
  execution_status: string;
  /** Triage recommendation — checked before applying. */
  triage_recommendation?: string | null;
}

export interface ApplyResult {
  action_id: string;
  success:   boolean;
  fix_type:  string;
  error?:    string;
  /** Captured before-state for rollback. */
  before_value?: Record<string, unknown>;
}

export interface ApplyBatchResult {
  applied: number;
  failed:  number;
  results: ApplyResult[];
  errors:  string[];
}

// ── Injectable deps ─────────────────────────────────────────────────────────

export interface ApplyDeps {
  /** Load an approved item by id + site_id. */
  loadItem: (itemId: string, siteId: string) => Promise<ApprovedItem | null>;
  /** Load Shopify credentials for a site. */
  loadCredentials: (siteId: string) => Promise<{ access_token: string; store_url: string } | null>;
  /** Execute a Shopify fix via the adapter. */
  shopifyApplyFix: (request: ShopifyFixRequest) => Promise<ShopifyFixResult>;
  /** Mark item as deployed. */
  markDeployed: (itemId: string) => Promise<void>;
  /** Mark item as failed with error message. */
  markFailed: (itemId: string, error: string) => Promise<void>;
  /** Write an ActionLog entry. */
  writeLog: (entry: {
    action_id: string;
    stage:     string;
    status:    string;
    url?:      string;
    field?:    string;
    before_value?: string;
    after_value?:  string;
    error?:        string;
    duration_ms?:  number;
  }) => void;
}

// ── Issue type → Shopify fix type mapping ───────────────────────────────────

type ShopifyFixType = ShopifyFixRequest['fix_type'];

function mapIssueToFixType(issueType: string): ShopifyFixType | null {
  const lower = issueType.toLowerCase();
  if (lower.includes('title'))     return 'meta_title';
  if (lower.includes('meta') || lower.includes('desc')) return 'meta_description';
  if (lower.includes('schema'))    return 'schema';
  if (lower.includes('redirect'))  return 'redirect';
  if (lower.includes('h1'))        return 'h1';
  // canonical_fix → not directly supported by adapter, use stub
  if (lower.includes('canonical')) return 'schema';
  return null;
}

/** Extract the "after" value fields from proposed_fix based on fix type. */
function buildAfterValue(fixType: ShopifyFixType, proposedFix: Record<string, unknown>): Record<string, unknown> {
  if (fixType === 'meta_title') {
    return {
      new_title: proposedFix['new_title'] ?? proposedFix['generated_text'] ?? proposedFix['title'] ?? '',
    };
  }
  if (fixType === 'meta_description') {
    return {
      new_description: proposedFix['new_description'] ?? proposedFix['generated_text'] ?? proposedFix['description'] ?? '',
    };
  }
  // For schema, redirect, h1 — pass through
  return proposedFix;
}

// ── Real implementations ────────────────────────────────────────────────────

const realLoadItem: ApplyDeps['loadItem'] = async (itemId, siteId) => {
  const { getConfig }    = await import('../../packages/core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from('action_queue')
    .select('id, run_id, tenant_id, site_id, issue_type, url, risk_score, priority, proposed_fix, execution_status')
    .eq('id', itemId)
    .eq('site_id', siteId)
    .maybeSingle();
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? null) as ApprovedItem | null;
};

const realLoadCredentials: ApplyDeps['loadCredentials'] = async (siteId) => {
  const { getConfig }    = await import('../../packages/core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  // Load access token from site_credentials
  const { data: cred } = await db
    .from('site_credentials')
    .select('credential_val')
    .eq('site_id', siteId)
    .eq('credential_key', 'shopify_access_token')
    .maybeSingle();
  if (!cred?.credential_val) return null;

  // Load store URL from sites
  const { data: site } = await db
    .from('sites')
    .select('site_url')
    .eq('site_id', siteId)
    .maybeSingle();
  if (!site?.site_url) return null;

  return {
    access_token: cred.credential_val as string,
    store_url:    site.site_url as string,
  };
};

const realShopifyApplyFix: ApplyDeps['shopifyApplyFix'] = async (request) => {
  const { applyFix } = await import('../../packages/adapters/shopify/src/index.js');
  return applyFix(request);
};

const realMarkDeployed: ApplyDeps['markDeployed'] = async (itemId) => {
  const { getConfig }    = await import('../../packages/core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'deployed', updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw new Error(`markDeployed failed: ${error.message}`);
};

const realMarkFailed: ApplyDeps['markFailed'] = async (itemId, errorMsg) => {
  const { getConfig }    = await import('../../packages/core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { error } = await db
    .from('action_queue')
    .update({
      execution_status: 'failed',
      updated_at:       new Date().toISOString(),
      proposed_fix:     { error: errorMsg },
    })
    .eq('id', itemId);
  if (error) throw new Error(`markFailed failed: ${error.message}`);
};

const realWriteLog: ApplyDeps['writeLog'] = (entry) => {
  // Fire-and-forget: import and call writeLog from action-log
  void (async () => {
    try {
      const { writeLog } = await import('../../packages/action-log/src/index.js');
      writeLog({
        run_id:    '',
        tenant_id: '',
        site_id:   '',
        cms:       'shopify',
        command:   'apply-engine',
        ...entry,
      });
    } catch { /* non-fatal */ }
  })();
};

function defaultDeps(): ApplyDeps {
  return {
    loadItem:         realLoadItem,
    loadCredentials:  realLoadCredentials,
    shopifyApplyFix:  realShopifyApplyFix,
    markDeployed:     realMarkDeployed,
    markFailed:       realMarkFailed,
    writeLog:         realWriteLog,
  };
}

// ── applyFix ────────────────────────────────────────────────────────────────

/**
 * Apply a single approved fix.
 *
 * 1. Map issue_type → Shopify fix_type
 * 2. Load credentials for the site
 * 3. Call Shopify adapter
 * 4. On success: mark deployed, log
 * 5. On failure: mark failed, log
 *
 * Never throws.
 *
 * Options:
 *   overrideReview — if true, items with triage_recommendation='review' will
 *                    be applied anyway. Default: false.
 */
export async function applyFix(
  item:      ApprovedItem,
  _testDeps?: Partial<ApplyDeps>,
  options?:  { overrideReview?: boolean },
): Promise<ApplyResult> {
  const deps = { ...defaultDeps(), ..._testDeps };
  const start = Date.now();

  // Validate status
  if (item.execution_status !== 'approved') {
    return {
      action_id: item.id,
      success:   false,
      fix_type:  item.issue_type,
      error:     `Item is not approved (status: ${item.execution_status})`,
    };
  }

  // ── Triage gate ──────────────────────────────────────────────────────────
  if (item.triage_recommendation === 'skip') {
    deps.writeLog({
      action_id: item.id,
      stage:     'apply:skipped',
      status:    'skipped',
      url:       item.url,
      error:     'Triage recommendation: skip',
    });
    return {
      action_id: item.id,
      success:   false,
      fix_type:  item.issue_type,
      error:     'Skipped by triage (recommendation: skip)',
    };
  }

  if (item.triage_recommendation === 'review' && !options?.overrideReview) {
    deps.writeLog({
      action_id: item.id,
      stage:     'apply:skipped',
      status:    'skipped',
      url:       item.url,
      error:     'Triage recommendation: review (no override)',
    });
    return {
      action_id: item.id,
      success:   false,
      fix_type:  item.issue_type,
      error:     'Skipped by triage (recommendation: review — pass overrideReview to apply)',
    };
  }

  // Map issue_type to Shopify fix_type
  const fixType = mapIssueToFixType(item.issue_type);
  if (!fixType) {
    const err = `Unknown issue_type: ${item.issue_type}`;
    try { await deps.markFailed(item.id, err); } catch { /* non-fatal */ }
    deps.writeLog({ action_id: item.id, stage: 'apply:failed', status: 'failed', error: err });
    return { action_id: item.id, success: false, fix_type: item.issue_type, error: err };
  }

  // Load credentials
  let creds: { access_token: string; store_url: string };
  try {
    const found = await deps.loadCredentials(item.site_id);
    if (!found) {
      const err = `No credentials found for site ${item.site_id}`;
      await deps.markFailed(item.id, err);
      deps.writeLog({ action_id: item.id, stage: 'apply:failed', status: 'failed', error: err });
      return { action_id: item.id, success: false, fix_type: fixType, error: err };
    }
    creds = found;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await deps.markFailed(item.id, msg); } catch { /* non-fatal */ }
    deps.writeLog({ action_id: item.id, stage: 'apply:failed', status: 'failed', error: msg });
    return { action_id: item.id, success: false, fix_type: fixType, error: msg };
  }

  // Build Shopify fix request
  const afterValue = buildAfterValue(fixType, item.proposed_fix);
  const request: ShopifyFixRequest = {
    action_id:    item.id,
    access_token: creds.access_token,
    store_url:    creds.store_url,
    fix_type:     fixType,
    target_url:   item.url,
    before_value: {},
    after_value:  afterValue,
    sandbox:      false,
  };

  deps.writeLog({
    action_id: item.id,
    stage:     'apply:start',
    status:    'pending',
    url:       item.url,
    field:     fixType,
  });

  // Execute
  let result: ShopifyFixResult;
  try {
    result = await deps.shopifyApplyFix(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await deps.markFailed(item.id, msg); } catch { /* non-fatal */ }
    deps.writeLog({
      action_id:   item.id,
      stage:       'apply:failed',
      status:      'failed',
      url:         item.url,
      error:       msg,
      duration_ms: Date.now() - start,
    });
    return { action_id: item.id, success: false, fix_type: fixType, error: msg };
  }

  const duration = Date.now() - start;

  if (result.success) {
    try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
    deps.writeLog({
      action_id:   item.id,
      stage:       'apply:deployed',
      status:      'ok',
      url:         item.url,
      field:       fixType,
      duration_ms: duration,
    });
    return {
      action_id:    item.id,
      success:      true,
      fix_type:     fixType,
      before_value: result.before_value,
    };
  }

  // Adapter returned success=false
  const errMsg = result.error ?? 'Shopify adapter returned success=false';
  try { await deps.markFailed(item.id, errMsg); } catch { /* non-fatal */ }
  deps.writeLog({
    action_id:   item.id,
    stage:       'apply:failed',
    status:      'failed',
    url:         item.url,
    error:       errMsg,
    duration_ms: duration,
  });
  return { action_id: item.id, success: false, fix_type: fixType, error: errMsg };
}

// ── applyBatch ──────────────────────────────────────────────────────────────

/**
 * Apply multiple approved items sequentially.
 * Returns summary with applied/failed counts.
 */
export async function applyBatch(
  items:     ApprovedItem[],
  _testDeps?: Partial<ApplyDeps>,
  options?:  { overrideReview?: boolean },
): Promise<ApplyBatchResult> {
  const results: ApplyResult[] = [];
  const errors: string[] = [];
  let applied = 0;
  let failed  = 0;

  for (const item of items) {
    const result = await applyFix(item, _testDeps, options);
    results.push(result);
    if (result.success) {
      applied++;
    } else {
      failed++;
      if (result.error) errors.push(`${item.id}: ${result.error}`);
    }
  }

  return { applied, failed, results, errors };
}
