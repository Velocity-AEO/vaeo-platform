/**
 * packages/validators/src/index.ts
 *
 * @vaeo/validators — Unified validation ladder
 *
 * Runs three validators in order: schema → lighthouse → w3c.
 * A failing validator blocks deployment.
 * API-dependent validators (lighthouse, w3c) gracefully skip if unavailable.
 *
 * Never throws — always returns ValidatorResult.
 */

// schema-dts provides compile-time types for schema.org structured data
import type { Product, Organization, Article } from 'schema-dts';

// Suppress unused import warnings — these are used for type documentation only
void (undefined as unknown as Product);
void (undefined as unknown as Organization);
void (undefined as unknown as Article);

// ── Result types ──────────────────────────────────────────────────────────────

export interface SchemaResult {
  passed:    boolean;
  errors:    string[];
  validator: 'schema';
}

export interface LighthouseResult {
  passed:     boolean;
  skipped?:   boolean;
  scores:     { performance: number; seo: number };
  lcp_ms:     number;
  cls:        number;
  validator:  'lighthouse';
}

export interface W3cResult {
  passed:        boolean;
  skipped?:      boolean;
  error_count:   number;
  warning_count: number;
  validator:     'w3c';
}

export interface ValidatorInput {
  url:             string;
  html?:           string;         // for W3C
  schema_blocks?:  string[];       // for schema validator
  run_lighthouse?: boolean;        // default true
}

export interface ValidatorResult {
  passed:     boolean;
  validators: {
    schema:     SchemaResult     | null;
    lighthouse: LighthouseResult | null;
    w3c:        W3cResult        | null;
  };
  blocked_by: string[];
  run_at:     string;
}

// ── Required fields per @type ─────────────────────────────────────────────────

const REQUIRED_FIELDS: Record<string, string[]> = {
  Product:        ['name', 'offers'],
  Organization:   ['name', 'url'],
  Article:        ['headline', 'author'],
  BreadcrumbList: ['itemListElement'],
  FAQPage:        ['mainEntity'],
  WebSite:        ['name', 'url'],
};

// ── VALIDATOR 1 — Schema (local, no API) ──────────────────────────────────────

/**
 * Validates JSON-LD schema blocks locally.
 * Checks: valid JSON, @type present, required fields per @type.
 * Unknown @type values pass — only @type itself is required.
 */
export function validateSchema(blocks: string[]): SchemaResult {
  const errors: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(blocks[i] ?? '');
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`Block ${i}: invalid JSON (must be object)`);
        continue;
      }
      parsed = value as Record<string, unknown>;
    } catch {
      errors.push(`Block ${i}: invalid JSON`);
      continue;
    }

    const type = parsed['@type'];
    if (type === undefined || type === null || String(type).trim() === '') {
      errors.push(`Block ${i}: missing @type`);
      continue;
    }

    const typeName = String(type);
    const required = REQUIRED_FIELDS[typeName];
    if (required) {
      for (const field of required) {
        if (!(field in parsed) || parsed[field] == null) {
          errors.push(`Block ${i} (${typeName}): missing required field '${field}'`);
        }
      }
    }
    // Unknown @type: only @type required — already present, no extra checks
  }

  return { passed: errors.length === 0, errors, validator: 'schema' };
}

// ── VALIDATOR 2 — Lighthouse via PageSpeed Insights API ──────────────────────

/** In-memory result cache: url → { result, expiresAt } */
const lighthouseCache = new Map<string, { result: LighthouseResult; expiresAt: number }>();
const LIGHTHOUSE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const LIGHTHOUSE_SKIPPED: LighthouseResult = {
  passed: true, skipped: true,
  scores: { performance: 0, seo: 0 },
  lcp_ms: 0, cls: 0,
  validator: 'lighthouse',
};

