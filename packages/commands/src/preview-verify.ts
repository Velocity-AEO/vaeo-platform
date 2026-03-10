/**
 * packages/commands/src/preview-verify.ts
 *
 * vaeo preview-verify — verifies a patched theme file by rendering it
 * locally with liquidjs instead of calling the Shopify API.
 *
 * Per-item flow:
 *   1. Load the patched theme file content from the sandbox theme copy.
 *   2. Render it locally via renderTemplate(content, context).
 *   3. Extract SEO fields from the rendered HTML.
 *   4. Validate SEO fields against VAEO rules.
 *      - pass → mark verified
 *      - fail → return issues list
 *   5. If liquidjs render throws, fall back to Shopify API verify.
 *
 * Status derivation:
 *   'passed'  — all items verified (no issues)
 *   'failed'  — all checked items have issues (or request validation failed)
 *   'partial' — some passed, some failed
 *
 * Never throws — always returns PreviewVerifyResult.
 */

import { createLogger } from '../../action-log/src/index.js';
import {
  renderTemplate,
  extractSeoFields,
  validateSeoFields,
  type ShopifyContext,
  type SeoFields,
  type ValidationResult,
} from '../../../tools/sandbox/liquid_renderer.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PreviewItem {
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
  /** Theme template path, e.g. "templates/product.liquid". */
  template_path?:   string;
}

export interface PreviewVerifyIssue {
  item_id:    string;
  url:        string;
  issue_type: string;
  field:      string;
  rule:       string;
  severity:   string;
  message:    string;
  source:     'liquid' | 'shopify_api';
}

export interface PreviewVerifyRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
}

export interface PreviewVerifyResult {
  run_id:       string;
  site_id:      string;
  tenant_id:    string;
  items_checked: number;
  passed:       number;
  failed:       number;
  /** Number of items that fell back to Shopify API verify. */
  fallbacks:    number;
  issues:       PreviewVerifyIssue[];
  completed_at: string;
  status:       'passed' | 'failed' | 'partial';
  error?:       string;
}

// ── Ops interface (injectable) ───────────────────────────────────────────────

export interface PreviewVerifyOps {
  /** Load action_queue items ready for preview verification. */
  loadItems:         (runId: string, tenantId: string) => Promise<PreviewItem[]>;
  /** Read the patched theme file content from the sandbox copy. */
  readPatchedFile:   (siteId: string, templatePath: string) => Promise<string | null>;
  /** Build the Shopify context for rendering a template (product, collection, etc). */
  buildContext:      (item: PreviewItem) => Promise<ShopifyContext>;
  /** Fallback: call the Shopify API to verify the item when local render fails. */
  shopifyApiVerify:  (item: PreviewItem) => Promise<{ passed: boolean; issues: Array<{ field: string; rule: string; severity: string; message: string }> }>;
  /** Mark an item as verified in the database. */
  markVerified:      (itemId: string, tenantId: string) => Promise<void>;
  /** Mark an item as having verification issues. */
  markIssuesFound:   (itemId: string, tenantId: string, issues: PreviewVerifyIssue[]) => Promise<void>;
}

// ── Default (real) ops ───────────────────────────────────────────────────────

const realLoadItems: PreviewVerifyOps['loadItems'] = async (runId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .in('execution_status', ['queued', 'pending_approval']);
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  return (data ?? []) as PreviewItem[];
};

const realReadPatchedFile: PreviewVerifyOps['readPatchedFile'] = async (_siteId, _templatePath) => {
  throw new Error('realReadPatchedFile: sandbox file reader not configured — inject via _testOps');
};

const realBuildContext: PreviewVerifyOps['buildContext'] = async (_item) => {
  // Default: empty context. Real implementation would load product/collection data.
  return {};
};

const realShopifyApiVerify: PreviewVerifyOps['shopifyApiVerify'] = async (_item) => {
  throw new Error('realShopifyApiVerify: Shopify API not configured — inject via _testOps');
};

