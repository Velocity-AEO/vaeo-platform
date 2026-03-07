/**
 * packages/commands/src/connect.ts
 *
 * vaeo connect — authenticate a CMS site and register it with VAEO.
 *
 * Steps:
 *   1. Validate input (cms, required fields, Shopify URL format)
 *   2. Verify credentials against the live CMS via injected verify ops
 *   3. If verification fails: return success=false with error message
 *   4. Generate site_id (UUID v4)
 *   5. Upsert site record in Supabase sites table
 *   6. Write ActionLog: connect:verified (ok) or connect:failed (failed)
 *   7. Return ConnectResult
 *
 * Never throws — always returns ConnectResult.
 * Supabase errors: return success=false with message.
 * Network errors from verify: return success=false with message.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../../core/config.js';
import { writeLog } from '../../action-log/src/index.js';

// ── Public types ───────────────────────────────────────────────────────────────

export interface ShopifyCredentials {
  /** Shopify Admin API access token (shpat_...). */
  access_token: string;
  /** Shopify store domain — must end in .myshopify.com. */
  store_url:    string;
}

export interface WordPressCredentials {
  /** WordPress site URL (e.g. https://mysite.com). */
  site_url:     string;
  /** WordPress admin username. */
  username:     string;
  /** WordPress Application Password. */
  app_password: string;
}

export interface ConnectRequest {
  cms:         'shopify' | 'wordpress';
  tenant_id:   string;
  /** Public-facing site URL stored in Supabase for reference. */
  site_url:    string;
  credentials: ShopifyCredentials | WordPressCredentials;
}

export interface ConnectResult {
  success:     boolean;
  site_id:     string;
  cms:         string;
  site_url:    string;
  tenant_id:   string;
  verified_at: string;
  error?:      string;
}

// ── Supabase record ───────────────────────────────────────────────────────────

export interface SiteRecord {
  site_id:     string;
  tenant_id:   string;
  cms_type:    'shopify' | 'wordpress';
  site_url:    string;
  created_at:  string;
  verified_at: string;
}

// ── Injectable ops ────────────────────────────────────────────────────────────

export interface ConnectOps {
  verifyShopify:   (creds: ShopifyCredentials)   => Promise<{ ok: boolean; error?: string }>;
  verifyWordPress: (creds: WordPressCredentials) => Promise<{ ok: boolean; error?: string }>;
  upsertSite:      (record: SiteRecord)          => Promise<void>;
  generateId:      ()                             => string;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  error?: string;
}

export function validateRequest(req: ConnectRequest): ValidationResult {
  if (req.cms !== 'shopify' && req.cms !== 'wordpress') {
    return { valid: false, error: `Invalid cms '${String(req.cms)}' — must be 'shopify' or 'wordpress'` };
  }
  if (!req.tenant_id?.trim()) {
    return { valid: false, error: 'tenant_id is required' };
  }
  if (!req.site_url?.trim()) {
    return { valid: false, error: 'site_url is required' };
  }
  if (!req.credentials) {
    return { valid: false, error: 'credentials are required' };
  }

  if (req.cms === 'shopify') {
    const c = req.credentials as ShopifyCredentials;
    if (!c.access_token?.trim()) {
      return { valid: false, error: 'ShopifyCredentials.access_token is required' };
    }
    if (!c.store_url?.trim()) {
      return { valid: false, error: 'ShopifyCredentials.store_url is required' };
    }
    if (!c.store_url.endsWith('.myshopify.com')) {
      return {
        valid: false,
        error:  `store_url must end in .myshopify.com — got '${c.store_url}'`,
      };
    }
  } else {
    const c = req.credentials as WordPressCredentials;
    if (!c.site_url?.trim()) {
      return { valid: false, error: 'WordPressCredentials.site_url is required' };
    }
    if (!c.username?.trim()) {
      return { valid: false, error: 'WordPressCredentials.username is required' };
    }
    if (!c.app_password?.trim()) {
      return { valid: false, error: 'WordPressCredentials.app_password is required' };
    }
  }

  return { valid: true };
}

// ── Real implementations ───────────────────────────────────────────────────────

