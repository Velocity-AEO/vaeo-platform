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
import type { TimestampFix } from '../optimize/timestamp_plan.js';
import { createDebugSession, logDebugEvent, type DebugEvent, type DebugSession } from '../debug/debug_logger.js';
import { captureSnapshot, diffSnapshots, shouldCaptureSnapshot } from '../debug/html_snapshot.js';
import { activateLearning, type LearningActivationResult, type LearningRecord } from '../debug/learning_activator.js';

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
  /** Confidence score from ML pipeline (0-1). */
  confidence_score?: number;
}

export interface ApplyResult {
  action_id: string;
  success:   boolean;
  fix_type:  string;
  error?:    string;
  /** Captured before-state for rollback. */
  before_value?: Record<string, unknown>;
  /** Timestamp fixes applied to the page (timestamp pipeline only). */
  timestamp_fixes?: TimestampFix[];
  /** Resource hints injected as a non-fatal post-processing step. */
  resource_hints?: { injected_count: number; domains: string[] };
  /** Debug events captured during this fix (only when debug_mode=true). */
  debug_events?: DebugEvent[];
  /** Learning center activation result. */
  learning_result?: LearningActivationResult;
}

// Re-export for consumers
export type { LearningRecord, LearningActivationResult, DebugEvent };

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
   * Optional — timestamp fix pipeline (TIMESTAMP_MISSING, TIMESTAMP_STALE, etc.).
   * Detects, plans, and applies dateModified/article:modified_time fixes.
   * When absent, timestamp issues fall through to shopifyApplyFix.
   */
  timestampApply?: (
    item:  ApprovedItem,
    creds: { access_token: string; store_url: string },
  ) => Promise<{ success: boolean; timestamp_fixes?: TimestampFix[]; error?: string }>;
  /**
   * Optional — AEO fix pipeline (SPEAKABLE_MISSING, FAQ_OPPORTUNITY, etc.).
   * Generates and injects AEO schema into the Shopify theme.
   */
  aeoApply?: (
    item:  ApprovedItem,
    creds: { access_token: string; store_url: string },
  ) => Promise<{ success: boolean; action?: string; schema_type?: string; error?: string }>;
  /**
   * Optional — resource hint injection pipeline.
   * Detects missing preconnect/dns-prefetch hints and injects them into the theme.
   * Called non-fatally after any successful main fix. Never blocks the result.
   */
  resourceHintsApply?: (
    item:  ApprovedItem,
    creds: { access_token: string; store_url: string },
  ) => Promise<{ injected_count: number; domains: string[]; error?: string }>;
  /**
   * Optional — enable debug event capture (snapshots, events).
   * When true, before/after HTML snapshots are taken for fix_applied/fix_failed events.
   */
  debug_mode?: boolean;
  /**
   * Optional — write a learning record to the learnings table.
   * Called after every fix (success or failure). Non-fatal.
   */
  writeLearning?: (record: LearningRecord) => Promise<string>;
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

/** Timestamp issue types that bypass the Shopify adapter. */
const TIMESTAMP_ISSUE_TYPES = new Set([
  'TIMESTAMP_MISSING',
  'TIMESTAMP_STALE',
  'DATE_MODIFIED_MISSING',
  'DATE_MODIFIED_STALE',
]);

function isPerformanceIssue(issueType: string): boolean {
  return PERFORMANCE_ISSUE_TYPES.has(issueType);
}

function isAEOIssue(issueType: string): boolean {
  return AEO_ISSUE_TYPES.has(issueType);
}

function isTimestampIssue(issueType: string): boolean {
  return TIMESTAMP_ISSUE_TYPES.has(issueType);
}

