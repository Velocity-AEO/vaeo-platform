/**
 * tools/apply/resource_hint_apply.ts
 *
 * Injects preconnect / dns-prefetch <link> tags into page or theme HTML.
 *
 * Two entry points:
 *   applyResourceHints      — pure HTML transform; no I/O
 *   applyResourceHintsTheme — reads/writes Shopify theme.liquid via Admin API
 *
 * Never throws.
 */

import type { ResourceHintPlan } from '../optimize/resource_hint_plan.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResourceHintApplyResult {
  html:           string;
  applied:        boolean;
  injected_count: number;
  error?:         string;
}

export interface ThemeHintApplyResult {
  ok:               boolean;
  already_injected: boolean;
  injected_count:   number;
  error?:           string;
}

type FetchFn = typeof fetch;

// ── Injectable fetch ──────────────────────────────────────────────────────────

let _fetch: FetchFn = fetch;

export function _injectFetch(fn: FetchFn): void { _fetch = fn; }
export function _resetInjections(): void { _fetch = fetch; }

// ── Pure HTML injection ───────────────────────────────────────────────────────

/**
 * Inject resource hint <link> tags from a plan into an HTML string.
 * Inserts before </head>; fallback before </body>; fallback appends.
 * Skips if plan has no entries or insert_html is empty.
 */
export function applyResourceHints(
  html: string,
  plan: ResourceHintPlan,
): ResourceHintApplyResult {
  try {
    if (!html || typeof html !== 'string') {
      return { html: html ?? '', applied: false, injected_count: 0 };
    }
    if (!plan || plan.entries.length === 0 || !plan.insert_html) {
      return { html, applied: false, injected_count: 0 };
    }

    const insert = plan.insert_html;

    // Insert before </head>
    if (html.includes('</head>')) {
      const newHtml = html.replace('</head>', `${insert}\n</head>`);
      return { html: newHtml, applied: true, injected_count: plan.entries.length };
    }

    // Fallback: before </body>
    if (html.includes('</body>')) {
      const newHtml = html.replace('</body>', `${insert}\n</body>`);
      return { html: newHtml, applied: true, injected_count: plan.entries.length };
    }

    // Last resort: append
    return { html: `${html}\n${insert}`, applied: true, injected_count: plan.entries.length };
  } catch (err) {
    return {
      html:           html ?? '',
      applied:        false,
      injected_count: 0,
      error:          err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Shopify theme writer ──────────────────────────────────────────────────────

const SENTINEL = '<!-- vaeo-resource-hints -->';
const THEME_KEY = 'layout/theme.liquid';

/**
 * Fetch theme.liquid, inject hints just before </head>, write back.
 * Idempotent: if SENTINEL comment already present, returns already_injected=true.
 */
export async function applyResourceHintsTheme(
  shopDomain:  string,
  accessToken: string,
  themeId:     string,
  plan:        ResourceHintPlan,
): Promise<ThemeHintApplyResult> {
  try {
    if (!plan || plan.entries.length === 0 || !plan.insert_html) {
      return { ok: true, already_injected: false, injected_count: 0 };
    }

    const base    = `https://${shopDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '')}`;
    const headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type':           'application/json',
    };
    const apiVersion = '2024-01';

    // 1. Fetch theme.liquid
    const getUrl = `${base}/admin/api/${apiVersion}/themes/${themeId}/assets.json?asset[key]=${THEME_KEY}`;
    const getRes = await _fetch(getUrl, { method: 'GET', headers });
    if (!getRes.ok) {
      return {
        ok: false, already_injected: false, injected_count: 0,
        error: `Failed to fetch theme.liquid (${getRes.status})`,
      };
    }
    const getData = await getRes.json() as { asset?: { value?: string } };
    const original = getData?.asset?.value ?? '';

    // 2. Check if already injected
    if (original.includes(SENTINEL)) {
      return { ok: true, already_injected: true, injected_count: 0 };
    }

    // 3. Inject before </head>
    const insert = `${SENTINEL}\n${plan.insert_html}`;
    let updated: string;
    if (original.includes('</head>')) {
      updated = original.replace('</head>', `${insert}\n</head>`);
    } else {
      updated = original + '\n' + insert;
    }

    // 4. Write back
    const putUrl  = `${base}/admin/api/${apiVersion}/themes/${themeId}/assets.json`;
    const putRes  = await _fetch(putUrl, {
      method:  'PUT',
      headers,
      body:    JSON.stringify({ asset: { key: THEME_KEY, value: updated } }),
    });
    if (!putRes.ok) {
      return {
        ok: false, already_injected: false, injected_count: 0,
        error: `Failed to write theme.liquid (${putRes.status})`,
      };
    }

    return { ok: true, already_injected: false, injected_count: plan.entries.length };
  } catch (err) {
    return {
      ok:               false,
      already_injected: false,
      injected_count:   0,
      error:            err instanceof Error ? err.message : String(err),
    };
  }
}
