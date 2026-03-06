/**
 * packages/validators/src/lighthouse.ts
 *
 * Lighthouse / PageSpeed Insights validator for Velocity AEO.
 *
 * Checks page performance before and after a fix is applied. Any fix that
 * degrades performance below the minimum thresholds is blocked before going live.
 *
 * Thresholds:
 *   PERF_MIN = 0.70   — performance score (0–1)
 *   LCP_MAX  = 2.5 s  — Largest Contentful Paint
 *   CLS_MAX  = 0.1    — Cumulative Layout Shift
 *   FID_MAX  = 100 ms — Total Blocking Time used as FID proxy
 *
 * Caching: Redis 24-hour TTL, key = lighthouse:{tenant_id}:{url}:{strategy}.
 * Regression detection: compareResults() — perf drop > 10 pts, LCP +20%, CLS +0.05.
 * Never throws — always returns LighthouseResult.
 */

import { createLogger } from '../../action-log/src/index.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type LighthouseStrategy = 'mobile' | 'desktop';

export interface LighthouseRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  url:       string;
  strategy?: LighthouseStrategy;
}

export interface LighthouseResult {
  url:          string;
  strategy:     string;
  /** 0 to 1. Multiply by 100 for the familiar 0–100 score. */
  performance:  number;
  /** Largest Contentful Paint in seconds. */
  lcp:          number;
  /** Cumulative Layout Shift (unitless). */
  cls:          number;
  /** Total Blocking Time in milliseconds (FID proxy). */
  fid:          number;
  /** True when ALL thresholds are met. */
  passed:       boolean;
  /** Which thresholds failed, or error codes. */
  failures:     string[];
  /** Full raw API response for audit trails. */
  raw_response: Record<string, unknown>;
  /** True when this result came from the Redis cache. */
  cached:       boolean;
  run_id:       string;
  tenant_id:    string;
}

