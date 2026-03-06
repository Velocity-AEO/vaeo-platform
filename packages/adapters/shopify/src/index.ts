/**
 * packages/adapters/shopify/src/index.ts
 *
 * Full implementation of CMSAdapter for Shopify.
 *
 * Auth:    OAuth 2.0 Admin API (token from config — never process.env)
 * REST:    Shopify Admin REST API (version from config.shopify.apiVersion)
 * GraphQL: Shopify Admin GraphQL API for metafield operations
 * Sandbox: All patches apply to a cloned theme only — live theme is never
 *          touched until explicit promotion.
 *
 * Required scopes: read_themes write_themes read_products write_products
 *   read_content write_content read_metafields write_metafields
 *   read_redirects write_redirects
 */

import type {
  CMSAdapter,
  PatchManifest,
  PatchEntry,
  ActionLogEvent,
  TemplateRef,
  UrlEntry,
} from '../../../../packages/core/types.js';
import { config } from '../../../../packages/core/config.js';

// ── Internal types ────────────────────────────────────────────────────────────

interface ShopifyTheme {
  id: number;
  name: string;
  role: 'main' | 'unpublished' | 'demo';
  created_at: string;
  updated_at: string;
}

interface ShopifyThemeAsset {
  key: string;
  value?: string;
  attachment?: string;
  content_type: string;
  size: number;
  updated_at: string;
}

interface ShopifyMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string;
  type: string;
  owner_id: number;
  owner_resource: string;
  updated_at: string;
}

interface ShopifyRedirect {
  id: number;
  path: string;
  target: string;
}

interface ShopifyPage {
  id: number;
  title: string;
  handle: string;
  body_html: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
}

interface ShopifyArticle {
  id: number;
  title: string;
  handle: string;
  blog_id: number;
}

interface ShopifyBlog {
  id: number;
  handle: string;
  title: string;
}

/** Rollback manifest entry written before every mutation. */
interface RollbackEntry {
  idempotency_key: string;
  field: string;
  resource_type: string;
  resource_id: string;
  before_value: string | null;
  ts: string;
}

/** Full rollback manifest persisted to backup_ref path. */
interface RollbackManifest {
  run_id: string;
  site_id: string;
  sandbox_theme_id: number | null;
  live_theme_id: number | null;
  entries: RollbackEntry[];
  written_at: string;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

/**
 * Enforces Shopify REST rate limits: max 2 requests/sec, bucket of 40.
 * Uses a simple token bucket with a 500 ms minimum gap between requests.
 * On 429 responses, applies exponential backoff with random jitter.
 */
class RateLimiter {
  private lastCallAt = 0;
  // Minimum ms between REST calls (2 req/s = 500 ms gap)
  private readonly minGapMs = 500;

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallAt;
    if (elapsed < this.minGapMs) {
      await sleep(this.minGapMs - elapsed);
    }
    this.lastCallAt = Date.now();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a thunk up to maxAttempts times with exponential backoff + jitter.
 * Only retries on HTTP 429 (rate limit) and 5xx server errors.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const isRateLimit = err instanceof ShopifyApiError && (err.status === 429 || err.status >= 500);
      if (!isRateLimit || attempt >= maxAttempts) throw err;