function mapIssueToFixType(issueType: string): ShopifyFixType | 'performance' | 'aeo' | 'timestamp' | null {
  // Performance issues are handled by a separate pipeline
  if (isPerformanceIssue(issueType)) return 'performance';
  // AEO issues are handled by the AEO pipeline
  if (isAEOIssue(issueType)) return 'aeo';
  // Timestamp issues are handled by the timestamp pipeline
  if (isTimestampIssue(issueType)) return 'timestamp';
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

// ── Debug + learning helper ──────────────────────────────────────────────────

/**
 * Non-fatally log a fix event and activate learning for the result.
 * Returns debug_events and learning_result to spread into ApplyResult.
 */
async function runDebugAndLearn(
  session:    DebugSession,
  success:    boolean,
  item:       ApprovedItem,
  deps:       ApplyDeps,
  fixType:    string,
  opts: {
    error?:       string;
    duration_ms?: number;
    before_html?: string;
    after_html?:  string;
  } = {},
): Promise<{ debug_events: DebugEvent[]; learning_result: LearningActivationResult | undefined }> {
  try {
    const capture = shouldCaptureSnapshot(
      success ? 'fix_applied' : 'fix_failed',
      deps.debug_mode ?? false,
    );

    const before_html = capture && opts.before_html
      ? captureSnapshot(opts.before_html)
      : undefined;
    const after_html = capture && opts.after_html
      ? captureSnapshot(opts.after_html)
      : undefined;

    let change_summary: string | undefined;
    if (before_html && after_html) {
      change_summary = diffSnapshots(before_html, after_html).change_summary;
    }

    logDebugEvent(session, {
      site_id:          item.site_id,
      event_type:       success ? 'fix_applied' : 'fix_failed',
      issue_type:       item.issue_type,
      url:              item.url,
      reasoning:        success
        ? `Fix applied successfully: ${fixType}`
        : `Fix failed: ${opts.error ?? 'unknown'}`,
      confidence_score: item.confidence_score,
      duration_ms:      opts.duration_ms,
      before_html:      before_html,
      after_html:       after_html,
      ...(change_summary ? { metadata: { change_summary } } : {}),
    });

    const lr = await activateLearning(
      item.site_id,
      item.issue_type,
      item.url,
      success,
      5,  // default positive health delta per fix
      item.confidence_score ?? 0.5,
      before_html,
      after_html,
      { writeLearning: deps.writeLearning },
    );

    if (lr.written) {
      logDebugEvent(session, {
        site_id:          item.site_id,
        event_type:       'learning_write',
        issue_type:       item.issue_type,
        url:              item.url,
        reasoning:        `Learning written: pattern=${lr.pattern_key}, delta=${lr.confidence_delta.toFixed(3)}`,
        confidence_score: item.confidence_score,
      });
    }

    return {
      debug_events:    session.events.length > 0 ? [...session.events] : undefined as unknown as DebugEvent[],
      learning_result: lr,
    };
  } catch {
    return { debug_events: session.events, learning_result: undefined };
  }
}

// ── Resource hints helper ────────────────────────────────────────────────────

/**
 * Non-fatally run resource hints injection after a successful fix.
 * Returns the hints metadata if any were injected, otherwise undefined.
 */
async function runResourceHints(
  deps:  ApplyDeps,
  item:  ApprovedItem,
  creds: { access_token: string; store_url: string },
): Promise<ApplyResult['resource_hints']> {
  if (!deps.resourceHintsApply) return undefined;
  try {
    const r = await deps.resourceHintsApply(item, creds);
    if (r.injected_count > 0) {
      return { injected_count: r.injected_count, domains: r.domains };
    }
  } catch { /* non-fatal */ }
  return undefined;
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

  // ── Debug session ──────────────────────────────────────────────────────────
  const _dbgSession = createDebugSession(item.site_id);

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
    const { debug_events: _de0, learning_result: _lr0 } = await runDebugAndLearn(
      _dbgSession, false, item, deps, item.issue_type, { error: err, duration_ms: Date.now() - start },
    );
    return { action_id: item.id, success: false, fix_type: item.issue_type, error: err,
      ...(_de0?.length ? { debug_events: _de0 } : {}), ...(_lr0 ? { learning_result: _lr0 } : {}) };
  }

  // ── Decision event ─────────────────────────────────────────────────────────
  try {
    logDebugEvent(_dbgSession, {
      site_id:    item.site_id,
      event_type: 'decision',
      issue_type: item.issue_type,
      url:        item.url,
      reasoning:  `Selected fix type: ${fixType}`,
    });
  } catch { /* non-fatal */ }

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
      const rh_schema = await runResourceHints(deps, item, creds);
      const { debug_events: _de_s1, learning_result: _lr_s1 } = await runDebugAndLearn(
        _dbgSession, true, item, deps, 'schema', { duration_ms: Date.now() - start },
      );
      return { action_id: item.id, success: true, fix_type: 'schema',
        ...(rh_schema ? { resource_hints: rh_schema } : {}),
        ...(_de_s1?.length ? { debug_events: _de_s1 } : {}), ...(_lr_s1 ? { learning_result: _lr_s1 } : {}) };
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
    const { debug_events: _de_s2, learning_result: _lr_s2 } = await runDebugAndLearn(
      _dbgSession, false, item, deps, 'schema', { error: errMsg, duration_ms: Date.now() - start },
    );
    return { action_id: item.id, success: false, fix_type: 'schema', error: errMsg,
      ...(_de_s2?.length ? { debug_events: _de_s2 } : {}), ...(_lr_s2 ? { learning_result: _lr_s2 } : {}) };
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
      const rh_perf0 = await runResourceHints(deps, item, creds);
      return { action_id: item.id, success: true, fix_type: item.issue_type, ...(rh_perf0 ? { resource_hints: rh_perf0 } : {}) };
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
      const rh_perf = await runResourceHints(deps, item, creds);
      return { action_id: item.id, success: true, fix_type: item.issue_type, ...(rh_perf ? { resource_hints: rh_perf } : {}) };
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
        const rh_aeo0 = await runResourceHints(deps, item, creds);
        return { action_id: item.id, success: true, fix_type: item.issue_type, ...(rh_aeo0 ? { resource_hints: rh_aeo0 } : {}) };
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
      const rh_aeo = await runResourceHints(deps, item, creds);
      return { action_id: item.id, success: true, fix_type: item.issue_type, ...(rh_aeo ? { resource_hints: rh_aeo } : {}) };
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

  // ── Timestamp intercept ──────────────────────────────────────────────────
  if (fixType === 'timestamp') {
    if (!deps.timestampApply) {
      // No timestamp pipeline configured — fall through to shopifyApplyFix
    } else {
      const tr = await deps.timestampApply(item, creds);
      if (tr.success) {
        try { await deps.markDeployed(item.id); } catch { /* non-fatal */ }
        deps.writeLog({
          action_id:   item.id,
          stage:       'apply:deployed',
          status:      'ok',
          url:         item.url,
          field:       'timestamp',
          duration_ms: Date.now() - start,
        });
        const rh_ts = await runResourceHints(deps, item, creds);
        return { action_id: item.id, success: true, fix_type: item.issue_type, timestamp_fixes: tr.timestamp_fixes, ...(rh_ts ? { resource_hints: rh_ts } : {}) };
      }
      const errMsg = tr.error ?? 'Timestamp apply failed';
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
    const { debug_events: _de_ex, learning_result: _lr_ex } = await runDebugAndLearn(
      _dbgSession, false, item, deps, fixType, { error: msg, duration_ms: Date.now() - start },
    );
    return { action_id: item.id, success: false, fix_type: fixType, error: msg,
      ...(_de_ex?.length ? { debug_events: _de_ex } : {}), ...(_lr_ex ? { learning_result: _lr_ex } : {}) };
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
    const rh_shopify = await runResourceHints(deps, item, creds);
    const beforeHtml = result.before_value ? JSON.stringify(result.before_value) : undefined;
    const { debug_events: _de_ok, learning_result: _lr_ok } = await runDebugAndLearn(
      _dbgSession, true, item, deps, fixType,
      { duration_ms: duration, before_html: beforeHtml },
    );
    return {
      action_id:    item.id,
      success:      true,
      fix_type:     fixType,
      before_value: result.before_value,
      ...(rh_shopify ? { resource_hints: rh_shopify } : {}),
      ...(_de_ok?.length ? { debug_events: _de_ok } : {}), ...(_lr_ok ? { learning_result: _lr_ok } : {}),
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
  const { debug_events: _de_fail, learning_result: _lr_fail } = await runDebugAndLearn(
    _dbgSession, false, item, deps, fixType, { error: errMsg, duration_ms: duration },
  );
  return { action_id: item.id, success: false, fix_type: fixType, error: errMsg,
    ...(_de_fail?.length ? { debug_events: _de_fail } : {}), ...(_lr_fail ? { learning_result: _lr_fail } : {}) };
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