export interface RegressionResult {
  regressed: boolean;
  details:   string[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Minimum acceptable performance score (0–1). */
export const PERF_MIN = 0.70;
/** Maximum acceptable LCP in seconds. */
export const LCP_MAX  = 2.5;
/** Maximum acceptable CLS (unitless). */
export const CLS_MAX  = 0.1;
/** Maximum acceptable FID / TBT in milliseconds. */
export const FID_MAX  = 100;

// ── Regression thresholds ─────────────────────────────────────────────────────

/** Performance score drop that constitutes a regression (absolute, 0–1 scale). */
const PERF_REGRESSION_DELTA = 0.10;
/** LCP increase ratio that constitutes a regression. */
const LCP_REGRESSION_RATIO  = 0.20;
/** CLS absolute increase that constitutes a regression. */
const CLS_REGRESSION_DELTA  = 0.05;

// ── Cache key ─────────────────────────────────────────────────────────────────

export function cacheKey(req: LighthouseRequest): string {
  return `lighthouse:${req.tenant_id}:${req.url}:${req.strategy ?? 'mobile'}`;
}

// ── Injectable ops (for testing) ──────────────────────────────────────────────

export interface LighthouseOps {
  /** Makes the PageSpeed Insights GET request. Returns raw JSON or throws. */
  fetchPsi: (url: string, strategy: LighthouseStrategy, apiKey: string) => Promise<Record<string, unknown>>;
  /** Reads from cache. Returns null on miss or error. */
  cacheGet: (key: string) => Promise<LighthouseResult | null>;
  /** Writes to cache. Fire-and-forget — never throws. */
  cacheSet: (key: string, value: LighthouseResult) => Promise<void>;
  /** Reads GOOGLE_PSI_API_KEY. Returns null if unavailable. */
  getApiKey: () => string | null;
}

let _ops: LighthouseOps | null = null;

export function _injectOps(ops: Partial<LighthouseOps>): void {
  _ops = { ...defaultOps(), ...ops };
}

export function _resetOps(): void {
  _ops = null;
}

// ── Default ops (real implementations) ───────────────────────────────────────

function defaultOps(): LighthouseOps {
  return {
    fetchPsi:  realFetchPsi,
    cacheGet:  realCacheGet,
    cacheSet:  realCacheSet,
    getApiKey: realGetApiKey,
  };
}

function realGetApiKey(): string | null {
  try {
    // Synchronous env read — avoids dynamic import at call site
    const key = process.env['GOOGLE_PSI_API_KEY'];
    return key && key.trim() !== '' ? key.trim() : null;
  } catch {
    return null;
  }
}

async function realFetchPsi(
  url: string,
  strategy: LighthouseStrategy,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    url,
    strategy,
    key: apiKey,
    category: 'performance,accessibility,seo,best-practices',
  });
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`PageSpeed API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function realCacheGet(key: string): Promise<LighthouseResult | null> {
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
    return JSON.parse(body.result) as LighthouseResult;
  } catch {
    return null;
  }
}

async function realCacheSet(key: string, value: LighthouseResult): Promise<void> {
  try {
    const url   = process.env['UPSTASH_REDIS_REST_URL'];
    const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
    if (!url || !token) return;
    const TTL = 24 * 60 * 60; // 24 hours in seconds
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ value: JSON.stringify(value), ex: TTL }),
    });
  } catch {
    // Cache write failure is non-fatal
  }
}

// ── Response parsing ──────────────────────────────────────────────────────────

interface ParsedMetrics {
  performance: number;
  lcp:         number;
  cls:         number;
  fid:         number;
}

/**
 * Extracts the four key metrics from a raw PSI API response.
 * Returns 0 for any metric not found so threshold checks always produce a result.
 */
export function parseMetrics(raw: Record<string, unknown>): ParsedMetrics {
  const categories = raw['lighthouseResult'] as Record<string, unknown> | undefined;
  const lr         = raw['lighthouseResult'] as Record<string, unknown> | undefined;
  const audits     = lr?.['audits'] as Record<string, Record<string, unknown>> | undefined;
  const cats       = lr?.['categories'] as Record<string, Record<string, unknown>> | undefined;

  const performance = (cats?.['performance']?.['score'] as number | undefined) ?? 0;

  // LCP: numericValue is in milliseconds from the API — convert to seconds
  const lcpMs = (audits?.['largest-contentful-paint']?.['numericValue'] as number | undefined) ?? 0;
  const lcp   = lcpMs / 1000;

  const cls = (audits?.['cumulative-layout-shift']?.['numericValue'] as number | undefined) ?? 0;

  // TBT as FID proxy (already in ms)
  const fid = (audits?.['total-blocking-time']?.['numericValue'] as number | undefined) ?? 0;

  // Suppress unused variable warning — categories was a mistaken alias
  void categories;

  return { performance, lcp, cls, fid };
}

// ── Threshold evaluation ──────────────────────────────────────────────────────

/** Evaluates metrics against thresholds. Returns failures[] (empty = pass). */
export function evaluateThresholds(metrics: ParsedMetrics): string[] {
  const failures: string[] = [];
  if (metrics.performance < PERF_MIN) {
    failures.push(`performance_below_${PERF_MIN}:actual_${metrics.performance.toFixed(2)}`);
  }
  if (metrics.lcp > LCP_MAX) {
    failures.push(`lcp_above_${LCP_MAX}s:actual_${metrics.lcp.toFixed(2)}s`);
  }
  if (metrics.cls > CLS_MAX) {
    failures.push(`cls_above_${CLS_MAX}:actual_${metrics.cls.toFixed(3)}`);
  }
  if (metrics.fid > FID_MAX) {
    failures.push(`fid_above_${FID_MAX}ms:actual_${metrics.fid.toFixed(0)}ms`);
  }
  return failures;
}

// ── compareResults ────────────────────────────────────────────────────────────

/**
 * Detects performance regressions between two Lighthouse runs.
 *
 * A regression is defined as:
 *   - performance dropped by more than 10 points (0.10 on 0–1 scale), OR
 *   - lcp increased by more than 20%, OR
 *   - cls increased by more than 0.05
 */
export function compareResults(
  before: LighthouseResult,
  after:  LighthouseResult,
): RegressionResult {
  const details: string[] = [];

  const perfDrop = before.performance - after.performance;
  if (perfDrop > PERF_REGRESSION_DELTA) {
    details.push(
      `performance_regressed:before_${(before.performance * 100).toFixed(0)}_after_${(after.performance * 100).toFixed(0)}`,
    );
  }

  if (before.lcp > 0) {
    const lcpIncrease = (after.lcp - before.lcp) / before.lcp;
    if (lcpIncrease > LCP_REGRESSION_RATIO) {
      details.push(
        `lcp_regressed:before_${before.lcp.toFixed(2)}s_after_${after.lcp.toFixed(2)}s`,
      );
    }
  }

  const clsIncrease = after.cls - before.cls;
  if (clsIncrease > CLS_REGRESSION_DELTA) {
    details.push(
      `cls_regressed:before_${before.cls.toFixed(3)}_after_${after.cls.toFixed(3)}`,
    );
  }

  return { regressed: details.length > 0, details };
}

// ── runLighthouse ─────────────────────────────────────────────────────────────

/**
 * Runs a Lighthouse / PageSpeed Insights check for the given URL.
 *
 * Flow:
 *   1. Check Redis cache — return immediately on hit.
 *   2. Verify API key available.
 *   3. Call PSI API.
 *   4. Parse metrics, evaluate thresholds.
 *   5. Cache result (fire-and-forget).
 *   6. Write ActionLog.
 *
 * Never throws. Returns passed=false + failures[] on any error.
 */
export async function runLighthouse(
  request: LighthouseRequest,
  _testOps?: Partial<LighthouseOps>,
): Promise<LighthouseResult> {
  const strategy: LighthouseStrategy = request.strategy ?? 'mobile';
  const ops: LighthouseOps = _testOps
    ? { ...defaultOps(), ..._testOps }
    : (_ops ?? defaultOps());

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       'shopify', // validators are CMS-agnostic; shopify used as sentinel
    command:   'lighthouse',
    url:       request.url,
  });

  const key = cacheKey(request);

  // ── Cache check ──────────────────────────────────────────────────────────
  try {
    const cached = await ops.cacheGet(key);
    if (cached) {
      log({ stage: 'lighthouse:cache_hit', status: 'ok',
            metadata: { strategy, performance: cached.performance } });
      return { ...cached, cached: true };
    }
  } catch {
    // Cache read failure is non-fatal
  }

  log({ stage: 'lighthouse:start', status: 'pending', metadata: { strategy } });

  // ── API key check ────────────────────────────────────────────────────────
  const apiKey = ops.getApiKey();
  if (!apiKey) {
    log({ stage: 'lighthouse:api_error', status: 'failed',
          metadata: { reason: 'missing_api_key' } });
    return {
      url:          request.url,
      strategy,
      performance:  0,
      lcp:          0,
      cls:          0,
      fid:          0,
      passed:       false,
      failures:     ['missing_api_key'],
      raw_response: {},
      cached:       false,
      run_id:       request.run_id,
      tenant_id:    request.tenant_id,
    };
  }

  // ── PSI API call ──────────────────────────────────────────────────────────
  let raw: Record<string, unknown>;
  try {
    raw = await ops.fetchPsi(request.url, strategy, apiKey);
  } catch (err) {
    log({ stage: 'lighthouse:api_error', status: 'failed',
          metadata: { reason: 'fetch_failed', error: String(err) } });
    return {
      url:          request.url,
      strategy,
      performance:  0,
      lcp:          0,
      cls:          0,
      fid:          0,
      passed:       false,
      failures:     ['api_error'],
      raw_response: {},
      cached:       false,
      run_id:       request.run_id,
      tenant_id:    request.tenant_id,
    };
  }

  // ── Parse + evaluate ──────────────────────────────────────────────────────
  const metrics  = parseMetrics(raw);
  const failures = evaluateThresholds(metrics);
  const passed   = failures.length === 0;

  const result: LighthouseResult = {
    url:          request.url,
    strategy,
    performance:  metrics.performance,
    lcp:          metrics.lcp,
    cls:          metrics.cls,
    fid:          metrics.fid,
    passed,
    failures,
    raw_response: raw,
    cached:       false,
    run_id:       request.run_id,
    tenant_id:    request.tenant_id,
  };

  log({
    stage:    'lighthouse:complete',
    status:   passed ? 'ok' : 'failed',
    metadata: {
      strategy,
      performance: metrics.performance,
      lcp:         metrics.lcp,
      cls:         metrics.cls,
      fid:         metrics.fid,
      passed,
      failures,
    },
  });

  // ── Cache result (fire-and-forget) ────────────────────────────────────────
  void ops.cacheSet(key, result);

  return result;
}