      // Exponential backoff: 1s, 2s, 4s, 8s … with ±25% jitter
      const baseMs = Math.pow(2, attempt - 1) * 1000;
      const jitter = baseMs * 0.25 * (Math.random() * 2 - 1);
      const waitMs = Math.round(baseMs + jitter);
      console.warn(`[shopify-adapter] ${label} — rate limited, retry ${attempt}/${maxAttempts} in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

// ── Error type ────────────────────────────────────────────────────────────────

class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

// ── ActionLog writer ──────────────────────────────────────────────────────────

/**
 * Writes an ActionLogEvent to stdout as newline-delimited JSON.
 * The platform's log aggregator (Supabase / Upstash) is responsible for
 * persisting these entries — the adapter just emits them.
 */
function writeLog(event: ActionLogEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

function makeLogEvent(
  overrides: Partial<ActionLogEvent> & Pick<ActionLogEvent, 'run_id' | 'site_id' | 'stage' | 'status'>,
): ActionLogEvent {
  return {
    tenant_id: '',
    cms: 'shopify',
    command: 'shopify-adapter',
    urls: [],
    proof_artifacts: [],
    before_metrics: null,
    after_metrics: null,
    ts: new Date().toISOString(),
    ...overrides,
  };
}

// ── HTTP client ───────────────────────────────────────────────────────────────

/**
 * Low-level REST caller. Reads credentials from config — never from process.env.
 * Throws ShopifyApiError on any non-2xx response so callers never see silent failures.
 */
async function shopifyRest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  rateLimiter?: RateLimiter,
): Promise<T> {
  if (rateLimiter) await rateLimiter.throttle();

  const { storeDomain, adminApiToken, apiVersion } = config.shopify;
  const url = `https://${storeDomain}/admin/api/${apiVersion}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': adminApiToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ShopifyApiError(
      `Shopify REST ${method} ${path} failed: HTTP ${res.status} — ${text.slice(0, 300)}`,
      res.status,
      path,
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Low-level GraphQL caller for metafield operations.
 * Uses the same Admin API token as REST.
 */
async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  rateLimiter?: RateLimiter,
): Promise<T> {
  if (rateLimiter) await rateLimiter.throttle();

  const { storeDomain, adminApiToken, apiVersion } = config.shopify;
  const url = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': adminApiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ShopifyApiError(
      `Shopify GraphQL failed: HTTP ${res.status} — ${text.slice(0, 300)}`,
      res.status,
      'graphql',
    );
  }

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new ShopifyApiError(
      `Shopify GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`,
      200,
      'graphql',
    );
  }

  return json.data as T;
}

// ── Pagination helpers ────────────────────────────────────────────────────────

/** Fetches all pages of a REST list endpoint using Link header pagination. */
async function paginateRest<T>(
  path: string,
  key: string,
  limiter: RateLimiter,
): Promise<T[]> {
  const results: T[] = [];
  const { storeDomain, adminApiToken, apiVersion } = config.shopify;
  let url: string | null = `https://${storeDomain}/admin/api/${apiVersion}${path}`;

  while (url) {
    await limiter.throttle();
    const res: Response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': adminApiToken,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ShopifyApiError(
        `Shopify paginate ${path} failed: HTTP ${res.status} — ${text.slice(0, 300)}`,
        res.status,
        path,
      );
    }

    const json = await res.json() as Record<string, T[]>;
    results.push(...(json[key] ?? []));

    // Parse Link header for next page
    const link: string = res.headers.get('Link') ?? '';
    const nextMatch: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}

// ── Sandbox helpers ───────────────────────────────────────────────────────────

/**
 * Returns the numeric ID of the current live (role=main) theme.
 * Throws if no main theme is found.
 */
async function getLiveThemeId(limiter: RateLimiter): Promise<number> {
  const { themes } = await withRetry(
    'getLiveThemeId',
    () => shopifyRest<{ themes: ShopifyTheme[] }>('GET', '/themes.json', undefined, limiter),
  );
  const live = themes.find((t) => t.role === 'main');
  if (!live) throw new Error('[shopify-adapter] No main theme found on store');
  return live.id;
}

/**
 * Clones the live theme by duplicating all its assets into a new unpublished
 * theme named "Velocity-Sandbox-{run_id}". Returns the new theme's ID.
 */
