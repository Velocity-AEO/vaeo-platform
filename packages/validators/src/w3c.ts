/**
 * packages/validators/src/w3c.ts
 *
 * W3C HTML validator for Velocity AEO.
 *
 * Checks page HTML for structural validity before and after a fix is applied.
 * A fix that introduces malformed HTML (unclosed tags, invalid nesting, illegal
 * attributes) is blocked before it reaches any live site.
 *
 * Pass condition: zero messages with type === 'error'. Warnings are acceptable.
 * Fail condition: one or more error-type messages.
 *
 * API unavailability is treated as a non-blocking skip — W3C is a free public
 * service and its absence should not block deployments.
 *
 * Caching: Redis 24h TTL, key = w3c:{tenant_id}:{sha256_of_html}.
 * Rate limiting: max 1 request per 2 seconds (free public service).
 * Never throws — always returns W3CResult.
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../action-log/src/index.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface W3CRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  url:       string;
  /** Full HTML content to validate. */
  html:      string;
}

export interface W3CMessage {
  type:     'error' | 'warning' | 'info';
  message:  string;
  line?:    number;
  column?:  number;
}

export interface W3CResult {
  url:           string;
  /** True when there are zero error-type messages. Warnings are OK. */
  passed:        boolean;
  errors:        W3CMessage[];
  warnings:      W3CMessage[];
  error_count:   number;
  warning_count: number;
  cached:        boolean;
  run_id:        string;
  tenant_id:     string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const W3C_ENDPOINT  = 'https://validator.w3.org/nu/?out=json';
const RATE_LIMIT_MS = 2000; // 1 request per 2 seconds

// ── Cache key ─────────────────────────────────────────────────────────────────

/** SHA-256 hash of HTML content — identical HTML hits cache regardless of URL. */
export function htmlHash(html: string): string {
  return createHash('sha256').update(html, 'utf8').digest('hex');
}

export function cacheKey(req: W3CRequest): string {
  return `w3c:${req.tenant_id}:${htmlHash(req.html)}`;
}

// ── Response parsing ──────────────────────────────────────────────────────────

interface W3CApiResponse {
  messages?: Array<{
    type?:       string;
    message?:    string;
    lastLine?:   number;
    lastColumn?: number;
  }>;
}

/**
 * Parses the W3C Nu validator JSON response into typed errors and warnings.
 * Ignores 'info' messages for the pass/fail determination.
 */
export function parseW3CResponse(body: W3CApiResponse): {
  errors:   W3CMessage[];
  warnings: W3CMessage[];
} {
  const errors:   W3CMessage[] = [];
  const warnings: W3CMessage[] = [];

  for (const msg of body.messages ?? []) {
    const type    = (msg.type ?? 'info') as 'error' | 'warning' | 'info';
    const entry: W3CMessage = {
      type,
      message: msg.message ?? '',
      ...(msg.lastLine   != null ? { line:   msg.lastLine   } : {}),
      ...(msg.lastColumn != null ? { column: msg.lastColumn } : {}),
    };
    if (type === 'error')   errors.push(entry);
    else if (type === 'warning') warnings.push(entry);
  }

  return { errors, warnings };
}

// ── Injectable ops (for testing) ──────────────────────────────────────────────

export interface W3COps {
  /** POSTs HTML to the W3C Nu validator. Returns parsed JSON or throws. */
  postHtml: (html: string) => Promise<W3CApiResponse>;
  /** Reads from cache. Returns null on miss. */
  cacheGet: (key: string) => Promise<W3CResult | null>;
  /** Writes to cache. Fire-and-forget. */
  cacheSet: (key: string, value: W3CResult) => Promise<void>;
  /** Sleep implementation — injectable so tests run instantly. */
  sleep:    (ms: number) => Promise<void>;
}

let _ops: W3COps | null = null;

export function _injectOps(ops: Partial<W3COps>): void {
  _ops = { ...defaultOps(), ...ops };
}

export function _resetOps(): void {
  _ops = null;
}

// ── Rate limiter (module-level state) ────────────────────────────────────────

let _lastRequestAt = 0;

/** Enforces a minimum gap of RATE_LIMIT_MS between W3C API calls. */
async function enforceRateLimit(sleep: (ms: number) => Promise<void>): Promise<void> {
  const now  = Date.now();
  const wait = RATE_LIMIT_MS - (now - _lastRequestAt);
  if (wait > 0) await sleep(wait);
  _lastRequestAt = Date.now();
}

// ── Default ops ───────────────────────────────────────────────────────────────

function defaultOps(): W3COps {
  return {
    postHtml: realPostHtml,
    cacheGet: realCacheGet,
    cacheSet: realCacheSet,
    sleep:    (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

async function realPostHtml(html: string): Promise<W3CApiResponse> {
  const res = await fetch(W3C_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'User-Agent':   'VelocityAEO/1.0',
    },
    body: html,
  });
  if (!res.ok) {
    throw new Error(`W3C API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<W3CApiResponse>;
}

async function realCacheGet(key: string): Promise<W3CResult | null> {
  try {
    const url   = process.env['UPSTASH_REDIS_REST_URL'];
    const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
    if (!url || !token) return null;
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json() as { result: string | null };
    if (!body.result) return null;
    return JSON.parse(body.result) as W3CResult;
  } catch {
    return null;
  }
}

async function realCacheSet(key: string, value: W3CResult): Promise<void> {
  try {
    const url   = process.env['UPSTASH_REDIS_REST_URL'];
    const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
    if (!url || !token) return;
    const TTL = 24 * 60 * 60;
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ value: JSON.stringify(value), ex: TTL }),
    });
  } catch {
    // Cache write failure is non-fatal
  }
}

// ── runW3C ────────────────────────────────────────────────────────────────────

/**
 * Validates raw HTML against the W3C Nu validator.
 *
 * Flow:
 *   1. Check cache by SHA-256 hash of HTML content.
 *   2. Enforce rate limit (2 s minimum between API calls).
 *   3. POST HTML to W3C Nu endpoint.
 *   4. Parse errors / warnings, evaluate pass condition.
 *   5. Cache result (fire-and-forget).
 *   6. Write ActionLog.
 *
 * API unavailability → passed=true, warning added, stage='w3c:api_unavailable'.
 * Never throws.
 */
export async function runW3C(
  request: W3CRequest,
  _testOps?: Partial<W3COps>,
): Promise<W3CResult> {
  const ops: W3COps = _testOps
    ? { ...defaultOps(), ..._testOps }
    : (_ops ?? defaultOps());

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       'shopify', // validators are CMS-agnostic
    command:   'w3c',
    url:       request.url,
  });

  const key = cacheKey(request);

  // ── Cache check ──────────────────────────────────────────────────────────
  try {
    const cached = await ops.cacheGet(key);
    if (cached) {
      log({ stage: 'w3c:cache_hit', status: 'ok',
            metadata: { error_count: cached.error_count, warning_count: cached.warning_count } });
      return { ...cached, cached: true };
    }
  } catch {
    // Cache read failure is non-fatal
  }

  log({ stage: 'w3c:start', status: 'pending',
        metadata: { html_length: request.html.length } });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  await enforceRateLimit(ops.sleep);

  // ── W3C API call ──────────────────────────────────────────────────────────
  let apiBody: W3CApiResponse;
  try {
    apiBody = await ops.postHtml(request.html);
  } catch {
    // API unreachable — skip validation rather than block deployment
    log({ stage: 'w3c:api_unavailable', status: 'skipped',
          metadata: { reason: 'fetch_failed' } });
    return {
      url:           request.url,
      passed:        true,
      errors:        [],
      warnings:      [{ type: 'warning', message: 'w3c_api_unreachable — skipping validation' }],
      error_count:   0,
      warning_count: 1,
      cached:        false,
      run_id:        request.run_id,
      tenant_id:     request.tenant_id,
    };
  }

  // ── Parse + evaluate ──────────────────────────────────────────────────────
  const { errors, warnings } = parseW3CResponse(apiBody);
  const passed               = errors.length === 0;

  const result: W3CResult = {
    url:           request.url,
    passed,
    errors,
    warnings,
    error_count:   errors.length,
    warning_count: warnings.length,
    cached:        false,
    run_id:        request.run_id,
    tenant_id:     request.tenant_id,
  };

  log({
    stage:  'w3c:complete',
    status: passed ? 'ok' : 'failed',
    metadata: {
      error_count:   errors.length,
      warning_count: warnings.length,
      passed,
    },
  });

  if (!passed) {
    log({
      stage:  'w3c:blocked',
      status: 'failed',
      metadata: {
        first_errors: errors.slice(0, 3).map((e) => e.message),
      },
    });
  }

  // ── Cache result (fire-and-forget) ────────────────────────────────────────
  void ops.cacheSet(key, result);

  return result;
}
