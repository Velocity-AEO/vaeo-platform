/**
 * packages/validators/src/lighthouse.test.ts
 *
 * Unit tests for the Lighthouse / PageSpeed Insights validator.
 * All PSI API and Redis calls are mocked — no real network calls.
 *
 * Tests confirm:
 *   1.  Passes when all thresholds met
 *   2.  Fails when performance score below 0.70
 *   3.  Fails when LCP above 2.5 seconds
 *   4.  Fails when CLS above 0.1
 *   5.  Fails when FID/TBT above 100 ms
 *   6.  Cache hit returns cached result without API call
 *   7.  API failure returns passed=false without throwing
 *   8.  Missing API key returns passed=false without throwing
 *   9.  compareResults detects performance regression > 10 points
 *  10.  compareResults detects LCP regression > 20%
 *  11.  compareResults detects CLS regression > 0.05
 *  12.  compareResults returns regressed=false when metrics improve
 *  13.  parseMetrics extracts values correctly (LCP ms→s conversion)
 *  14.  evaluateThresholds returns empty array when all pass
 *  15.  cacheKey format is lighthouse:{tenant_id}:{url}:{strategy}
 *  16.  ActionLog: lighthouse:start + lighthouse:complete on success
 *  17.  ActionLog: lighthouse:cache_hit on cache hit
 *  18.  ActionLog: lighthouse:api_error on failure
 *  19.  Multiple threshold failures reported together
 *  20.  cached: true on cache hit, cached: false on fresh fetch
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runLighthouse,
  compareResults,
  parseMetrics,
  evaluateThresholds,
  cacheKey,
  PERF_MIN,
  LCP_MAX,
  CLS_MAX,
  FID_MAX,
  type LighthouseRequest,
  type LighthouseResult,
  type LighthouseOps,
} from './lighthouse.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureStdout(fn: () => Promise<void>): Promise<string[]>;
function captureStdout(fn: () => void): string[];
function captureStdout(fn: () => void | Promise<void>): string[] | Promise<string[]> {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  const result = fn();
  if (result && typeof (result as Promise<void>).then === 'function') {
    return (result as Promise<void>).finally(() => { process.stdout.write = orig; }).then(() => captured);
  }
  process.stdout.write = orig;
  return captured;
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

function req(overrides: Partial<LighthouseRequest> = {}): LighthouseRequest {
  return {
    run_id:    'run-lh-001',
    tenant_id: 't-aaa',
    site_id:   's-bbb',
    url:       'https://cococabanalife.com/products/sun-glow-bikini',
    strategy:  'mobile',
    ...overrides,
  };
}

/** Builds a minimal raw PSI API response from metric values. */
function psiResponse(opts: {
  performance?: number;
  lcpMs?:       number;  // raw API value in milliseconds
  cls?:         number;
  tbtMs?:       number;
}): Record<string, unknown> {
  return {
    lighthouseResult: {
      categories: {
        performance: { score: opts.performance ?? 0.84 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: opts.lcpMs    ?? 1800 },
        'cumulative-layout-shift':  { numericValue: opts.cls      ?? 0.05 },
        'total-blocking-time':      { numericValue: opts.tbtMs    ?? 80   },
      },
    },
  };
}

function goodPsi(): Record<string, unknown> {
  return psiResponse({ performance: 0.84, lcpMs: 1800, cls: 0.05, tbtMs: 80 });
}

function mockOps(overrides: {
  psiResp?:    Record<string, unknown> | Error;
  cached?:     LighthouseResult | null;
  apiKey?:     string | null;
  cacheSetFn?: (key: string, val: LighthouseResult) => void;
} = {}): Partial<LighthouseOps> {
  let apiCallCount = 0;
  return {
    getApiKey: () => (overrides.apiKey !== undefined ? overrides.apiKey : 'test-key'),
    cacheGet:  async () => (overrides.cached !== undefined ? overrides.cached : null),
    cacheSet:  async (key, val) => { overrides.cacheSetFn?.(key, val); },
    fetchPsi:  async () => {
      apiCallCount++;
      if (overrides.psiResp instanceof Error) throw overrides.psiResp;
      return overrides.psiResp ?? goodPsi();
    },
    // Expose for assertions via closure
    _apiCallCount: () => apiCallCount,
  } as Partial<LighthouseOps> & { _apiCallCount: () => number };
}