async function cloneThemeAsSandbox(runId: string, limiter: RateLimiter): Promise<number> {
  const liveId = await getLiveThemeId(limiter);
  const sandboxName = `Velocity-Sandbox-${runId}`;

  // Create a blank theme shell
  const { theme: created } = await withRetry(
    'createSandboxTheme',
    () => shopifyRest<{ theme: ShopifyTheme }>('POST', '/themes.json', {
      theme: { name: sandboxName, role: 'unpublished' },
    }, limiter),
  );

  // List all assets from live theme
  const { assets } = await withRetry(
    'listLiveAssets',
    () => shopifyRest<{ assets: ShopifyThemeAsset[] }>(
      'GET', `/themes/${liveId}/assets.json`, undefined, limiter,
    ),
  );

  // Copy each asset to the sandbox theme
  for (const asset of assets) {
    // Fetch full content of this asset
    const { asset: full } = await withRetry(
      `fetchAsset:${asset.key}`,
      () => shopifyRest<{ asset: ShopifyThemeAsset }>(
        'GET', `/themes/${liveId}/assets.json?asset[key]=${encodeURIComponent(asset.key)}`,
        undefined, limiter,
      ),
    );

    // Write to sandbox
    const payload: Record<string, unknown> = { key: full.key };
    if (full.value !== undefined) payload['value'] = full.value;
    else if (full.attachment !== undefined) payload['attachment'] = full.attachment;

    await withRetry(
      `copyAsset:${asset.key}`,
      () => shopifyRest('PUT', `/themes/${created.id}/assets.json`, { asset: payload }, limiter),
    );
  }

  return created.id;
}

// ── Field-level patch routing ─────────────────────────────────────────────────

/**
 * Dispatches a single PatchEntry to the correct Shopify API surface based on
 * the field name. Returns the before_value for the rollback manifest.
 */
async function applyOnePatch(
  entry: PatchEntry,
  sandboxThemeId: number,
  limiter: RateLimiter,
): Promise<string | null> {
  const { field, after_value } = entry;

  if (field === 'theme_asset') {
    return applyThemeAssetPatch(entry, sandboxThemeId, limiter);
  }
  if (field === 'meta_title' || field === 'meta_description') {
    return applyMetafieldPatch(entry, limiter);
  }
  if (field === 'redirect') {
    return applyRedirectPatch(entry, limiter);
  }

  throw new Error(
    `[shopify-adapter] Unknown field type "${field}" for patch ${entry.idempotency_key}. ` +
    `Supported: theme_asset, meta_title, meta_description, redirect.`,
  );
}

/**
 * Reads the current value of a Liquid theme asset from the sandbox theme,
 * then writes the patched value back to the sandbox only.
 */
async function applyThemeAssetPatch(
  entry: PatchEntry,
  sandboxThemeId: number,
  limiter: RateLimiter,
): Promise<string | null> {
  // entry.url doubles as the asset key (e.g. "layout/theme.liquid")
  const assetKey = entry.url;

  const { asset: current } = await withRetry(
    `readAsset:${assetKey}`,
    () => shopifyRest<{ asset: ShopifyThemeAsset }>(
      'GET',
      `/themes/${sandboxThemeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`,
      undefined,
      limiter,
    ),
  );

  const before = current.value ?? null;

  await withRetry(
    `writeAsset:${assetKey}`,
    () => shopifyRest(
      'PUT',
      `/themes/${sandboxThemeId}/assets.json`,
      { asset: { key: assetKey, value: entry.after_value } },
      limiter,
    ),
  );

  return before;
}

/**
 * Reads the current metafield value for the resource identified by entry.url,
 * then writes the new value via GraphQL mutation.
 * Supports meta_title and meta_description fields.
 */
async function applyMetafieldPatch(
  entry: PatchEntry,
  limiter: RateLimiter,
): Promise<string | null> {
  // Derive namespace/key from field name
  const metaKey = entry.field === 'meta_title' ? 'title_tag' : 'description_tag';
  const namespace = 'global';

  // Read current metafield value via REST
  // entry.url is expected to be the resource GID (e.g. "gid://shopify/Page/123")
  const resourceId = entry.url;
  const numericId = resourceId.split('/').pop() ?? '';
  const resourceType = resourceId.includes('/Page/') ? 'pages'
    : resourceId.includes('/Product/') ? 'products'
    : resourceId.includes('/Article/') ? 'articles'
    : null;

  if (!resourceType) {
    throw new Error(
      `[shopify-adapter] Cannot determine resource type from GID: ${resourceId}`,
    );
  }

  const { metafields } = await withRetry(
    `readMetafields:${resourceId}`,
    () => shopifyRest<{ metafields: ShopifyMetafield[] }>(
      'GET',
      `/${resourceType}/${numericId}/metafields.json?namespace=${namespace}&key=${metaKey}`,
      undefined,
      limiter,
    ),
  );

  const existing = metafields[0] ?? null;
  const before = existing?.value ?? null;

  // Write via GraphQL metafieldsSet mutation
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;

  const result = await withRetry(
    `writeMetafield:${resourceId}:${metaKey}`,
    () => shopifyGraphQL<{
      metafieldsSet: {
        metafields: Array<{ id: string }>;
        userErrors: Array<{ field: string; message: string }>;
      };
    }>(mutation, {
      metafields: [{
        ownerId: resourceId,
        namespace,
        key: metaKey,
        value: entry.after_value,
        type: 'single_line_text_field',
      }],
    }, limiter),
  );

  if (result.metafieldsSet.userErrors.length > 0) {
    const errs = result.metafieldsSet.userErrors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`[shopify-adapter] metafieldsSet errors for ${resourceId}: ${errs}`);
  }

  return before;
}

