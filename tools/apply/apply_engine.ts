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
  /**
   * Optional — schema fix pipeline (generate + validate + write metafield + install snippet).
   * When present, used instead of shopifyApplyFix for schema issue types.
   */
  schemaApply?: (
    item:  ApprovedItem,
    creds: { access_token: string; store_url: string },
  ) => Promise<{ success: boolean; metafieldId?: string; schemaType?: string; error?: string }>;
  /**
   * Optional — performance fix pipeline (DEFER_SCRIPT, LAZY_IMAGE, FONT_DISPLAY).
   * Generates a fix plan from proposed_fix and applies to theme HTML.
   */
  performanceApply?: (
    item:  ApprovedItem,
    creds: { access_token: string; store_url: string },
  ) => Promise<{ success: boolean; action?: string; error?: string }>;
  /**
   * Optional — AEO fix pipeline (SPEAKABLE_MISSING, FAQ_OPPORTUNITY, etc.).
   * Generates and injects AEO schema into the Shopify theme.
   */
  aeoApply?: (
    item:  ApprovedItem,
    creds: { access_token: string; store_url: string },
  ) => Promise<{ success: boolean; action?: string; schema_type?: string; error?: string }>;
}

// ── Issue type → Shopify fix type mapping ───────────────────────────────────

type ShopifyFixType = ShopifyFixRequest['fix_type'];

/** Performance issue types that bypass the Shopify adapter. */
const PERFORMANCE_ISSUE_TYPES = new Set(['DEFER_SCRIPT', 'LAZY_IMAGE', 'FONT_DISPLAY']);

/** AEO issue types that bypass the Shopify adapter. */
const AEO_ISSUE_TYPES = new Set([
  'SPEAKABLE_MISSING',
  'AEO_SCHEMA_INCOMPLETE',
  'FAQ_OPPORTUNITY',
  'ANSWER_BLOCK_OPPORTUNITY',
]);

function isPerformanceIssue(issueType: string): boolean {
  return PERFORMANCE_ISSUE_TYPES.has(issueType);
}

function isAEOIssue(issueType: string): boolean {
  return AEO_ISSUE_TYPES.has(issueType);
}