async function realVerifyShopify(
  creds: ShopifyCredentials,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Strip any https:// prefix — the store_url may arrive either way
    const host = creds.store_url.replace(/^https?:\/\//i, '');
    const url  = `https://${host}/admin/api/2025-01/shop.json`;
    const res  = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': creds.access_token,
        'Content-Type':           'application/json',
      },
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    return { ok: false, error: `Shopify API returned ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function realVerifyWordPress(
  creds: WordPressCredentials,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const base  = creds.site_url.replace(/\/$/, '');
    const url   = `${base}/wp-json/wp/v2/users/me`;
    const token = Buffer.from(`${creds.username}:${creds.app_password}`).toString('base64');
    const res   = await fetch(url, {
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type':  'application/json',
      },
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    return { ok: false, error: `WordPress API returned ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function realUpsertSite(record: SiteRecord): Promise<void> {
  const cfg    = getConfig();
  const client = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { error } = await client
    .from('sites')
    .upsert(record, { onConflict: 'site_id' });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

function defaultOps(): ConnectOps {
  return {
    verifyShopify:   realVerifyShopify,
    verifyWordPress: realVerifyWordPress,
    upsertSite:      realUpsertSite,
    generateId:      () => randomUUID(),
  };
}

// ── runConnect ────────────────────────────────────────────────────────────────

/**
 * Authenticates a CMS site and registers it in Supabase.
 * Never throws — always returns ConnectResult.
 */
export async function runConnect(
  request:   ConnectRequest,
  _testOps?: Partial<ConnectOps>,
): Promise<ConnectResult> {
  const ops   = _testOps ? { ...defaultOps(), ..._testOps } : defaultOps();
  const runId = randomUUID(); // internal run ID — always real, not injectable
  const now   = new Date().toISOString();
  const safeCms = (request.cms ?? 'shopify') as 'shopify' | 'wordpress';

  /** Writes connect:failed ActionLog and returns a failure result. */
  const fail = (error: string, siteId = ''): ConnectResult => {
    writeLog({
      run_id:    runId,
      tenant_id: request.tenant_id ?? '',
      site_id:   siteId,
      cms:       safeCms,
      command:   'connect',
      stage:     'connect:failed',
      status:    'failed',
      error,
    });
    return {
      success:     false,
      site_id:     siteId,
      cms:         request.cms ?? '',
      site_url:    request.site_url ?? '',
      tenant_id:   request.tenant_id ?? '',
      verified_at: now,
      error,
    };
  };

  // ── 1. Validate ───────────────────────────────────────────────────────────
  const v = validateRequest(request);
  if (!v.valid) return fail(v.error!);

  // ── 2. Verify credentials ─────────────────────────────────────────────────
  let verify: { ok: boolean; error?: string };
  try {
    verify = request.cms === 'shopify'
      ? await ops.verifyShopify(request.credentials as ShopifyCredentials)
      : await ops.verifyWordPress(request.credentials as WordPressCredentials);
  } catch (err) {
    return fail(`Verification error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!verify.ok) return fail(verify.error ?? 'Credential verification failed');

  // ── 3. Generate site_id ───────────────────────────────────────────────────
  const siteId = ops.generateId();

  // ── 4. Upsert site in Supabase ────────────────────────────────────────────
  const record: SiteRecord = {
    site_id:     siteId,
    tenant_id:   request.tenant_id,
    cms_type:    request.cms,
    site_url:    request.site_url,
    created_at:  now,
    verified_at: now,
  };

  try {
    await ops.upsertSite(record);
  } catch (err) {
    return fail(
      `Failed to register site: ${err instanceof Error ? err.message : String(err)}`,
      siteId, // include so caller can reference for retry
    );
  }

  // ── 5. Write ActionLog ────────────────────────────────────────────────────
  writeLog({
    run_id:    runId,
    tenant_id: request.tenant_id,
    site_id:   siteId,
    cms:       request.cms,
    command:   'connect',
    stage:     'connect:verified',
    status:    'ok',
    metadata:  { cms_type: request.cms, site_url: request.site_url },
  });

  // ── 6. Return result ──────────────────────────────────────────────────────
  return {
    success:     true,
    site_id:     siteId,
    cms:         request.cms,
    site_url:    request.site_url,
    tenant_id:   request.tenant_id,
    verified_at: now,
  };
}

// ── CLI runner ────────────────────────────────────────────────────────────────

/**
 * Parses CLI options and calls runConnect. Called from apps/terminal/src/index.ts.
 * Prints ConnectResult as JSON to stdout. Sets process.exitCode = 1 on failure.
 */
export async function runConnectCli(opts: {
  cms:          string;
  store?:       string;
  token?:       string;
  url?:         string;
  username?:    string;
  appPassword?: string;
  tenantId:     string;
}): Promise<void> {
  let request: ConnectRequest;

  if (opts.cms === 'shopify') {
    request = {
      cms:       'shopify',
      tenant_id: opts.tenantId,
      site_url:  opts.store ?? '',
      credentials: {
        access_token: opts.token ?? '',
        store_url:    opts.store ?? '',
      },
    };
  } else {
    request = {
      cms:       opts.cms as 'wordpress',
      tenant_id: opts.tenantId,
      site_url:  opts.url ?? '',
      credentials: {
        site_url:     opts.url ?? '',
        username:     opts.username ?? '',
        app_password: opts.appPassword ?? '',
      },
    };
  }

  const result = await runConnect(request);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.success) process.exitCode = 1;
}
