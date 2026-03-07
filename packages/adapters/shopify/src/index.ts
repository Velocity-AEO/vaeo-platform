/**
 * packages/adapters/shopify/src/index.ts
 *
 * Shopify CMS adapter for Velocity AEO.
 * Handles all communication with the Shopify Admin API.
 *
 * Design rules:
 *   - Never throws — always returns result with success flag
 *   - fetch is injectable for unit tests (_injectFetch)
 *   - 429 rate-limit: wait 500ms and retry once
 *   - Before applying, captures current value for rollback (stored in action_queue.rollback_manifest)
 *
 * Implemented fix types:
 *   meta_title        → global.title_tag metafield on page/product/article/collection
 *   meta_description  → global.description_tag metafield
 *   image_alt         → PUT /products/{id}/images/{id}.json  (requires product_id + image_id in after_value)
 *
 * Stub fix types (log + return success=true):
 *   h1, schema, redirect
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
  action_id:    string;
  success:      boolean;
  fix_type:     string;
  sandbox:      boolean;
  /** Captured before-state for rollback — stored in action_queue.rollback_manifest. */
  before_value?: Record<string, unknown>;
  error?:       string;
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

function authHeaders(token: string): Record<string, string> {
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type':           'application/json',
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps a single fetch call with one 429-retry. */
async function shopifyFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await getFetch()(url, init);
  if (res.status === 429) {
    console.log(`[shopify] 429 rate-limit — retrying in 500ms: ${init.method} ${url}`);
    await sleep(500);
    return getFetch()(url, init);
  }
  return res;
}

// ── URL routing ───────────────────────────────────────────────────────────────

interface UrlRoute {
  type:        'page' | 'article' | 'product' | 'collection';
  handle:      string;
  blogHandle?: string;
}

function routeUrl(url: string): UrlRoute | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts[0] === 'pages'       && parts[1]) return { type: 'page',       handle: parts[1] };
    if (parts[0] === 'products'    && parts[1]) return { type: 'product',    handle: parts[1] };
    if (parts[0] === 'collections' && parts[1]) return { type: 'collection', handle: parts[1] };
    if (parts[0] === 'blogs' && parts[1] && parts[2]) {
      return { type: 'article', handle: parts[2], blogHandle: parts[1] };
    }
  } catch { /* invalid URL */ }
  return null;
}

/** Maps resource type to Shopify metafield owner_resource value. */
const METAFIELD_OWNER: Record<UrlRoute['type'], string> = {
  page:       'page',
  article:    'article',
  product:    'product',
  collection: 'custom_collection',
};

// ── Resource lookup ───────────────────────────────────────────────────────────

interface ShopifyResource {
  id:    number;
  title: string;
}

async function lookupResource(
  host:    string,
  headers: Record<string, string>,
  route:   UrlRoute,
): Promise<ShopifyResource | null> {
  if (route.type === 'page') {
    const url = `https://${host}/admin/api/2024-01/pages.json?handle=${route.handle}&limit=1&fields=id,title`;
    console.log(`[shopify] GET ${url}`);
    const res  = await shopifyFetch(url, { method: 'GET', headers });
    const body = await res.json() as { pages?: ShopifyResource[] };
    return body.pages?.[0] ?? null;
  }

  if (route.type === 'product') {
    const url = `https://${host}/admin/api/2024-01/products.json?handle=${route.handle}&limit=1&fields=id,title`;
    console.log(`[shopify] GET ${url}`);
    const res  = await shopifyFetch(url, { method: 'GET', headers });
    const body = await res.json() as { products?: ShopifyResource[] };
    return body.products?.[0] ?? null;
  }

  if (route.type === 'collection') {
    const url = `https://${host}/admin/api/2024-01/custom_collections.json?handle=${route.handle}&limit=1&fields=id,title`;
    console.log(`[shopify] GET ${url}`);
    const res  = await shopifyFetch(url, { method: 'GET', headers });
    const body = await res.json() as { custom_collections?: ShopifyResource[] };
    return body.custom_collections?.[0] ?? null;
  }

  if (route.type === 'article' && route.blogHandle) {
    // Look up blog first, then article
    const blogUrl = `https://${host}/admin/api/2024-01/blogs.json?handle=${route.blogHandle}&limit=1&fields=id`;
    const blogRes  = await shopifyFetch(blogUrl, { method: 'GET', headers });
    const blogBody = await blogRes.json() as { blogs?: { id: number }[] };
    const blog = blogBody.blogs?.[0];
    if (!blog) return null;

    const artUrl = `https://${host}/admin/api/2024-01/blogs/${blog.id}/articles.json?handle=${route.handle}&limit=1&fields=id,title`;
    console.log(`[shopify] GET ${artUrl}`);
    const artRes  = await shopifyFetch(artUrl, { method: 'GET', headers });
    const artBody = await artRes.json() as { articles?: ShopifyResource[] };
    return artBody.articles?.[0] ?? null;
  }

  return null;
}

