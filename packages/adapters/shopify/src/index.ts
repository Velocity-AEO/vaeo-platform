/**
 * packages/adapters/shopify/src/index.ts
 *
 * Shopify CMS adapter for Velocity AEO.
 * Handles all communication with the Shopify Admin API.
 *
 * Design rules:
 *   - Never throws — always returns result with success flag
 *   - fetch is injectable for unit tests (_injectFetch)
 *   - applyFix / revertFix are MVP stubs (real API calls in v2)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopifyCredentials {
  access_token: string;
  store_url:    string;
}

export interface VerifyResult {
  success:     boolean;
  store_name?: string;
  error?:      string;
}

export interface ShopifyFixRequest {
  action_id:    string;
  access_token: string;
  store_url:    string;
  fix_type:     'meta_title' | 'meta_description' | 'h1' | 'image_alt' | 'schema' | 'redirect';
  target_url:   string;
  before_value: Record<string, unknown>;
  after_value:  Record<string, unknown>;
  sandbox?:     boolean;
}

export interface ShopifyFixResult {
  action_id: string;
  success:   boolean;
  fix_type:  string;
  sandbox:   boolean;
  error?:    string;
}

export interface ShopifyRevertRequest {
  action_id:    string;
  access_token: string;
  store_url:    string;
  fix_type:     string;
  before_value: Record<string, unknown>;
}

export interface ShopifyRevertResult {
  action_id: string;
  success:   boolean;
  error?:    string;
}

// ── Injectable fetch ──────────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

let _fetchFn: FetchFn | undefined;

export function _injectFetch(fn: FetchFn): void {
  _fetchFn = fn;
}

export function _resetInjections(): void {
  _fetchFn = undefined;
}

function getFetch(): FetchFn {
  return _fetchFn ?? fetch;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseStoreUrl(raw: string): string {
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Verifies Shopify Admin API credentials by calling /admin/api/2024-01/shop.json.
 * Never throws — returns success=false with error on failure.
 */
export async function verifyConnection(
  credentials: ShopifyCredentials,
): Promise<VerifyResult> {
  const host = normaliseStoreUrl(credentials.store_url);
  const url  = `https://${host}/admin/api/2024-01/shop.json`;

  try {
    const res = await getFetch()(url, {
      method:  'GET',
      headers: {
        'X-Shopify-Access-Token': credentials.access_token,
        'Content-Type':           'application/json',
      },
    });

    if (res.ok) {
      let store_name: string | undefined;
      try {
        const body = await res.json() as Record<string, unknown>;
        const shop  = body['shop'] as Record<string, unknown> | undefined;
        store_name = shop?.['name'] as string | undefined;
      } catch { /* ignore parse errors */ }
      return { success: true, store_name };
    }

    if (res.status === 401 || res.status === 403) {
      return { success: false, error: 'invalid_credentials' };
    }

    return { success: false, error: `Shopify API returned ${res.status}` };
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Applies a fix to a Shopify store.
 * MVP stub — logs intent and returns success=true.
 * Real implementation connects to Shopify Admin API (v2).
 */
export async function applyFix(request: ShopifyFixRequest): Promise<ShopifyFixResult> {
  const sandbox = request.sandbox ?? true;

  process.stderr.write(
    `[shopify-adapter] fix:applying — action_id=${request.action_id}, fix_type=${request.fix_type}\n`,
  );

  try {
    // MVP stub: real Shopify Admin API write goes here in v2
    // e.g. PATCH /admin/api/2024-01/pages/{id}.json for meta_title / meta_description

    process.stderr.write(
      `[shopify-adapter] fix:applied — action_id=${request.action_id}, success=true\n`,
    );
    return { action_id: request.action_id, success: true, fix_type: request.fix_type, sandbox };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[shopify-adapter] fix:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { action_id: request.action_id, success: false, fix_type: request.fix_type, sandbox, error: msg };
  }
}

/**
 * Reverts a previously applied fix using the stored before_value.
 * MVP stub — logs intent and returns success=true.
 */
export async function revertFix(request: ShopifyRevertRequest): Promise<ShopifyRevertResult> {
  process.stderr.write(
    `[shopify-adapter] fix:applying — action_id=${request.action_id}, fix_type=${request.fix_type}\n`,
  );

  try {
    // MVP stub: real Shopify Admin API revert goes here in v2

    process.stderr.write(
      `[shopify-adapter] fix:applied — action_id=${request.action_id}, success=true\n`,
    );
    return { action_id: request.action_id, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[shopify-adapter] fix:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { action_id: request.action_id, success: false, error: msg };
  }
}