const realMarkVerified: PreviewVerifyOps['markVerified'] = async (itemId, tenantId) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'verified', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markVerified failed: ${error.message}`);
};

const realMarkIssuesFound: PreviewVerifyOps['markIssuesFound'] = async (itemId, tenantId, _issues) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { getConfig }    = await import('../../core/config.js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'preview_failed', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`markIssuesFound failed: ${error.message}`);
};

// ── runPreviewVerify ─────────────────────────────────────────────────────────

/**
 * Main preview-verify entry point.
 *
 * For each item:
 *   1. Load patched file from sandbox.
 *   2. Render locally with liquidjs.
 *   3. Extract + validate SEO fields.
 *   4. On validation pass → markVerified.
 *   5. On validation fail → record issues, markIssuesFound.
 *   6. If render throws → fall back to shopifyApiVerify.
 *
 * Never throws — always returns PreviewVerifyResult.
 */
export async function runPreviewVerify(
  request:   PreviewVerifyRequest,
  _testOps?: Partial<PreviewVerifyOps>,
): Promise<PreviewVerifyResult> {
  const ops: PreviewVerifyOps = {
    loadItems:        realLoadItems,
    readPatchedFile:  realReadPatchedFile,
    buildContext:     realBuildContext,
    shopifyApiVerify: realShopifyApiVerify,
    markVerified:     realMarkVerified,
    markIssuesFound:  realMarkIssuesFound,
    ..._testOps,
  };

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    command:   'preview-verify',
  });

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!request.run_id)    return failedResult(request, 'run_id is required');
  if (!request.tenant_id) return failedResult(request, 'tenant_id is required');
  if (!request.site_id)   return failedResult(request, 'site_id is required');

  // ── preview-verify:start ──────────────────────────────────────────────────

  log({ stage: 'preview-verify:start', status: 'pending' });

  // ── Step 1: Load items ────────────────────────────────────────────────────

  let items: PreviewItem[];
  try {
    items = await ops.loadItems(request.run_id, request.tenant_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ stage: 'preview-verify:failed', status: 'failed', metadata: { error: msg } });
    return failedResult(request, msg);
  }

  if (items.length === 0) {
    const completed_at = new Date().toISOString();
    log({
      stage:    'preview-verify:complete',
      status:   'ok',
      metadata: { items_checked: 0, passed: 0, failed: 0, fallbacks: 0 },
    });
    return {
      run_id:        request.run_id,
      site_id:       request.site_id,
      tenant_id:     request.tenant_id,
      items_checked: 0,
      passed:        0,
      failed:        0,
      fallbacks:     0,
      issues:        [],
      completed_at,
      status:        'passed',
    };
  }

  // ── Step 2: Process each item ─────────────────────────────────────────────

  let passedCount    = 0;
  let failedCount    = 0;
  let fallbackCount  = 0;
  const allIssues: PreviewVerifyIssue[] = [];

  for (const item of items) {
    const templatePath = item.template_path ?? inferTemplatePath(item);

    // ── Try local Liquid render ───────────────────────────────────────────
    let usedFallback = false;
    let validationResult: ValidationResult | null = null;
    let seoFields: SeoFields | null = null;

    try {
      const content = await ops.readPatchedFile(item.site_id, templatePath);
      if (content === null) {
        throw new Error(`Patched file not found: ${templatePath}`);
      }

      const context = await ops.buildContext(item);
      const html    = await renderTemplate(content, context);
      seoFields        = extractSeoFields(html);
      validationResult = validateSeoFields(seoFields);
    } catch (renderErr) {
      // ── Fall back to Shopify API verify ────────────────────────────────
      usedFallback = true;
      fallbackCount++;

      log({
        stage:    'preview-verify:liquid_fallback',
        status:   'warning',
        metadata: {
          item_id: item.id,
          url:     item.url,
          error:   renderErr instanceof Error ? renderErr.message : String(renderErr),
        },
      });

      try {
        const apiResult = await ops.shopifyApiVerify(item);
        validationResult = {
          pass:   apiResult.passed,
          issues: apiResult.issues.map((i) => ({
            field:    i.field,
            rule:     i.rule,
            severity: i.severity as 'critical' | 'major' | 'minor',
            message:  i.message,
            value:    null,
          })),
        };
      } catch (apiErr) {
        // Both liquid and API failed — treat as a failed item
        const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        log({
          stage:    'preview-verify:item_error',
          status:   'error',
          metadata: { item_id: item.id, url: item.url, error: msg },
        });
        allIssues.push({
          item_id:    item.id,
          url:        item.url,
          issue_type: item.issue_type,
          field:      'render',
          rule:       'render_failed',
          severity:   'critical',
          message:    `Both Liquid and Shopify API verify failed: ${msg}`,
          source:     'shopify_api',
        });
        try { await ops.markIssuesFound(item.id, item.tenant_id, []); } catch { /* non-blocking */ }
        failedCount++;
        continue;
      }
    }

    // ── Process validation result ─────────────────────────────────────────

    if (validationResult!.pass) {
      passedCount++;
      try { await ops.markVerified(item.id, item.tenant_id); } catch { /* non-blocking */ }
      log({
        stage:    'preview-verify:item_passed',
        status:   'ok',
        metadata: { item_id: item.id, url: item.url, source: usedFallback ? 'shopify_api' : 'liquid' },
      });
    } else {
      failedCount++;
      const source = usedFallback ? 'shopify_api' as const : 'liquid' as const;
      const itemIssues: PreviewVerifyIssue[] = validationResult!.issues.map((vi) => ({
        item_id:    item.id,
        url:        item.url,
        issue_type: item.issue_type,
        field:      vi.field,
        rule:       vi.rule,
        severity:   vi.severity,
        message:    vi.message,
        source,
      }));
      allIssues.push(...itemIssues);
      try { await ops.markIssuesFound(item.id, item.tenant_id, itemIssues); } catch { /* non-blocking */ }
      log({
        stage:    'preview-verify:item_failed',
        status:   'error',
        metadata: {
          item_id: item.id,
          url:     item.url,
          source,
          issues:  itemIssues.map((i) => i.rule),
        },
      });
    }
  }

  // ── Derive overall status ─────────────────────────────────────────────────

  const overallStatus: PreviewVerifyResult['status'] =
    failedCount === 0           ? 'passed'
    : passedCount === 0         ? 'failed'
    : 'partial';

  const completed_at = new Date().toISOString();

  log({
    stage:    'preview-verify:complete',
    status:   overallStatus === 'passed' ? 'ok' : 'error',
    metadata: {
      items_checked: items.length,
      passed:        passedCount,
      failed:        failedCount,
      fallbacks:     fallbackCount,
      issues_count:  allIssues.length,
    },
  });

  return {
    run_id:        request.run_id,
    site_id:       request.site_id,
    tenant_id:     request.tenant_id,
    items_checked: items.length,
    passed:        passedCount,
    failed:        failedCount,
    fallbacks:     fallbackCount,
    issues:        allIssues,
    completed_at,
    status:        overallStatus,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function failedResult(req: PreviewVerifyRequest, error: string): PreviewVerifyResult {
  return {
    run_id:        req.run_id    ?? '',
    site_id:       req.site_id   ?? '',
    tenant_id:     req.tenant_id ?? '',
    items_checked: 0,
    passed:        0,
    failed:        0,
    fallbacks:     0,
    issues:        [],
    completed_at:  new Date().toISOString(),
    status:        'failed',
    error,
  };
}

/** Infer the template path from issue_type if not explicitly set. */
function inferTemplatePath(item: PreviewItem): string {
  const url = item.url.toLowerCase();
  if (url.includes('/products/'))    return 'templates/product.liquid';
  if (url.includes('/collections/')) return 'templates/collection.liquid';
  if (url.includes('/pages/'))       return 'templates/page.liquid';
  if (url.includes('/blogs/'))       return 'templates/article.liquid';
  // Default to index for homepage or unknown paths
  if (url.endsWith('/') || url.endsWith('.com') || url.endsWith('.com/')) return 'templates/index.liquid';
  return 'templates/page.liquid';
}

// Re-export for tests
export { inferTemplatePath as _inferTemplatePath };

// ── CLI entry point ──────────────────────────────────────────────────────────

export async function runPreviewVerifyCli(opts: {
  runId:    string;
  tenantId: string;
  siteId:   string;
}): Promise<void> {
  const result = await runPreviewVerify({
    run_id:    opts.runId,
    tenant_id: opts.tenantId,
    site_id:   opts.siteId,
  });

  if (result.status !== 'failed' || result.error === undefined) {
    const fallbackLabel = result.fallbacks > 0
      ? `, ${result.fallbacks} Shopify API fallback(s)`
      : '';
    const issueLabel = result.issues.length > 0
      ? `, ${result.issues.length} issue(s) found`
      : '';
    console.log(
      `${result.status === 'passed' ? '✓' : '⚠'} Preview-verify ${result.status} — ` +
      `${result.items_checked} checked, ${result.passed} passed, ${result.failed} failed` +
      fallbackLabel + issueLabel,
    );
  } else {
    console.error(`✗ Preview-verify failed: ${result.error}`);
    process.exitCode = 1;
  }
}
