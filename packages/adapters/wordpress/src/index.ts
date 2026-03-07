/**
 * packages/adapters/wordpress/src/index.ts
 *
 * WordPress CMS adapter for Velocity AEO.
 * Handles all communication with the WordPress REST API.
 *
 * Auth: Application Passwords → Basic base64(username:password)
 *
 * Design rules:
 *   - Never throws — always returns result with success flag
 *   - fetch is injectable for unit tests (_injectFetch)
 *   - 429 rate-limit: wait 500ms and retry once
 *   - SEO plugin auto-detected (Yoast / Rank Math / none) per request
 *   - before_value captured from GET before every PATCH (rollback-safe)
 *
 * Implemented fix types:
 *   meta_title        → _yoast_wpseo_title (Yoast) | rank_math_title (Rank Math) | native title
 *   meta_description  → _yoast_wpseo_metadesc (Yoast) | rank_math_description (Rank Math) | excerpt
 *
 * Stub (log + success=true):
 *   h1, schema, redirect
 *
 * Also exports WordPressAdapter class (CMSAdapter interface stub — unchanged).
 */

import type {
  CMSAdapter,
  PatchManifest,
  TemplateRef,
  UrlEntry,
} from '../../../../packages/core/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WpCredentials {
  site_url:     string;
  username:     string;
  app_password: string;
}

export interface VerifyResult {
  success:     boolean;
  site_url?:   string;
  page_count?: number;
  error?:      string;
}

export type WpFixType = 'meta_title' | 'meta_description' | 'h1' | 'schema' | 'redirect';

export interface WpFixRequest {
  action_id:    string;
  site_url:     string;
  username:     string;
  app_password: string;
  fix_type:     WpFixType;
  target_url:   string;
  before_value: Record<string, unknown>;
  after_value:  Record<string, unknown>;
}

export interface WpFixResult {
  action_id:    string;
  success:      boolean;
  fix_type:     string;
  before_value?: Record<string, unknown>;
  error?:       string;
}

export interface WpRevertRequest {
  action_id:    string;
  site_url:     string;
  username:     string;
  app_password: string;
  fix_type:     string;
  before_value: Record<string, unknown>;
}

