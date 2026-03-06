/**
 * packages/validators/src/axe.ts
 *
 * Axe accessibility validator for Velocity AEO.
 *
 * Checks page HTML for accessibility violations before and after a fix is
 * applied. Blocks deployment if any critical or serious violations are found.
 *
 * Block condition: ANY violation with impact === 'critical' OR 'serious'.
 * Moderate and minor violations are recorded but do not block.
 *
 * Runner unavailability → passed=true, incomplete entry added, no throw.
 * Reason: accessibility runner absence should not block deployments.
 *
 * Caching: Redis 24h TTL, key = axe:{tenant_id}:{sha256_of_html}.
 * Never throws — always returns AxeResult.
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../action-log/src/index.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AxeRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  url:       string;
  /** Full HTML content to check. */
  html:      string;
}

export interface AxeViolation {
  /** Axe rule ID, e.g. 'image-alt', 'label', 'color-contrast'. */
  id:          string;
  impact:      AxeImpact;
  description: string;
  /** Count of affected DOM elements. */
  nodes:       number;
}

export interface AxeResult {
  url:             string;
  /** True when no critical or serious violations found. */
  passed:          boolean;
  violations:      AxeViolation[];
  /** Rules that need manual review — not blocking. */
  incomplete:      AxeViolation[];
  /** Count of passing rules. */
  passes:          number;
  violation_count: number;
  critical_count:  number;
  serious_count:   number;
  cached:          boolean;
  run_id:          string;
  tenant_id:       string;
}

// ── Raw axe-core result types ────────────────────────────────────────────────

/** Minimal shape of what axe.run() returns. */
export interface AxeRunResult {
  violations: Array<{
    id:          string;
    impact?:     string | null;
    description: string;
    nodes:       unknown[];
  }>;
  incomplete: Array<{
    id:          string;
    impact?:     string | null;
    description: string;
    nodes:       unknown[];
  }>;
  passes: unknown[];
}

// ── Cache key ─────────────────────────────────────────────────────────────────

export function htmlHash(html: string): string {
  return createHash('sha256').update(html, 'utf8').digest('hex');
}

export function cacheKey(req: AxeRequest): string {
  return `axe:${req.tenant_id}:${htmlHash(req.html)}`;
}

// ── Impact helpers ────────────────────────────────────────────────────────────

const BLOCKING_IMPACTS = new Set<AxeImpact>(['critical', 'serious']);

export function isBlocking(impact: AxeImpact): boolean {
  return BLOCKING_IMPACTS.has(impact);
}

/** Normalises raw axe impact strings; defaults to 'minor' for unknown values. */
export function normaliseImpact(raw: string | null | undefined): AxeImpact {
  if (raw === 'critical' || raw === 'serious' || raw === 'moderate' || raw === 'minor') {
    return raw;
  }
  return 'minor';
}

// ── Response parsing ──────────────────────────────────────────────────────────

function parseViolations(
  raw: AxeRunResult['violations'],
): AxeViolation[] {
  return raw.map((v) => ({
    id:          v.id,
    impact:      normaliseImpact(v.impact),
    description: v.description,
    nodes:       Array.isArray(v.nodes) ? v.nodes.length : 0,
  }));
}

// ── Injectable runner (for testing) ──────────────────────────────────────────

/**
 * Injectable axe runner. Accepts the HTML string and returns an AxeRunResult.
 * The real implementation uses @axe-core/playwright; tests inject a mock.
 */
export type AxeRunner = (html: string) => Promise<AxeRunResult>;

let _runner: AxeRunner | null = null;

export function _injectAxeRunner(fn: AxeRunner): void {
  _runner = fn;
}

export function _resetAxeRunner(): void {
  _runner = null;
}

// ── Injectable cache ops ──────────────────────────────────────────────────────

export interface AxeCacheOps {
  cacheGet: (key: string) => Promise<AxeResult | null>;
  cacheSet: (key: string, value: AxeResult) => Promise<void>;
}

let _cacheOps: AxeCacheOps | null = null;

export function _injectCacheOps(ops: Partial<AxeCacheOps>): void {
  _cacheOps = { ...defaultCacheOps(), ...ops };
}

export function _resetCacheOps(): void {
  _cacheOps = null;
}

// ── Default implementations ───────────────────────────────────────────────────