// ── Metafield helpers ─────────────────────────────────────────────────────────

interface ShopifyMetafield {
  id:    number;
  value: string;
}

async function getMetafield(
  host:          string,
  headers:       Record<string, string>,
  ownerId:       number,
  ownerResource: string,
  key:           'title_tag' | 'description_tag',
): Promise<ShopifyMetafield | null> {
  const url = `https://${host}/admin/api/2024-01/metafields.json` +
    `?owner_id=${ownerId}&owner_resource=${ownerResource}&namespace=global&key=${key}`;
  console.log(`[shopify] GET ${url}`);
  const res  = await shopifyFetch(url, { method: 'GET', headers });
  const body = await res.json() as { metafields?: ShopifyMetafield[] };
  return body.metafields?.[0] ?? null;
}

async function upsertMetafield(
  host:          string,
  headers:       Record<string, string>,
  ownerId:       number,
  ownerResource: string,
  key:           'title_tag' | 'description_tag',
  value:         string,
  existingId?:   number,
): Promise<ShopifyMetafield> {
  if (existingId != null) {
    const url = `https://${host}/admin/api/2024-01/metafields/${existingId}.json`;
    console.log(`[shopify] PUT ${url} → ${key}="${value}"`);
    const res  = await shopifyFetch(url, {
      method:  'PUT',
      headers,
      body:    JSON.stringify({ metafield: { value } }),
    });
    if (!res.ok) throw new Error(`metafield PUT failed (${res.status})`);
    const body = await res.json() as { metafield: ShopifyMetafield };
    return body.metafield;
  }

  const url = `https://${host}/admin/api/2024-01/metafields.json`;
  console.log(`[shopify] POST ${url} → ${ownerResource}/${ownerId} ${key}="${value}"`);
  const res  = await shopifyFetch(url, {
    method:  'POST',
    headers,
    body:    JSON.stringify({
      metafield: {
        namespace:      'global',
        key,
        value,
        type:           'single_line_text_field',
        owner_id:       ownerId,
        owner_resource: ownerResource,
      },
    }),
  });
  if (!res.ok) throw new Error(`metafield POST failed (${res.status})`);
  const body = await res.json() as { metafield: ShopifyMetafield };
  return body.metafield;
}

// ── Title derivation ──────────────────────────────────────────────────────────