/** Minimal LighthouseResult for compareResults tests. */
function result(overrides: Partial<LighthouseResult> = {}): LighthouseResult {
  return {
    url:          'https://example.com',
    strategy:     'mobile',
    performance:  0.84,
    lcp:          1.8,
    cls:          0.05,
    fid:          80,
    passed:       true,
    failures:     [],
    raw_response: {},
    cached:       false,
    run_id:       'run-lh-001',
    tenant_id:    't-aaa',
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe('threshold constants', () => {
  it('PERF_MIN = 0.70', () => assert.equal(PERF_MIN, 0.70));
  it('LCP_MAX  = 2.5',  () => assert.equal(LCP_MAX,  2.5));
  it('CLS_MAX  = 0.1',  () => assert.equal(CLS_MAX,  0.1));
  it('FID_MAX  = 100',  () => assert.equal(FID_MAX,  100));
});

// ── cacheKey ──────────────────────────────────────────────────────────────────

describe('cacheKey', () => {
  it('format: lighthouse:{tenant_id}:{url}:{strategy}', () => {
    const r = req();
    assert.equal(cacheKey(r), `lighthouse:t-aaa:${r.url}:mobile`);
  });

  it('defaults strategy to mobile when omitted', () => {
    const r = req({ strategy: undefined });
    assert.ok(cacheKey(r).endsWith(':mobile'));
  });
});

// ── parseMetrics ─────────────────────────────────────────────────────────────

describe('parseMetrics', () => {
  it('extracts performance, lcp (ms→s), cls, fid from PSI response', () => {
    const raw = psiResponse({ performance: 0.84, lcpMs: 2400, cls: 0.08, tbtMs: 95 });
    const m   = parseMetrics(raw);
    assert.equal(m.performance, 0.84);
    assert.equal(m.lcp, 2.4);   // 2400 ms → 2.4 s
    assert.equal(m.cls, 0.08);
    assert.equal(m.fid, 95);
  });

  it('returns 0 for missing fields', () => {
    const m = parseMetrics({});
    assert.equal(m.performance, 0);
    assert.equal(m.lcp, 0);
    assert.equal(m.cls, 0);
    assert.equal(m.fid, 0);
  });

  it('LCP value from API (ms) is correctly divided by 1000', () => {
    const raw = psiResponse({ lcpMs: 1500 });
    const m   = parseMetrics(raw);
    assert.equal(m.lcp, 1.5);
  });
});

// ── evaluateThresholds ────────────────────────────────────────────────────────

describe('evaluateThresholds', () => {
  it('returns empty array when all thresholds met', () => {
    const failures = evaluateThresholds({ performance: 0.84, lcp: 1.8, cls: 0.05, fid: 80 });
    assert.deepEqual(failures, []);
  });

  it('reports performance failure when below 0.70', () => {
    const failures = evaluateThresholds({ performance: 0.65, lcp: 1.8, cls: 0.05, fid: 80 });
    assert.ok(failures.some((f) => f.startsWith('performance_below')));
  });

  it('reports lcp failure when above 2.5', () => {
    const failures = evaluateThresholds({ performance: 0.84, lcp: 3.2, cls: 0.05, fid: 80 });
    assert.ok(failures.some((f) => f.startsWith('lcp_above')));
  });

  it('reports cls failure when above 0.1', () => {
    const failures = evaluateThresholds({ performance: 0.84, lcp: 1.8, cls: 0.15, fid: 80 });
    assert.ok(failures.some((f) => f.startsWith('cls_above')));
  });

  it('reports fid failure when above 100', () => {
    const failures = evaluateThresholds({ performance: 0.84, lcp: 1.8, cls: 0.05, fid: 150 });
    assert.ok(failures.some((f) => f.startsWith('fid_above')));
  });

  it('reports multiple failures in a single call', () => {
    const failures = evaluateThresholds({ performance: 0.60, lcp: 3.5, cls: 0.2, fid: 200 });
    assert.equal(failures.length, 4);
  });
});

// ── compareResults ────────────────────────────────────────────────────────────

describe('compareResults', () => {
  it('returns regressed=false when metrics improve', () => {
    const before = result({ performance: 0.80, lcp: 2.0, cls: 0.08 });
    const after  = result({ performance: 0.85, lcp: 1.8, cls: 0.06 });
    const r = compareResults(before, after);
    assert.equal(r.regressed, false);
    assert.deepEqual(r.details, []);
  });

  it('detects performance regression > 10 points', () => {
    const before = result({ performance: 0.85 });
    const after  = result({ performance: 0.74 }); // dropped 0.11
    const r = compareResults(before, after);
    assert.equal(r.regressed, true);
    assert.ok(r.details.some((d) => d.startsWith('performance_regressed')));
  });

  it('does NOT flag performance drop <= 10 points', () => {
    const before = result({ performance: 0.85 });
    const after  = result({ performance: 0.75 }); // dropped exactly 0.10
    const r = compareResults(before, after);
    assert.equal(r.regressed, false);
  });

  it('detects LCP regression > 20%', () => {
    const before = result({ lcp: 2.0 });
    const after  = result({ lcp: 2.5 }); // +25%
    const r = compareResults(before, after);
    assert.equal(r.regressed, true);
    assert.ok(r.details.some((d) => d.startsWith('lcp_regressed')));
  });

  it('does NOT flag LCP increase <= 20%', () => {
    const before = result({ lcp: 2.0 });
    const after  = result({ lcp: 2.4 }); // +20% exactly
    const r = compareResults(before, after);
    const lcpFlag = r.details.some((d) => d.startsWith('lcp_regressed'));
    assert.equal(lcpFlag, false);
  });

  it('detects CLS regression > 0.05', () => {
    const before = result({ cls: 0.03 });
    const after  = result({ cls: 0.09 }); // +0.06
    const r = compareResults(before, after);
    assert.equal(r.regressed, true);
    assert.ok(r.details.some((d) => d.startsWith('cls_regressed')));
  });

  it('does NOT flag CLS increase <= 0.05', () => {
    const before = result({ cls: 0.03 });
    const after  = result({ cls: 0.07 }); // +0.04
    const r = compareResults(before, after);
    const clsFlag = r.details.some((d) => d.startsWith('cls_regressed'));
    assert.equal(clsFlag, false);
  });

  it('can report multiple regressions at once', () => {
    const before = result({ performance: 0.90, lcp: 1.5, cls: 0.02 });
    const after  = result({ performance: 0.75, lcp: 2.5, cls: 0.10 });
    const r = compareResults(before, after);
    assert.equal(r.regressed, true);
    assert.ok(r.details.length >= 2);
  });
});

// ── runLighthouse — passing ───────────────────────────────────────────────────

describe('runLighthouse — passes when all thresholds met', () => {
  it('returns passed=true and empty failures[]', async () => {
    const ops = mockOps({ psiResp: goodPsi() });
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.passed,   true);
    assert.deepEqual(r.failures, []);
    assert.equal(r.performance, 0.84);
    assert.equal(r.lcp, 1.8);
    assert.equal(r.cls, 0.05);
    assert.equal(r.fid, 80);
    assert.equal(r.cached, false);
  });

  it('result includes run_id and tenant_id', async () => {
    const ops = mockOps();
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.run_id,    'run-lh-001');
    assert.equal(r.tenant_id, 't-aaa');
    assert.equal(r.url,       req().url);
    assert.equal(r.strategy,  'mobile');
  });
});