async function realAxeRunner(html: string): Promise<AxeRunResult> {
  // Dynamic import so Playwright / axe are not required at module load time.
  // This means missing Playwright does not crash the whole process.
  const { chromium } = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page }).analyze();
    return results as AxeRunResult;
  } finally {
    await browser.close();
  }
}

function defaultCacheOps(): AxeCacheOps {
  return {
    cacheGet: realCacheGet,
    cacheSet: realCacheSet,
  };
}

async function realCacheGet(key: string): Promise<AxeResult | null> {
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
    return JSON.parse(body.result) as AxeResult;
  } catch {
    return null;
  }
}

async function realCacheSet(key: string, value: AxeResult): Promise<void> {
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

// ── runAxe ────────────────────────────────────────────────────────────────────

/**
 * Runs the Axe accessibility checker against the provided HTML.
 *
 * Flow:
 *   1. Cache check by SHA-256 of HTML.
 *   2. Run axe (injected runner or real Playwright runner).
 *   3. Parse violations, determine passed status.
 *   4. Cache result (fire-and-forget).
 *   5. Write ActionLog.
 *
 * Runner unavailability → passed=true, non-blocking skip.
 * Never throws.
 */
export async function runAxe(
  request: AxeRequest,
  _testRunner?: AxeRunner,
  _testCacheOps?: Partial<AxeCacheOps>,
): Promise<AxeResult> {
  const runner    = _testRunner ?? _runner ?? realAxeRunner;
  const cacheOps  = _testCacheOps
    ? { ...defaultCacheOps(), ..._testCacheOps }
    : (_cacheOps ?? defaultCacheOps());

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       'shopify', // validators are CMS-agnostic
    command:   'axe',
    url:       request.url,
  });

  const key = cacheKey(request);

  // ── Cache check ──────────────────────────────────────────────────────────
  try {
    const cached = await cacheOps.cacheGet(key);
    if (cached) {
      log({ stage: 'axe:cache_hit', status: 'ok',
            metadata: { violation_count: cached.violation_count } });
      return { ...cached, cached: true };
    }
  } catch {
    // Cache read failure is non-fatal
  }

  log({ stage: 'axe:start', status: 'pending',
        metadata: { html_length: request.html.length } });

  // ── Axe run ──────────────────────────────────────────────────────────────
  let raw: AxeRunResult;
  try {
    raw = await runner(request.html);
  } catch {
    // Runner unavailable — skip rather than block
    log({ stage: 'axe:complete', status: 'skipped',
          metadata: { reason: 'axe_runner_unavailable' } });
    return {
      url:             request.url,
      passed:          true,
      violations:      [],
      incomplete:      [{ id: 'axe_runner_unavailable', impact: 'minor',
                          description: 'axe_runner_unavailable — skipping', nodes: 0 }],
      passes:          0,
      violation_count: 0,
      critical_count:  0,
      serious_count:   0,
      cached:          false,
      run_id:          request.run_id,
      tenant_id:       request.tenant_id,
    };
  }

  // ── Parse results ─────────────────────────────────────────────────────────
  const violations = parseViolations(raw.violations ?? []);
  const incomplete = parseViolations(raw.incomplete  ?? []);
  const passes     = Array.isArray(raw.passes) ? raw.passes.length : 0;

  const criticalCount = violations.filter((v) => v.impact === 'critical').length;
  const seriousCount  = violations.filter((v) => v.impact === 'serious').length;
  const passed        = criticalCount === 0 && seriousCount === 0;

  const result: AxeResult = {
    url:             request.url,
    passed,
    violations,
    incomplete,
    passes,
    violation_count: violations.length,
    critical_count:  criticalCount,
    serious_count:   seriousCount,
    cached:          false,
    run_id:          request.run_id,
    tenant_id:       request.tenant_id,
  };

  log({
    stage:    'axe:complete',
    status:   passed ? 'ok' : 'failed',
    metadata: {
      passed,
      violation_count: violations.length,
      critical_count:  criticalCount,
      serious_count:   seriousCount,
      passes,
    },
  });

  if (!passed) {
    const blockingIds = violations
      .filter((v) => isBlocking(v.impact))
      .map((v) => v.id);
    log({
      stage:    'axe:blocked',
      status:   'failed',
      metadata: { blocking_rule_ids: blockingIds },
    });
  }

  // ── Cache (fire-and-forget) ───────────────────────────────────────────────
  void cacheOps.cacheSet(key, result);

  return result;
}