function titleFromHandle(handle: string): string {
  return handle.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Meta fix (title + description) ───────────────────────────────────────────

async function applyMetaFix(
  request: ShopifyFixRequest,
  host:    string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const isTitle = request.fix_type === 'meta_title';
  const metaKey: 'title_tag' | 'description_tag' = isTitle ? 'title_tag' : 'description_tag';

  const route = routeUrl(request.target_url);
  if (!route) throw new Error(`Cannot route URL: ${request.target_url}`);

  const resource = await lookupResource(host, headers, route);
  if (!resource) throw new Error(`Resource not found for URL: ${request.target_url}`);

  const ownerResource = METAFIELD_OWNER[route.type];
  const existing      = await getMetafield(host, headers, resource.id, ownerResource, metaKey);

  // Determine new value: explicit field → derive from handle
  const newValue = isTitle
    ? (String(request.after_value['new_title']       || request.after_value['title']       || '').trim() || titleFromHandle(route.handle))
    : (String(request.after_value['new_description'] || request.after_value['description'] || '').trim());

  if (!newValue) throw new Error(`No new value available for ${metaKey} on ${request.target_url}`);

  const upserted = await upsertMetafield(
    host, headers, resource.id, ownerResource, metaKey, newValue, existing?.id,
  );

  return {
    resource_type:  route.type,
    resource_id:    resource.id,
    metafield_id:   upserted.id,
    field:          metaKey,
    old_value:      existing?.value ?? null,
  };
}

// ── Image alt fix ─────────────────────────────────────────────────────────────

async function applyImageAltFix(
  request: ShopifyFixRequest,
  host:    string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const productId = request.after_value['product_id'] ?? request.after_value['shopify_product_id'];
  const imageId   = request.after_value['image_id']   ?? request.after_value['shopify_image_id'];
  const newAlt    = String(request.after_value['new_alt'] || '').trim();

  if (!productId || !imageId) {
    throw new Error('image_alt fix requires after_value.product_id and after_value.image_id');
  }
  if (!newAlt) throw new Error('image_alt fix requires after_value.new_alt');

  // GET current image to capture old alt for rollback
  const getUrl = `https://${host}/admin/api/2024-01/products/${productId}/images/${imageId}.json`;
  console.log(`[shopify] GET ${getUrl}`);
  const getRes  = await shopifyFetch(getUrl, { method: 'GET', headers });
  const getBody = await getRes.json() as { image?: { alt?: string } };
  const oldAlt  = getBody.image?.alt ?? '';

  // PUT updated alt
  const putUrl = `https://${host}/admin/api/2024-01/products/${productId}/images/${imageId}.json`;
  console.log(`[shopify] PUT ${putUrl} → alt="${newAlt}"`);
  const putRes = await shopifyFetch(putUrl, {
    method:  'PUT',
    headers,
    body:    JSON.stringify({ image: { id: imageId, alt: newAlt } }),
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`image PUT failed (${putRes.status}): ${text}`);
  }

  return { product_id: productId, image_id: imageId, old_alt: oldAlt };
}

// ── Rollback manifest persistence ─────────────────────────────────────────────

/** Best-effort: updates action_queue.rollback_manifest with captured before-state. */
async function persistRollbackManifest(
  actionId:    string,
  beforeValue: Record<string, unknown>,
): Promise<void> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) return;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(url, key);
    await db.from('action_queue')
      .update({ rollback_manifest: beforeValue })
      .eq('id', actionId);
  } catch { /* non-fatal */ }
}

// ── verifyConnection ──────────────────────────────────────────────────────────

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
      headers: authHeaders(credentials.access_token),
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

// ── applyFix ──────────────────────────────────────────────────────────────────

/**
 * Applies a fix to a Shopify store via the Admin API.
 *
 * Implemented: meta_title, meta_description, image_alt.
 * Stub (log + success=true): h1, schema, redirect.
 *
 * Never throws — returns success=false with error on failure.
 */