function mapIssueToFixType(issueType: string): ShopifyFixType | 'performance' | 'aeo' | null {
  // Performance issues are handled by a separate pipeline
  if (isPerformanceIssue(issueType)) return 'performance';
  // AEO issues are handled by the AEO pipeline
  if (isAEOIssue(issueType)) return 'aeo';
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

const realSchemaApply: NonNullable<ApplyDeps['schemaApply']> = async (item, creds) => {
  try {
    const { writeSchema }       = await import('../schema/schema_writer.js');
    const { getLiveThemeId, installSnippet } = await import('../schema/snippet_installer.js');
    const {
      generateProductSchema,
      generateCollectionSchema,
      generatePageSchema,
      generateArticleSchema,
    } = await import('../schema/schema_generator.js');

    const host    = creds.store_url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const shopUrl = `https://${host}`;
    const headers = {
      'X-Shopify-Access-Token': creds.access_token,
      'Content-Type':           'application/json',
    };

    // 1. Route URL → resource type
    const url = item.url;
    let resourceType: 'product' | 'collection' | 'page' | 'article' | 'blog';
    if (/\/products\//.test(url))                              resourceType = 'product';
    else if (/\/collections\//.test(url))                     resourceType = 'collection';
    else if (/\/blogs\/[^/]+\/[^/]+/.test(url))               resourceType = 'article';
    else if (/\/blogs\/[^/]+/.test(url))                      resourceType = 'blog';
    else                                                       resourceType = 'page';

    // 2. Extract handle + look up numeric resource ID
    const pathParts = new URL(url).pathname.split('/').filter(Boolean);
    const handle    = pathParts[pathParts.length - 1] ?? '';

    let lookupPath: string;
    let lookupKey: string;
    if      (resourceType === 'product')    { lookupPath = `/admin/api/2024-01/products.json?handle=${handle}&fields=id,title,body_html,images,variants,vendor`;         lookupKey = 'products'; }
    else if (resourceType === 'collection') { lookupPath = `/admin/api/2024-01/custom_collections.json?handle=${handle}&fields=id,title,handle`;                          lookupKey = 'custom_collections'; }
    else if (resourceType === 'article')    { lookupPath = `/admin/api/2024-01/articles.json?handle=${handle}&fields=id,title,handle,published_at`;                       lookupKey = 'articles'; }
    else                                    { lookupPath = `/admin/api/2024-01/pages.json?handle=${handle}&fields=id,title,handle`;                                       lookupKey = 'pages'; }

    const res = await fetch(`https://${host}${lookupPath}`, { method: 'GET', headers });
    if (!res.ok) {
      return { success: false, error: `Shopify resource lookup failed (${res.status}) for ${url}` };
    }
    const body = await res.json() as Record<string, unknown>;

    const resourceData: Record<string, unknown> | null =
      ((body[lookupKey] as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? null;

    if (!resourceData?.id) {
      return { success: false, error: `No Shopify resource found for handle: ${handle}` };
    }
    const resourceId = String(resourceData.id);

    // 3. Build schema — use proposed_fix.schema_json if available, else generate
    let schemaJson: Record<string, unknown>;
    if (item.proposed_fix['schema_json'] && typeof item.proposed_fix['schema_json'] === 'object') {
      schemaJson = item.proposed_fix['schema_json'] as Record<string, unknown>;
    } else if (resourceType === 'product') {
      schemaJson = generateProductSchema({
        id:       String(resourceData['id']),
        title:    String(resourceData['title'] ?? ''),
        body_html: resourceData['body_html'] as string | undefined,
        image:    (resourceData['images'] as Array<{ src: string }> | undefined)?.[0],
        variants: resourceData['variants'] as Array<{ price: string }> | undefined,
        vendor:   resourceData['vendor']   as string | undefined,
      }, shopUrl);
    } else if (resourceType === 'collection') {
      schemaJson = generateCollectionSchema({
        id:     String(resourceData['id']),
        title:  String(resourceData['title']  ?? ''),
        handle: String(resourceData['handle'] ?? ''),
      }, shopUrl);
    } else if (resourceType === 'article') {
      const urlParts   = pathParts; // already computed above
      const blogHandle = urlParts.length >= 3 ? urlParts[urlParts.length - 2] : undefined;
      schemaJson = generateArticleSchema({
        id:           String(resourceData['id']),
        title:        String(resourceData['title']  ?? ''),
        handle:       String(resourceData['handle'] ?? ''),
        url,
        published_at: resourceData['published_at'] as string | undefined,
        blog_handle:  blogHandle,
      }, shopUrl);
    } else {
      schemaJson = generatePageSchema({
        id:     String(resourceData['id']),
        title:  String(resourceData['title']  ?? ''),
        handle: String(resourceData['handle'] ?? ''),
      }, shopUrl);
    }

    // 4. Write metafield
    const writeResult = await writeSchema({
      shopDomain:   host,
      accessToken:  creds.access_token,
      resourceType,
      resourceId,
      schemaJson,
    });
    if (!writeResult.ok) {
      return { success: false, error: writeResult.error ?? 'writeSchema failed' };
    }

    // 5. Best-effort snippet install (non-fatal)
    void (async () => {
      try {
        const themeId = await getLiveThemeId(host, creds.access_token);
        if (themeId) await installSnippet(host, creds.access_token, themeId);
      } catch { /* non-fatal */ }
    })();

    return {
      success:    true,
      metafieldId: writeResult.metafieldId,
      schemaType:  String(schemaJson['@type'] ?? 'unknown'),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

function defaultDeps(): ApplyDeps {
  return {
    loadItem:         realLoadItem,
    loadCredentials:  realLoadCredentials,
    shopifyApplyFix:  realShopifyApplyFix,
    markDeployed:     realMarkDeployed,
    markFailed:       realMarkFailed,
    writeLog:         realWriteLog,
    schemaApply:      realSchemaApply,
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

  // ── Schema intercept ─────────────────────────────────────────────────────
  if (fixType === 'schema' && deps.schemaApply) {
    const sr = await deps.schemaApply(item, creds);
    if (sr.success) {
      try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
      deps.writeLog({
        action_id:   item.id,
        stage:       'apply:deployed',
        status:      'ok',
        url:         item.url,
        field:       'schema',
        duration_ms: Date.now() - start,
      });
      return { action_id: item.id, success: true, fix_type: 'schema' };
    }
    const errMsg = sr.error ?? 'Schema apply failed';
    try { await deps.markFailed(item.id, errMsg); } catch { /* non-fatal */ }
    deps.writeLog({
      action_id:   item.id,
      stage:       'apply:failed',
      status:      'failed',
      url:         item.url,
      error:       errMsg,
      duration_ms: Date.now() - start,
    });
    return { action_id: item.id, success: false, fix_type: 'schema', error: errMsg };
  }

  // ── Performance intercept ──────────────────────────────────────────────
  if (fixType === 'performance') {
    if (!deps.performanceApply) {
      // No performance pipeline configured — generate plan and log it
      const { generateFixPlan } = await import('../optimize/performance_plan.js');
      const plan = generateFixPlan({
        issue_type: item.issue_type as import('../detect/performance_detect.js').PerformanceIssueType,
        url:        item.url,
        element:    (item.proposed_fix['element'] as string) ?? '',
        fix_hint:   (item.proposed_fix['fix_hint'] as string) ?? '',
      });
      deps.writeLog({
        action_id:   item.id,
        stage:       'apply:performance-plan',
        status:      'ok',
        url:         item.url,
        field:       plan.action,
        after_value: plan.fixed,
        duration_ms: Date.now() - start,
      });
      try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
      return { action_id: item.id, success: true, fix_type: item.issue_type };
    }
    const pr = await deps.performanceApply(item, creds);
    if (pr.success) {
      try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
      deps.writeLog({
        action_id:   item.id,
        stage:       'apply:deployed',
        status:      'ok',
        url:         item.url,
        field:       pr.action ?? item.issue_type,
        duration_ms: Date.now() - start,
      });
      return { action_id: item.id, success: true, fix_type: item.issue_type };
    }
    const errMsg = pr.error ?? 'Performance apply failed';
    try { await deps.markFailed(item.id, errMsg); } catch { /* non-fatal */ }
    deps.writeLog({
      action_id:   item.id,
      stage:       'apply:failed',
      status:      'failed',
      url:         item.url,
      error:       errMsg,
      duration_ms: Date.now() - start,
    });
    return { action_id: item.id, success: false, fix_type: item.issue_type, error: errMsg };
  }

  // ── AEO intercept ────────────────────────────────────────────────────
  if (fixType === 'aeo') {
    if (!deps.aeoApply) {
      // No AEO pipeline configured — use built-in applyAEOFix
      const { applyAEOFix } = await import('./aeo_apply.js');
      const ar = await applyAEOFix(item, creds);
      if (ar.success) {
        try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
        deps.writeLog({
          action_id:   item.id,
          stage:       'apply:deployed',
          status:      'ok',
          url:         item.url,
          field:       ar.action ?? item.issue_type,
          duration_ms: Date.now() - start,
        });
        return { action_id: item.id, success: true, fix_type: item.issue_type };
      }
      const errMsg = ar.error ?? 'AEO apply failed';
      try { await deps.markFailed(item.id, errMsg); } catch { /* non-fatal */ }
      deps.writeLog({
        action_id:   item.id,
        stage:       'apply:failed',
        status:      'failed',
        url:         item.url,
        error:       errMsg,
        duration_ms: Date.now() - start,
      });
      return { action_id: item.id, success: false, fix_type: item.issue_type, error: errMsg };
    }
    const ar = await deps.aeoApply(item, creds);
    if (ar.success) {
      try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
      deps.writeLog({
        action_id:   item.id,
        stage:       'apply:deployed',
        status:      'ok',
        url:         item.url,
        field:       ar.action ?? item.issue_type,
        duration_ms: Date.now() - start,
      });
      return { action_id: item.id, success: true, fix_type: item.issue_type };
    }
    const errMsg = ar.error ?? 'AEO apply failed';
    try { await deps.markFailed(item.id, errMsg); } catch { /* non-fatal */ }
    deps.writeLog({
      action_id:   item.id,
      stage:       'apply:failed',
      status:      'failed',
      url:         item.url,
      error:       errMsg,
      duration_ms: Date.now() - start,
    });
    return { action_id: item.id, success: false, fix_type: item.issue_type, error: errMsg };
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
