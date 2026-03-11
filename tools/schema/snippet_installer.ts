/**
 * tools/schema/snippet_installer.ts
 *
 * Installs velocity-schema.liquid into a live Shopify theme.
 *
 * Idempotent:
 *   - Checks if {% render "velocity-schema" %} is already in theme.liquid
 *   - If present: returns { ok:true, alreadyInstalled:true }
 *   - If absent: injects after <head> tag and PUTs both theme.liquid + snippet asset
 *
 * getLiveThemeId: returns the numeric ID of the theme with role='main'.
 * installSnippet: manages the full install flow.
 *
 * Injectable fetch for unit testing.
 * Never throws — returns result objects.
 *
 * API version: 2024-01
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnippetInstallResult {
  ok:               boolean;
  alreadyInstalled: boolean;
  snippetUpdated:   boolean;
  error?:           string;
}

// ── Snippet content ───────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * Load velocity-schema.liquid content.
 * Inline the content so the installer doesn't require file I/O at call time.
 */
function loadSnippetContent(): string {
  try {
    return readFileSync(join(__dir, 'velocity-schema.liquid'), 'utf8');
  } catch {
    // Fallback: embed minimal snippet so tests / offline use still work
    return [
      `{%- assign _vschema = nil -%}`,
      `{%- case request.page_type -%}`,
      `  {%- when 'product'    -%}{%- assign _vschema = product.metafields.velocity_seo.schema_json.value    -%}`,
      `  {%- when 'collection' -%}{%- assign _vschema = collection.metafields.velocity_seo.schema_json.value -%}`,
      `  {%- when 'page'       -%}{%- assign _vschema = page.metafields.velocity_seo.schema_json.value       -%}`,
      `  {%- when 'article'    -%}{%- assign _vschema = article.metafields.velocity_seo.schema_json.value    -%}`,
      `  {%- when 'blog'       -%}{%- assign _vschema = blog.metafields.velocity_seo.schema_json.value       -%}`,
      `{%- endcase -%}`,
      `{%- if _vschema -%}`,
      `<!-- VAEO schema-{{ request.page_type }} -->`,
      `<script type="application/ld+json">{{ _vschema | json }}</script>`,
      `<!-- /VAEO schema-{{ request.page_type }} -->`,
      `{%- endif -%}`,
    ].join('\n');
  }
}

const SNIPPET_CONTENT = loadSnippetContent();
const RENDER_TAG      = '{% render "velocity-schema" %}';