// ── runLighthouse — threshold failures ───────────────────────────────────────

describe('runLighthouse — fails on threshold breach', () => {
  it('fails when performance score below 0.70', async () => {
    const ops = mockOps({ psiResp: psiResponse({ performance: 0.65 }) });
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.passed, false);
    assert.ok(r.failures.some((f) => f.startsWith('performance_below')));
  });

  it('fails when LCP above 2.5 seconds', async () => {
    const ops = mockOps({ psiResp: psiResponse({ lcpMs: 3200 }) }); // 3.2s
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.passed, false);
    assert.ok(r.failures.some((f) => f.startsWith('lcp_above')));
  });

  it('fails when CLS above 0.1', async () => {
    const ops = mockOps({ psiResp: psiResponse({ cls: 0.15 }) });
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.passed, false);
    assert.ok(r.failures.some((f) => f.startsWith('cls_above')));
  });

  it('fails when FID/TBT above 100 ms', async () => {
    const ops = mockOps({ psiResp: psiResponse({ tbtMs: 150 }) });
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.passed, false);
    assert.ok(r.failures.some((f) => f.startsWith('fid_above')));
  });

  it('reports multiple failures together', async () => {
    const ops = mockOps({ psiResp: psiResponse({ performance: 0.60, lcpMs: 3200, cls: 0.2, tbtMs: 200 }) });
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.passed, false);
    assert.equal(r.failures.length, 4);
  });
});

// ── runLighthouse — cache hit ─────────────────────────────────────────────────