/** Injectable fetcher type for unit testing. */
export type LighthouseFetcher = (
  url: string,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Runs Lighthouse via the PageSpeed Insights v5 API.
 *
 * Thresholds (lenient baseline):
 *   performance >= 60
 *   seo >= 70
 *
 * Skips (passed=true) when:
 *   - PAGESPEED_API_KEY env var is missing
 *   - API returns non-ok status
 *   - Network/fetch error
 */
export async function validateLighthouse(
  url:      string,
  fetcher?: LighthouseFetcher,
): Promise<LighthouseResult> {
  const apiKey = process.env['PAGESPEED_API_KEY'];
  if (!apiKey) return LIGHTHOUSE_SKIPPED;

  // Cache hit
  const cached = lighthouseCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const params = new URLSearchParams({ url, key: apiKey, strategy: 'mobile' });
  params.append('category', 'performance');
  params.append('category', 'seo');
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;

  try {
    const doFetch = fetcher ?? ((u: string) => fetch(u));
    const resp = await doFetch(apiUrl);
    if (!resp.ok) return LIGHTHOUSE_SKIPPED;

    const data    = await resp.json() as Record<string, unknown>;
    const lhr     = data['lighthouseResult'] as Record<string, unknown> | undefined;
    const cats    = lhr?.['categories']  as Record<string, Record<string, unknown>> | undefined;
    const audits  = lhr?.['audits']      as Record<string, Record<string, unknown>> | undefined;

    const perfScore = Math.round(((cats?.['performance']?.['score']            as number | undefined) ?? 0) * 100);
    const seoScore  = Math.round(((cats?.['seo']?.['score']                    as number | undefined) ?? 0) * 100);
    const lcpMs     = Math.round( (audits?.['largest-contentful-paint']?.['numericValue'] as number | undefined) ?? 0);
    const cls       =              (audits?.['cumulative-layout-shift']?.['numericValue']  as number | undefined) ?? 0;

    const result: LighthouseResult = {
      passed: perfScore >= 60 && seoScore >= 70,
      scores: { performance: perfScore, seo: seoScore },
      lcp_ms: lcpMs,
      cls,
      validator: 'lighthouse',
    };

    lighthouseCache.set(url, { result, expiresAt: Date.now() + LIGHTHOUSE_CACHE_TTL });
    return result;
  } catch {
    return LIGHTHOUSE_SKIPPED;
  }
}

// ── VALIDATOR 3 — W3C HTML ────────────────────────────────────────────────────

const W3C_SKIPPED: W3cResult = {
  passed: true, skipped: true,
  error_count: 0, warning_count: 0,
  validator: 'w3c',
};

/** Injectable fetcher type for unit testing. */
export type W3cFetcher = (
  url:  string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Validates HTML against the W3C Nu validator.
 *
 * Fails only when response.messages contains items with type === 'error'.
 * Warnings are acceptable and do not fail.
 * Times out after 10 s — returns skipped on timeout or any fetch error.
 */
export async function validateW3c(
  html:     string,
  fetcher?: W3cFetcher,
): Promise<W3cResult> {
  const W3C_URL  = 'https://validator.w3.org/nu/?out=json';
  const ctrl     = new AbortController();
  const timer    = setTimeout(() => ctrl.abort(), 10_000);

  try {
    const doFetch = fetcher ??
      ((u: string, init: Parameters<typeof validateW3c>[1] extends undefined ? never : Parameters<typeof fetch>[1]) =>
        fetch(u, init as RequestInit));

    const resp = await doFetch(W3C_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body:    html,
      signal:  ctrl.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return W3C_SKIPPED;

    const data      = await resp.json() as { messages?: Array<{ type: string }> };
    const msgs      = data.messages ?? [];
    const errCount  = msgs.filter((m) => m.type === 'error').length;
    const warnCount = msgs.filter((m) => m.type === 'warning' || m.type === 'info').length;

    return {
      passed:        errCount === 0,
      error_count:   errCount,
      warning_count: warnCount,
      validator:     'w3c',
    };
  } catch {
    clearTimeout(timer);
    return W3C_SKIPPED;
  }
}

// ── runValidators (main export) ───────────────────────────────────────────────

/**
 * Runs the validation ladder in order: schema → lighthouse → w3c.
 *
 * A validator only runs when its required input is present:
 *   - schema: requires schema_blocks (non-empty array)
 *   - lighthouse: requires run_lighthouse=true (default) — skips if no API key
 *   - w3c: requires html string
 *
 * blocked_by lists the names of validators that did not pass (not skipped).
 * passed = true only when blocked_by is empty.
 */
export async function runValidators(input: ValidatorInput): Promise<ValidatorResult> {
  const { url, html, schema_blocks, run_lighthouse = true } = input;

  const blocked_by: string[] = [];

  let schemaResult:     SchemaResult     | null = null;
  let lighthouseResult: LighthouseResult | null = null;
  let w3cResult:        W3cResult        | null = null;

  // 1. Schema — local, no API
  if (schema_blocks && schema_blocks.length > 0) {
    schemaResult = validateSchema(schema_blocks);
    if (!schemaResult.passed) blocked_by.push('schema');
  }

  // 2. Lighthouse — skippable
  if (run_lighthouse) {
    lighthouseResult = await validateLighthouse(url);
    if (!lighthouseResult.passed && !lighthouseResult.skipped) {
      blocked_by.push('lighthouse');
    }
  }

  // 3. W3C — skippable
  if (html) {
    w3cResult = await validateW3c(html);
    if (!w3cResult.passed && !w3cResult.skipped) {
      blocked_by.push('w3c');
    }
  }

  return {
    passed:     blocked_by.length === 0,
    validators: { schema: schemaResult, lighthouse: lighthouseResult, w3c: w3cResult },
    blocked_by,
    run_at:     new Date().toISOString(),
  };
}