export interface WpRevertResult {
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

/** Build Basic auth header — strips spaces from app password (WP display format). */
function basicAuth(username: string, appPassword: string): string {
  const password = appPassword.replace(/\s/g, '');
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function jsonHeaders(authHeader: string): Record<string, string> {
  return {
    Authorization:  authHeader,
    'Content-Type': 'application/json',
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps a fetch call with one 429-retry. */
async function wpFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await getFetch()(url, init);
  if (res.status === 429) {
    console.log(`[wordpress] 429 rate-limit — retrying in 500ms: ${init.method} ${url}`);
    await sleep(500);
    return getFetch()(url, init);
  }
  return res;
}

/** Normalize site_url — strip trailing slash. */
function normaliseSiteUrl(url: string): string {
  return url.replace(/\/$/, '');
}

/** Convert a title-like handle to title case. */
function titleFromSlug(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extract the last path segment as a WP slug.
 * http://vaeo-poc.local/sample-page/ → sample-page
 * http://vaeo-poc.local/blog/my-post/ → my-post
 */
function slugFromUrl(targetUrl: string): string | null {
  try {
    const parts = new URL(targetUrl).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

// ── SEO plugin detection ──────────────────────────────────────────────────────

export type SeoPlugin = 'yoast' | 'rank_math' | 'none';

/** Meta key names per plugin for title and description. */
const SEO_KEYS: Record<SeoPlugin, { title: string; description: string }> = {
  yoast:     { title: '_yoast_wpseo_title',   description: '_yoast_wpseo_metadesc' },
  rank_math: { title: 'rank_math_title',        description: 'rank_math_description' },
  none:      { title: '',                        description: '' },
};

/**
 * Detect the active SEO plugin by querying /wp-json/wp/v2/plugins.
 * Requires manage_options/activate_plugins capability (admin user).
 * Falls back to 'none' on any error.
 */
export async function detectSeoPlugin(
  siteUrl:    string,
  authHeader: string,
): Promise<SeoPlugin> {
  try {
    const url = `${siteUrl}/wp-json/wp/v2/plugins?_fields=plugin,status`;
    const res  = await wpFetch(url, { method: 'GET', headers: { Authorization: authHeader } });
    if (!res.ok) return 'none';

    const plugins = await res.json() as Array<{ plugin?: string; status?: string }>;
    for (const p of plugins) {
      if (p.status !== 'active') continue;
      const slug = p.plugin ?? '';
      if (slug.includes('wordpress-seo') || slug.includes('wpseo')) return 'yoast';
      if (slug.includes('seo-by-rank-math') || slug.includes('rank-math')) return 'rank_math';
    }
    return 'none';
  } catch {
    return 'none';
  }
}

// ── Resource lookup ───────────────────────────────────────────────────────────

interface WpResource {
  id:      number;
  type:    'page' | 'post';
  title:   string;
  meta:    Record<string, unknown>;
  excerpt: string;
}

/** Find a WP page or post by slug. Returns null if not found. */
async function lookupResource(
  siteUrl:    string,
  authHeader: string,
  slug:       string,
): Promise<WpResource | null> {
  const fields = 'id,title,meta,excerpt,link';
  const contexts = [
    { type: 'page' as const, url: `${siteUrl}/wp-json/wp/v2/pages?slug=${slug}&context=edit&_fields=${fields}` },
    { type: 'post' as const, url: `${siteUrl}/wp-json/wp/v2/posts?slug=${slug}&context=edit&_fields=${fields}` },
  ];

  for (const ctx of contexts) {
    console.log(`[wordpress] GET ${ctx.url}`);
    const res  = await wpFetch(ctx.url, { method: 'GET', headers: { Authorization: authHeader } });
    if (!res.ok) continue;
    const items = await res.json() as Array<{
      id: number;
      title: { raw?: string; rendered?: string };
      meta: Record<string, unknown>;
      excerpt: { raw?: string };
    }>;
    if (items?.length) {
      const item = items[0];
      return {
        id:      item.id,
        type:    ctx.type,
        title:   item.title?.raw ?? item.title?.rendered ?? '',
        meta:    item.meta ?? {},
        excerpt: item.excerpt?.raw ?? '',
      };
    }
  }
  return null;
}

// ── PATCH helper ──────────────────────────────────────────────────────────────

async function patchResource(
  siteUrl:    string,
  authHeader: string,
  resource:   Pick<WpResource, 'id' | 'type'>,
  body:       Record<string, unknown>,
): Promise<void> {
  const endpoint = resource.type === 'page' ? 'pages' : 'posts';
  const url = `${siteUrl}/wp-json/wp/v2/${endpoint}/${resource.id}`;
  console.log(`[wordpress] PATCH ${url}`, JSON.stringify(body));
  const res = await wpFetch(url, {
    method:  'PATCH',
    headers: jsonHeaders(authHeader),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${url} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── Rollback manifest persistence ─────────────────────────────────────────────

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
    await db.from('action_queue').update({ rollback_manifest: beforeValue }).eq('id', actionId);
  } catch { /* non-fatal */ }
}

// ── verifyConnection ──────────────────────────────────────────────────────────

/**
 * Verifies WordPress REST API access by listing pages.
 * Returns success=true with site_url and page_count on success.
 * Never throws.
 */
export async function verifyConnection(credentials: WpCredentials): Promise<VerifyResult> {
  const base = normaliseSiteUrl(credentials.site_url);
  const auth = basicAuth(credentials.username, credentials.app_password);
  const url  = `${base}/wp-json/wp/v2/pages?_fields=id&per_page=100`;

  try {
    console.log(`[wordpress] GET ${url}`);
    const res = await getFetch()(url, {
      method:  'GET',
      headers: { Authorization: auth },
    });

    if (res.ok) {
      let page_count = 0;
      try {
        const body = await res.json() as unknown[];
        page_count = body.length;
      } catch { /* ignore parse errors */ }
      return { success: true, site_url: base, page_count };
    }

    if (res.status === 401 || res.status === 403) {
      return { success: false, error: 'invalid_credentials' };
    }

    return { success: false, error: `WordPress API returned ${res.status}` };
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }
}

// ── applyFix ──────────────────────────────────────────────────────────────────

/**
 * Applies a fix to WordPress via the REST API.
 *
 * Implemented: meta_title, meta_description (auto-detects Yoast/Rank Math/native).
 * Stub (log + success=true): h1, schema, redirect.
 *
 * Never throws — returns success=false with error on failure.
 */
export async function applyFix(request: WpFixRequest): Promise<WpFixResult> {
  const base = normaliseSiteUrl(request.site_url);
  const auth = basicAuth(request.username, request.app_password);

  process.stderr.write(
    `[wordpress-adapter] fix:applying — action_id=${request.action_id}, fix_type=${request.fix_type}\n`,
  );

  try {
    let beforeValue: Record<string, unknown> = {};

    if (request.fix_type === 'meta_title' || request.fix_type === 'meta_description') {
      beforeValue = await applyMetaFix(request, base, auth);
    } else {
      process.stderr.write(
        `[wordpress-adapter] fix:stub — fix_type=${request.fix_type} not yet wired, returning success=true\n`,
      );
    }

    if (request.action_id && Object.keys(beforeValue).length > 0) {
      persistRollbackManifest(request.action_id, beforeValue).catch(() => {});
    }

    process.stderr.write(
      `[wordpress-adapter] fix:applied — action_id=${request.action_id}, success=true\n`,
    );
    return {
      action_id:    request.action_id,
      success:      true,
      fix_type:     request.fix_type,
      before_value: Object.keys(beforeValue).length > 0 ? beforeValue : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[wordpress-adapter] fix:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { action_id: request.action_id, success: false, fix_type: request.fix_type, error: msg };
  }
}

async function applyMetaFix(
  request: WpFixRequest,
  base:    string,
  auth:    string,
): Promise<Record<string, unknown>> {
  const isTitle = request.fix_type === 'meta_title';

  // 1. Slug from URL
  const slug = slugFromUrl(request.target_url);
  if (!slug) throw new Error(`Cannot extract slug from URL: ${request.target_url}`);

  // 2. Detect SEO plugin (parallel with resource lookup for speed)
  const [plugin, resource] = await Promise.all([
    detectSeoPlugin(base, auth),
    lookupResource(base, auth, slug),
  ]);

  if (!resource) throw new Error(`Resource not found for slug: ${slug}`);

  const keys     = SEO_KEYS[plugin];
  const metaKey  = isTitle ? keys.title : keys.description;
  const useNative = plugin === 'none' || !metaKey;

  // 3. Capture before_value
  let beforeValue: Record<string, unknown>;
  if (useNative) {
    beforeValue = {
      resource_id:   resource.id,
      resource_type: resource.type,
      plugin:        'none',
      field:         isTitle ? 'title' : 'excerpt',
      old_value:     isTitle ? resource.title : resource.excerpt,
    };
  } else {
    beforeValue = {
      resource_id:   resource.id,
      resource_type: resource.type,
      plugin,
      meta_key:      metaKey,
      old_value:     (resource.meta[metaKey] as string | null | undefined) ?? null,
    };
  }

  // 4. Determine new value
  const newValue = isTitle
    ? String(request.after_value['new_title']       || request.after_value['title']       || '').trim()
      || titleFromSlug(slug)
    : String(request.after_value['new_description'] || request.after_value['description'] || '').trim();

  if (!newValue) throw new Error(`No new value for ${request.fix_type} on ${request.target_url}`);

  // 5. PATCH
  if (useNative) {
    const body: Record<string, unknown> = isTitle
      ? { title: newValue }
      : { excerpt: newValue };
    await patchResource(base, auth, resource, body);
  } else {
    await patchResource(base, auth, resource, { meta: { [metaKey]: newValue } });
  }

  return beforeValue;
}

// ── revertFix ─────────────────────────────────────────────────────────────────

/**
 * Reverts a previously applied fix using the stored before_value.
 *
 * before_value shape (plugin meta): { resource_id, resource_type, plugin, meta_key, old_value }
 * before_value shape (native):      { resource_id, resource_type, plugin:'none', field, old_value }
 *
 * Never throws — returns success=false with error on failure.
 */
export async function revertFix(request: WpRevertRequest): Promise<WpRevertResult> {
  process.stderr.write(
    `[wordpress-adapter] revert:applying — action_id=${request.action_id}, fix_type=${request.fix_type}\n`,
  );

  const base = normaliseSiteUrl(request.site_url);
  const auth = basicAuth(request.username, request.app_password);
  const bv   = request.before_value;

  try {
    if (request.fix_type === 'meta_title' || request.fix_type === 'meta_description') {
      const resourceId   = bv['resource_id'] as number | undefined;
      const resourceType = (bv['resource_type'] as 'page' | 'post' | undefined) ?? 'page';
      const plugin       = (bv['plugin'] as SeoPlugin | undefined) ?? 'none';
      const oldValue     = bv['old_value'] as string | null | undefined;

      if (!resourceId) {
        throw new Error('revertFix: before_value.resource_id required');
      }

      const resource = { id: resourceId, type: resourceType };

      if (plugin === 'none') {
        // Native field
        const field = (bv['field'] as string) ?? (request.fix_type === 'meta_title' ? 'title' : 'excerpt');
        const body: Record<string, unknown> = { [field]: oldValue ?? '' };
        await patchResource(base, auth, resource, body);
      } else {
        const metaKey = bv['meta_key'] as string | undefined;
        if (!metaKey) throw new Error('revertFix: before_value.meta_key required for plugin revert');
        await patchResource(base, auth, resource, { meta: { [metaKey]: oldValue ?? '' } });
      }
    } else {
      process.stderr.write(
        `[wordpress-adapter] revert:stub — fix_type=${request.fix_type} not yet wired, returning success=true\n`,
      );
    }

    process.stderr.write(
      `[wordpress-adapter] revert:applied — action_id=${request.action_id}, success=true\n`,
    );
    return { action_id: request.action_id, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[wordpress-adapter] revert:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { action_id: request.action_id, success: false, error: msg };
  }
}

// ── WordPressAdapter class (CMSAdapter interface stub) ────────────────────────

export class WordPressAdapter implements CMSAdapter {
  async fetch_state(_siteId: string): Promise<Record<string, unknown>> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async apply_patch(_manifest: PatchManifest): Promise<string[]> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async rollback(_manifest: PatchManifest): Promise<void> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async list_templates(_siteId: string): Promise<TemplateRef[]> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async list_urls(_siteId: string): Promise<UrlEntry[]> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }
}

export default WordPressAdapter;