describe('runLighthouse — cache hit', () => {
  it('returns cached result and skips API call', async () => {
    const cachedResult = result({ performance: 0.91, cached: false });
    const ops = mockOps({ cached: cachedResult }) as Partial<LighthouseOps> & { _apiCallCount: () => number };
    const r   = await runLighthouse(req(), ops);
    assert.equal(r.cached,      true);
    assert.equal(r.performance, 0.91);
    assert.equal(ops._apiCallCount(), 0, 'API must not be called on cache hit');
  });
});

// ── runLighthouse — API failure ────────────────────────────────────────────────

describe('runLighthouse — API failure', () => {
  it('returns passed=false without throwing when fetch fails', async () => {
    const ops = mockOps({ psiResp: new Error('Network timeout') });
    let r: LighthouseResult | undefined;
    await assert.doesNotReject(async () => {
      r = await runLighthouse(req(), ops);
    });
    assert.ok(r);
    assert.equal(r!.passed, false);
    assert.ok(r!.failures.includes('api_error'));
    assert.equal(r!.performance, 0);
  });

  it('returns passed=false without throwing when API key missing', async () => {
    const ops = mockOps({ apiKey: null });
    let r: LighthouseResult | undefined;
    await assert.doesNotReject(async () => {
      r = await runLighthouse(req(), ops);
    });
    assert.ok(r);
    assert.equal(r!.passed, false);
    assert.ok(r!.failures.includes('missing_api_key'));
  });
});

// ── ActionLog ────────────────────────────────────────────────────────────────

describe('runLighthouse — ActionLog', () => {
  it('writes lighthouse:start and lighthouse:complete on success', async () => {
    const ops   = mockOps({ psiResp: goodPsi() });
    const lines = await captureStdout(async () => { await runLighthouse(req(), ops); });
    const entries = parseLines(lines);

    const start    = entries.find((e) => e['stage'] === 'lighthouse:start');
    const complete = entries.find((e) => e['stage'] === 'lighthouse:complete');

    assert.ok(start,    'lighthouse:start expected');
    assert.ok(complete, 'lighthouse:complete expected');
    assert.equal(complete!['status'], 'ok');

    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['performance'], 0.84);
    assert.equal(meta['passed'],      true);
  });

  it('ActionLog complete matches spec for score 0.84 pass', async () => {
    const ops   = mockOps({ psiResp: goodPsi() });
    const lines = await captureStdout(async () => { await runLighthouse(req(), ops); });
    const entries = parseLines(lines);
    const complete = entries.find((e) => e['stage'] === 'lighthouse:complete');

    assert.ok(complete);
    assert.equal(complete!['run_id'],    'run-lh-001');
    assert.equal(complete!['tenant_id'], 't-aaa');
    assert.equal(complete!['command'],   'lighthouse');
    assert.equal(complete!['status'],    'ok');

    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['strategy'],    'mobile');
    assert.equal(meta['performance'], 0.84);
    assert.equal(meta['lcp'],         1.8);
    assert.equal(meta['passed'],      true);
    assert.deepEqual(meta['failures'], []);
  });

  it('writes lighthouse:cache_hit when returning from cache', async () => {
    const ops   = mockOps({ cached: result() });
    const lines = await captureStdout(async () => { await runLighthouse(req(), ops); });
    const entries = parseLines(lines);
    const hit = entries.find((e) => e['stage'] === 'lighthouse:cache_hit');
    assert.ok(hit, 'lighthouse:cache_hit expected');
    assert.equal(hit!['status'], 'ok');
  });

  it('writes lighthouse:api_error on fetch failure', async () => {
    const ops   = mockOps({ psiResp: new Error('timeout') });
    const lines = await captureStdout(async () => { await runLighthouse(req(), ops); });
    const entries = parseLines(lines);
    const err = entries.find((e) => e['stage'] === 'lighthouse:api_error');
    assert.ok(err, 'lighthouse:api_error expected');
    assert.equal(err!['status'], 'failed');
  });

  it('writes lighthouse:api_error when API key missing', async () => {
    const ops   = mockOps({ apiKey: null });
    const lines = await captureStdout(async () => { await runLighthouse(req(), ops); });
    const entries = parseLines(lines);
    const err = entries.find((e) => e['stage'] === 'lighthouse:api_error');
    assert.ok(err);
    const meta = err!['metadata'] as Record<string, unknown>;
    assert.equal(meta['reason'], 'missing_api_key');
  });
});