export async function applyFix(request: ShopifyFixRequest): Promise<ShopifyFixResult> {
  const sandbox = request.sandbox ?? true;
  const host    = normaliseStoreUrl(request.store_url);
  const headers = authHeaders(request.access_token);

  process.stderr.write(
    `[shopify-adapter] fix:applying — action_id=${request.action_id}, fix_type=${request.fix_type}\n`,
  );

  try {
    let beforeValue: Record<string, unknown> = {};

    if (request.fix_type === 'meta_title' || request.fix_type === 'meta_description') {
      beforeValue = await applyMetaFix(request, host, headers);
    } else if (request.fix_type === 'image_alt') {
      beforeValue = await applyImageAltFix(request, host, headers);
    } else {
      process.stderr.write(
        `[shopify-adapter] fix:stub — fix_type=${request.fix_type} not yet wired, returning success=true\n`,
      );
    }

    // Best-effort: persist captured before-state to action_queue.rollback_manifest
    if (request.action_id && Object.keys(beforeValue).length > 0) {
      persistRollbackManifest(request.action_id, beforeValue).catch(() => {});
    }

    process.stderr.write(
      `[shopify-adapter] fix:applied — action_id=${request.action_id}, success=true\n`,
    );
    return {
      action_id:    request.action_id,
      success:      true,
      fix_type:     request.fix_type,
      sandbox,
      before_value: Object.keys(beforeValue).length > 0 ? beforeValue : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[shopify-adapter] fix:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { action_id: request.action_id, success: false, fix_type: request.fix_type, sandbox, error: msg };
  }
}

// ── revertFix ─────────────────────────────────────────────────────────────────

/**
 * Reverts a previously applied fix using the stored before_value from rollback_manifest.
 *
 * before_value shape (meta):       { metafield_id, old_value, field, resource_type, resource_id }
 * before_value shape (image_alt):  { product_id, image_id, old_alt }
 *
 * Never throws — returns success=false with error on failure.
 */
export async function revertFix(request: ShopifyRevertRequest): Promise<ShopifyRevertResult> {
  process.stderr.write(
    `[shopify-adapter] revert:applying — action_id=${request.action_id}, fix_type=${request.fix_type}\n`,
  );

  const host    = normaliseStoreUrl(request.store_url);
  const headers = authHeaders(request.access_token);
  const bv      = request.before_value;

  try {
    if (request.fix_type === 'meta_title' || request.fix_type === 'meta_description') {
      const metafieldId = bv['metafield_id'] as number | undefined;
      if (!metafieldId) {
        throw new Error('revertFix: before_value.metafield_id required for meta revert');
      }

      const oldValue = bv['old_value'] as string | null | undefined;

      if (oldValue === null || oldValue === undefined) {
        // Metafield didn't exist before — delete it
        const url = `https://${host}/admin/api/2024-01/metafields/${metafieldId}.json`;
        console.log(`[shopify] DELETE ${url} → removing metafield added by fix`);
        const res = await shopifyFetch(url, { method: 'DELETE', headers });
        console.log(`[shopify] DELETE ${url} → ${res.status}`);
      } else {
        // Restore old value
        const url = `https://${host}/admin/api/2024-01/metafields/${metafieldId}.json`;
        console.log(`[shopify] PUT ${url} → restoring old_value="${oldValue}"`);
        const res = await shopifyFetch(url, {
          method:  'PUT',
          headers,
          body:    JSON.stringify({ metafield: { value: oldValue } }),
        });
        console.log(`[shopify] PUT ${url} → ${res.status}`);
        if (!res.ok) throw new Error(`revert PUT failed (${res.status})`);
      }
    } else if (request.fix_type === 'image_alt') {
      const productId = bv['product_id'];
      const imageId   = bv['image_id'];
      const oldAlt    = String(bv['old_alt'] ?? '');

      if (!productId || !imageId) {
        throw new Error('revertFix: before_value.product_id and before_value.image_id required');
      }

      const url = `https://${host}/admin/api/2024-01/products/${productId}/images/${imageId}.json`;
      console.log(`[shopify] PUT ${url} → restoring alt="${oldAlt}"`);
      const res = await shopifyFetch(url, {
        method:  'PUT',
        headers,
        body:    JSON.stringify({ image: { id: imageId, alt: oldAlt } }),
      });
      if (!res.ok) throw new Error(`image revert PUT failed (${res.status})`);
    } else {
      process.stderr.write(
        `[shopify-adapter] revert:stub — fix_type=${request.fix_type} not yet wired, returning success=true\n`,
      );
    }

    process.stderr.write(
      `[shopify-adapter] revert:applied — action_id=${request.action_id}, success=true\n`,
    );
    return { action_id: request.action_id, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[shopify-adapter] revert:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { action_id: request.action_id, success: false, error: msg };
  }
}