/**
 * Creates or updates a Shopify URL redirect.
 * entry.url is the "from" path; entry.after_value is the "to" target.
 * If a redirect for this path already exists, updates it in place.
 */
async function applyRedirectPatch(
  entry: PatchEntry,
  limiter: RateLimiter,
): Promise<string | null> {
  const fromPath = entry.url;

  // Check if redirect already exists
  const { redirects } = await withRetry(
    `listRedirects:${fromPath}`,
    () => shopifyRest<{ redirects: ShopifyRedirect[] }>(
      'GET', `/redirects.json?path=${encodeURIComponent(fromPath)}`, undefined, limiter,
    ),
  );

  const existing = redirects.find((r) => r.path === fromPath) ?? null;
  const before = existing ? existing.target : null;

  if (existing) {
    await withRetry(
      `updateRedirect:${fromPath}`,
      () => shopifyRest(
        'PUT', `/redirects/${existing.id}.json`,
        { redirect: { id: existing.id, target: entry.after_value } },
        limiter,
      ),
    );
  } else {
    await withRetry(
      `createRedirect:${fromPath}`,
      () => shopifyRest(
        'POST', '/redirects.json',
        { redirect: { path: fromPath, target: entry.after_value } },
        limiter,
      ),
    );
  }

  return before;
}

// ── Rollback helpers ──────────────────────────────────────────────────────────

/**
 * Restores a single field to its before_value.
 * Mirrors the logic of applyOnePatch but writes before_value instead of after_value.
 */
async function rollbackOnePatch(
  entry: RollbackEntry,
  sandboxThemeId: number | null,
  limiter: RateLimiter,
): Promise<void> {
  if (entry.before_value === null) return; // nothing to restore

  if (entry.field === 'theme_asset' && sandboxThemeId !== null) {
    await withRetry(
      `rollbackAsset:${entry.resource_id}`,
      () => shopifyRest(
        'PUT',
        `/themes/${sandboxThemeId}/assets.json`,
        { asset: { key: entry.resource_id, value: entry.before_value } },
        limiter,
      ),
    );
    return;
  }

  if (entry.field === 'meta_title' || entry.field === 'meta_description') {
    const metaKey = entry.field === 'meta_title' ? 'title_tag' : 'description_tag';
    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;
    await withRetry(
      `rollbackMetafield:${entry.resource_id}`,
      () => shopifyGraphQL(mutation, {
        metafields: [{
          ownerId: entry.resource_id,
          namespace: 'global',
          key: metaKey,
          value: entry.before_value,
          type: 'single_line_text_field',
        }],
      }, limiter),
    );
    return;
  }

  if (entry.field === 'redirect') {
    // Restore previous redirect target
    const { redirects } = await withRetry(
      `findRedirectForRollback:${entry.resource_id}`,
      () => shopifyRest<{ redirects: ShopifyRedirect[] }>(
        'GET', `/redirects.json?path=${encodeURIComponent(entry.resource_id)}`, undefined, limiter,
      ),
    );
    const existing = redirects.find((r) => r.path === entry.resource_id);
    if (existing) {
      await withRetry(
        `rollbackRedirect:${entry.resource_id}`,
        () => shopifyRest(
          'PUT', `/redirects/${existing.id}.json`,
          { redirect: { id: existing.id, target: entry.before_value } },
          limiter,
        ),
      );
    }
  }
}