/** Exposed for testing — returns current snippet content. */
export function _getSnippetContent(): string {
  return SNIPPET_CONTENT;
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

function normalise(raw: string): string {
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function authHeaders(token: string): Record<string, string> {
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type':           'application/json',
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function shopifyFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await getFetch()(url, init);
  if (res.status === 429) {
    await sleep(500);
    return getFetch()(url, init);
  }
  return res;
}

/** Remove any existing render tag (and surrounding whitespace) from theme content. */
function stripRenderTag(content: string): string {
  // Matches optional leading newline + optional spaces + render tag + optional trailing newline
  return content.replace(/\n?\s*\{%-?\s*render\s+"velocity-schema"\s*-?%\}\s*\n?/g, '\n');
}

/** Inject RENDER_TAG immediately after the first <head> tag (with or without attributes). */
function injectIntoTheme(content: string): string {
  const headMatch = content.match(/<head(\s[^>]*)?>/i);
  if (headMatch?.index != null) {
    const insertAt = headMatch.index + headMatch[0].length;
    return content.slice(0, insertAt) + '\n  ' + RENDER_TAG + '\n' + content.slice(insertAt);
  }
  // Fallback: inject before </head>
  const closeHead = content.indexOf('</head>');
  if (closeHead !== -1) {
    return content.slice(0, closeHead) + '  ' + RENDER_TAG + '\n' + content.slice(closeHead);
  }
  // Last resort: prepend
  return RENDER_TAG + '\n' + content;
}

// ── getLiveThemeId ────────────────────────────────────────────────────────────

/**
 * Returns the numeric ID (as string) of the live (main) theme.
 * Returns null if not found or on error.
 */
export async function getLiveThemeId(
  shopDomain:  string,
  accessToken: string,
): Promise<string | null> {
  try {
    const host    = normalise(shopDomain);
    const headers = authHeaders(accessToken);
    const url     = `https://${host}/admin/api/2024-01/themes.json`;
    const res     = await shopifyFetch(url, { method: 'GET', headers });
    if (!res.ok) return null;
    const body    = await res.json() as { themes?: Array<{ id: number; role: string }> };
    const main    = body.themes?.find((t) => t.role === 'main');
    return main ? String(main.id) : null;
  } catch {
    return null;
  }
}

// ── installSnippet ────────────────────────────────────────────────────────────

/**
 * Install velocity-schema.liquid into a Shopify theme.
 * Idempotent — safe to call repeatedly.
 *
 * @param shopDomain  e.g. "hautedoorliving.myshopify.com"
 * @param accessToken Admin API token
 * @param themeId     Numeric theme ID (string)
 * @param force       Strip existing render tag and re-inject at correct position
 */
export async function installSnippet(
  shopDomain:  string,
  accessToken: string,
  themeId:     string,
  force?:      boolean,
): Promise<SnippetInstallResult> {
  try {
    const host    = normalise(shopDomain);
    const headers = authHeaders(accessToken);
    const base    = `https://${host}/admin/api/2024-01/themes/${themeId}/assets.json`;

    // 1. GET theme.liquid
    const getUrl = `${base}?asset[key]=layout/theme.liquid`;
    const getRes = await shopifyFetch(getUrl, { method: 'GET', headers });
    if (!getRes.ok) {
      return { ok: false, alreadyInstalled: false, snippetUpdated: false, error: `GET theme.liquid failed (${getRes.status})` };
    }
    const getBody = await getRes.json() as { asset?: { value?: string } };
    const themeContent = getBody.asset?.value ?? '';

    const alreadyHasRenderTag = themeContent.includes(RENDER_TAG);

    // 2. If render tag is missing (or force re-inject), inject into theme.liquid
    const effectiveContent = (force && alreadyHasRenderTag) ? stripRenderTag(themeContent) : themeContent;
    const needsInject = !alreadyHasRenderTag || (force && alreadyHasRenderTag);

    if (needsInject) {
      const updatedTheme = injectIntoTheme(effectiveContent);
      const putThemeRes  = await shopifyFetch(base, {
        method:  'PUT',
        headers,
        body:    JSON.stringify({ asset: { key: 'layout/theme.liquid', value: updatedTheme } }),
      });
      if (!putThemeRes.ok) {
        return { ok: false, alreadyInstalled: false, snippetUpdated: false, error: `PUT theme.liquid failed (${putThemeRes.status})` };
      }
    }

    // 3. Always PUT snippet asset (ensures content stays up-to-date)
    const existingSnippetUrl = `${base}?asset[key]=snippets/velocity-schema.liquid`;
    const existingSnippetRes = await shopifyFetch(existingSnippetUrl, { method: 'GET', headers });
    const existingSnippetBody = existingSnippetRes.ok
      ? await existingSnippetRes.json() as { asset?: { value?: string } }
      : null;
    const existingSnippetValue = existingSnippetBody?.asset?.value ?? '';

    if (existingSnippetValue === SNIPPET_CONTENT) {
      // Snippet content is identical — nothing to upload
      return { ok: true, alreadyInstalled: alreadyHasRenderTag, snippetUpdated: false };
    }

    const putSnippetRes = await shopifyFetch(base, {
      method:  'PUT',
      headers,
      body:    JSON.stringify({ asset: { key: 'snippets/velocity-schema.liquid', value: SNIPPET_CONTENT } }),
    });
    if (!putSnippetRes.ok) {
      return { ok: false, alreadyInstalled: false, snippetUpdated: false, error: `PUT snippet asset failed (${putSnippetRes.status})` };
    }

    return { ok: true, alreadyInstalled: alreadyHasRenderTag, snippetUpdated: true };

  } catch (err) {
    return {
      ok:               false,
      alreadyInstalled: false,
      snippetUpdated:   false,
      error:            err instanceof Error ? err.message : String(err),
    };
  }
}