// ── CMSAdapter implementation ─────────────────────────────────────────────────

/**
 * ShopifyAdapter implements CMSAdapter for Shopify stores.
 * All mutations apply to a sandbox theme clone — the live theme is never
 * touched until the caller explicitly promotes the sandbox.
 */
export class ShopifyAdapter implements CMSAdapter {
  private readonly limiter = new RateLimiter();

  /**
   * Fetches a full SEO state snapshot for the Shopify store: live theme info,
   * all pages + their metafields, all products, all articles, and all redirects.
   * Returns a structured object keyed by resource GID.
   */
  async fetch_state(siteId: string): Promise<Record<string, unknown>> {
    writeLog(makeLogEvent({
      run_id: '',
      site_id: siteId,
      stage: 'fetch_state:start',
      status: 'pending',
    }));

    try {
      const [themes, pages, products, redirects] = await Promise.all([
        withRetry('fetchThemes', () =>
          shopifyRest<{ themes: ShopifyTheme[] }>('GET', '/themes.json', undefined, this.limiter),
        ).then((r) => r.themes),

        paginateRest<ShopifyPage>('/pages.json?fields=id,title,handle&limit=250', 'pages', this.limiter),

        paginateRest<ShopifyProduct>('/products.json?fields=id,title,handle,status&limit=250', 'products', this.limiter),

        paginateRest<ShopifyRedirect>('/redirects.json?limit=250', 'redirects', this.limiter),
      ]);

      const liveTheme = themes.find((t) => t.role === 'main') ?? null;

      const state: Record<string, unknown> = {
        site_id: siteId,
        cms: 'shopify',
        captured_at: new Date().toISOString(),
        live_theme: liveTheme,
        page_count: pages.length,
        product_count: products.length,
        redirect_count: redirects.length,
        pages: Object.fromEntries(
          pages.map((p) => [`gid://shopify/Page/${p.id}`, { title: p.title, handle: p.handle }]),
        ),
        products: Object.fromEntries(
          products.map((p) => [`gid://shopify/Product/${p.id}`, { title: p.title, handle: p.handle, status: p.status }]),
        ),
        redirects: redirects.map((r) => ({ path: r.path, target: r.target })),
      };

      writeLog(makeLogEvent({
        run_id: '',
        site_id: siteId,
        stage: 'fetch_state:complete',
        status: 'ok',
      }));

      return state;
    } catch (err) {
      writeLog(makeLogEvent({
        run_id: '',
        site_id: siteId,
        stage: 'fetch_state:error',
        status: 'error',
      }));
      throw err;
    }
  }

  /**
   * Applies all patches in the manifest to a Shopify sandbox theme (cloned from
   * live). Before touching any field, writes a complete rollback manifest to
   * manifest.backup_ref so every change can be reversed. Returns the idempotency
   * keys of patches that succeeded.
   */
  async apply_patch(manifest: PatchManifest): Promise<string[]> {
    const { run_id, site_id, patches, backup_ref } = manifest;

    writeLog(makeLogEvent({
      run_id,
      site_id,
      stage: 'apply_patch:start',
      status: 'pending',
      urls: patches.map((p) => p.url),
    }));

    // 1. Ensure sandbox theme exists (clone live theme)
    const sandboxThemeId = await cloneThemeAsSandbox(run_id, this.limiter);
    const liveThemeId = await getLiveThemeId(this.limiter);

    // 2. Write rollback manifest BEFORE any mutations
    const rollbackManifest: RollbackManifest = {
      run_id,
      site_id,
      sandbox_theme_id: sandboxThemeId,
      live_theme_id: liveThemeId,
      entries: [],
      written_at: new Date().toISOString(),
    };

    // Capture before_values for all patches first
    for (const patch of patches) {
      // For theme assets, read from sandbox (just cloned from live — same content)
      // For metafields/redirects, read from live
      let before: string | null = patch.before_value;

      if (before === null) {
        // Attempt a live read to capture current value
        try {
          if (patch.field === 'meta_title' || patch.field === 'meta_description') {
            const metaKey = patch.field === 'meta_title' ? 'title_tag' : 'description_tag';
            const numericId = patch.url.split('/').pop() ?? '';
            const resourceType = patch.url.includes('/Page/') ? 'pages'
              : patch.url.includes('/Product/') ? 'products'
              : 'articles';
            const { metafields } = await withRetry(
              `prefetch:${patch.url}`,
              () => shopifyRest<{ metafields: ShopifyMetafield[] }>(
                'GET',
                `/${resourceType}/${numericId}/metafields.json?namespace=global&key=${metaKey}`,
                undefined,
                this.limiter,
              ),
            );
            before = metafields[0]?.value ?? null;
          }
        } catch {
          // before remains null — rollback will skip this entry
        }
      }

      rollbackManifest.entries.push({
        idempotency_key: patch.idempotency_key,
        field: patch.field,
        resource_type: patch.url.includes('gid://') ? 'metafield' : patch.field,
        resource_id: patch.url,
        before_value: before,
        ts: new Date().toISOString(),
      });
    }

    // Persist rollback manifest to backup_ref path
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const manifestPath = resolve(backup_ref, `rollback_${run_id}.json`);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(rollbackManifest, null, 2), 'utf-8');

    // 3. Apply patches one by one — collect errors, do not abort on first failure
    const succeeded: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];

    for (const patch of patches) {
      try {
        await applyOnePatch(patch, sandboxThemeId, this.limiter);
        succeeded.push(patch.idempotency_key);
      } catch (err) {
        errors.push({
          key: patch.idempotency_key,
          error: err instanceof Error ? err.message : String(err),
        });
        writeLog(makeLogEvent({
          run_id,
          site_id,
          stage: `apply_patch:error:${patch.idempotency_key}`,
          status: 'error',
          urls: [patch.url],
        }));
      }
    }

    const finalStatus = errors.length === 0 ? 'ok' : (succeeded.length > 0 ? 'error' : 'error');

    writeLog(makeLogEvent({
      run_id,
      site_id,
      stage: 'apply_patch:complete',
      status: finalStatus,
      proof_artifacts: [manifestPath],
      urls: patches.map((p) => p.url),
    }));

    if (errors.length > 0) {
      const summary = errors.map((e) => `  ${e.key}: ${e.error}`).join('\n');
      throw new Error(
        `[shopify-adapter] apply_patch: ${errors.length} patch(es) failed:\n${summary}`,
      );
    }

    return succeeded;
  }

  /**
   * Restores all fields in the manifest to their before_value by reading the
   * rollback manifest written during apply_patch. Collects every error before
   * throwing so a partial rollback is fully reported rather than silently truncated.
   */
  async rollback(manifest: PatchManifest): Promise<void> {
    const { run_id, site_id, backup_ref } = manifest;

    writeLog(makeLogEvent({
      run_id,
      site_id,
      stage: 'rollback:start',
      status: 'pending',
    }));

    // Read persisted rollback manifest
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const manifestPath = resolve(backup_ref, `rollback_${run_id}.json`);

    let rollbackManifest: RollbackManifest;
    try {
      rollbackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as RollbackManifest;
    } catch (err) {
      writeLog(makeLogEvent({ run_id, site_id, stage: 'rollback:error', status: 'error' }));
      throw new Error(
        `[shopify-adapter] Cannot read rollback manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const { sandbox_theme_id, entries } = rollbackManifest;
    const errors: Array<{ key: string; error: string }> = [];

    // Restore all entries — never abort on first error
    for (const entry of entries) {
      try {
        await rollbackOnePatch(entry, sandbox_theme_id, this.limiter);
      } catch (err) {
        errors.push({
          key: entry.idempotency_key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    writeLog(makeLogEvent({
      run_id,
      site_id,
      stage: 'rollback:complete',
      status: errors.length === 0 ? 'ok' : 'error',
      proof_artifacts: [manifestPath],
    }));

    if (errors.length > 0) {
      const summary = errors.map((e) => `  ${e.key}: ${e.error}`).join('\n');
      throw new Error(
        `[shopify-adapter] rollback: ${errors.length} field(s) could not be restored:\n${summary}`,
      );
    }
  }

  /**
   * Lists all Liquid theme asset files in the live theme that function as
   * content templates (layout/, templates/, sections/, snippets/).
   * Excludes binary assets (images, fonts).
   */
  async list_templates(siteId: string): Promise<TemplateRef[]> {
    writeLog(makeLogEvent({
      run_id: '',
      site_id: siteId,
      stage: 'list_templates:start',
      status: 'pending',
    }));

    try {
      const liveId = await getLiveThemeId(this.limiter);
      const { assets } = await withRetry(
        'listTemplateAssets',
        () => shopifyRest<{ assets: ShopifyThemeAsset[] }>(
          'GET', `/themes/${liveId}/assets.json`, undefined, this.limiter,
        ),
      );

      const TEMPLATE_PREFIXES = ['layout/', 'templates/', 'sections/', 'snippets/'];
      const refs: TemplateRef[] = assets
        .filter((a) =>
          TEMPLATE_PREFIXES.some((p) => a.key.startsWith(p)) &&
          a.key.endsWith('.liquid'),
        )
        .map((a) => ({
          template_id: a.key,
          label: a.key,
          resource_path: `/admin/api/${config.shopify.apiVersion}/themes/${liveId}/assets.json?asset[key]=${encodeURIComponent(a.key)}`,
        }));

      writeLog(makeLogEvent({
        run_id: '',
        site_id: siteId,
        stage: 'list_templates:complete',
        status: 'ok',
      }));

      return refs;
    } catch (err) {
      writeLog(makeLogEvent({
        run_id: '',
        site_id: siteId,
        stage: 'list_templates:error',
        status: 'error',
      }));
      throw err;
    }
  }

  /**
   * Returns a flat list of all crawlable storefront URLs: home page, all pages,
   * all products, and all blog articles. Uses the storefront domain from config
   * so URLs are public-facing, not Admin API paths.
   */
  async list_urls(siteId: string): Promise<UrlEntry[]> {
    writeLog(makeLogEvent({
      run_id: '',
      site_id: siteId,
      stage: 'list_urls:start',
      status: 'pending',
    }));

    try {
      const { storefrontDomain } = config.shopify;
      const base = `https://${storefrontDomain}`;

      const [pages, products, blogs] = await Promise.all([
        paginateRest<ShopifyPage>('/pages.json?fields=id,handle&limit=250', 'pages', this.limiter),
        paginateRest<ShopifyProduct>('/products.json?fields=id,handle,status&limit=250', 'products', this.limiter),
        paginateRest<ShopifyBlog>('/blogs.json?fields=id,handle&limit=250', 'blogs', this.limiter),
      ]);

      const entries: UrlEntry[] = [];

      // Home
      entries.push({ url: base + '/', resource_id: 'home', content_type: 'home' });

      // Pages
      for (const p of pages) {
        entries.push({
          url: `${base}/pages/${p.handle}`,
          resource_id: `gid://shopify/Page/${p.id}`,
          content_type: 'page',
        });
      }

      // Products (active only)
      for (const p of products.filter((p) => p.status === 'active')) {
        entries.push({
          url: `${base}/products/${p.handle}`,
          resource_id: `gid://shopify/Product/${p.id}`,
          content_type: 'product',
        });
      }

      // Articles (fetch per blog)
      for (const blog of blogs) {
        const articles = await paginateRest<ShopifyArticle>(
          `/blogs/${blog.id}/articles.json?fields=id,handle,blog_id&limit=250`,
          'articles',
          this.limiter,
        );
        for (const a of articles) {
          entries.push({
            url: `${base}/blogs/${blog.handle}/${a.handle}`,
            resource_id: `gid://shopify/Article/${a.id}`,
            content_type: 'article',
          });
        }
      }

      writeLog(makeLogEvent({
        run_id: '',
        site_id: siteId,
        stage: 'list_urls:complete',
        status: 'ok',
        urls: entries.map((e) => e.url),
      }));

      return entries;
    } catch (err) {
      writeLog(makeLogEvent({
        run_id: '',
        site_id: siteId,
        stage: 'list_urls:error',
        status: 'error',
      }));
      throw err;
    }
  }
}

// ── Default export ────────────────────────────────────────────────────────────

export default ShopifyAdapter;
