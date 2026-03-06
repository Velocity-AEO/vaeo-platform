/**
 * packages/validators/src/axe.test.ts
 *
 * Unit tests for the Axe accessibility validator.
 * All axe runs are mocked — no real Playwright / browser launched.
 *
 * Tests confirm:
 *   1.  No violations → passed=true
 *   2.  Critical violation → passed=false
 *   3.  Serious violation → passed=false
 *   4.  Moderate violation → passed=true (not blocking)
 *   5.  Minor violation → passed=true (not blocking)
 *   6.  Cache hit returns without running axe
 *   7.  Runner unavailable → passed=true without throwing
 *   8.  violation_count and critical_count are accurate
 *   9.  cacheKey format: axe:{tenant_id}:{sha256_of_html}
 *  10.  Same HTML → same cache key regardless of URL
 *  11.  incomplete[] populated from runner incomplete output
 *  12.  ActionLog: axe:start + axe:complete on success
 *  13.  ActionLog: axe:blocked when critical/serious found
 *  14.  ActionLog: axe:cache_hit on cache hit
 *  15.  ActionLog: NOT axe:blocked when only moderate/minor
 *  16.  normaliseImpact handles unknown values
 *  17.  passes count matches runner output
 *  18.  cached=true on cache hit, cached=false on fresh run
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  runAxe,
  cacheKey,
  htmlHash,
  normaliseImpact,
  isBlocking,
  type AxeRequest,
  type AxeResult,
  type AxeRunner,
  type AxeCacheOps,
  type AxeRunResult,
} from './axe.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureStdout(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return fn().finally(() => { process.stdout.write = orig; }).then(() => captured);
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

const TEST_HTML = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';

function req(overrides: Partial<AxeRequest> = {}): AxeRequest {
  return {
    run_id:    'run-axe-001',
    tenant_id: 't-aaa',
    site_id:   's-bbb',
    url:       'https://cococabanalife.com/products/sun-glow-bikini',
    html:      TEST_HTML,
    ...overrides,
  };
}

/** Builds a minimal AxeRunResult from a list of violation specs. */
function axeResp(violations: Array<{
  id:          string;
  impact:      string;
  description: string;
  nodes?:      number;
}>, incomplete: typeof violations = [], passes = 12): AxeRunResult {
  return {
    violations: violations.map((v) => ({
      id:          v.id,
      impact:      v.impact,
      description: v.description,
      nodes:       Array.from({ length: v.nodes ?? 1 }),
    })),
    incomplete: incomplete.map((v) => ({
      id:          v.id,
      impact:      v.impact,
      description: v.description,
      nodes:       Array.from({ length: v.nodes ?? 1 }),
    })),
    passes: Array.from({ length: passes }),
  };
}

function noViolationsResp(): AxeRunResult {
  return axeResp([], [], 24);
}

function mockRunner(resp: AxeRunResult | Error): AxeRunner {
  return async () => {
    if (resp instanceof Error) throw resp;
    return resp;
  };
}

function mockCacheOps(overrides: {
  cached?:     AxeResult | null;
  cacheSetFn?: (key: string, val: AxeResult) => void;
} = {}): Partial<AxeCacheOps> {
  return {
    cacheGet: async () => (overrides.cached !== undefined ? overrides.cached : null),
    cacheSet: async (k, v) => { overrides.cacheSetFn?.(k, v); },
  };
}

function axeResult(overrides: Partial<AxeResult> = {}): AxeResult {
  return {
    url:             req().url,
    passed:          true,
    violations:      [],
    incomplete:      [],
    passes:          24,
    violation_count: 0,
    critical_count:  0,
    serious_count:   0,
    cached:          false,
    run_id:          'run-axe-001',
    tenant_id:       't-aaa',
    ...overrides,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

describe('htmlHash', () => {
  it('produces a 64-char hex SHA-256', () => {
    assert.match(htmlHash(TEST_HTML), /^[0-9a-f]{64}$/);
  });

  it('identical HTML → identical hash', () => {
    assert.equal(htmlHash(TEST_HTML), htmlHash(TEST_HTML));
  });

  it('matches node:crypto output directly', () => {
    const expected = createHash('sha256').update(TEST_HTML, 'utf8').digest('hex');
    assert.equal(htmlHash(TEST_HTML), expected);
  });
});

describe('cacheKey', () => {
  it('format: axe:{tenant_id}:{sha256}', () => {
    const r   = req();
    const key = cacheKey(r);
    assert.ok(key.startsWith(`axe:${r.tenant_id}:`));
    assert.ok(key.endsWith(htmlHash(r.html)));
  });

  it('same HTML, different URLs → same key', () => {
    const html = TEST_HTML;
    const r1   = req({ url: 'https://example.com/a', html });
    const r2   = req({ url: 'https://example.com/b', html });
    assert.equal(cacheKey(r1), cacheKey(r2));
  });

  it('different HTML → different key', () => {
    assert.notEqual(
      cacheKey(req({ html: '<html><body>a</body></html>' })),
      cacheKey(req({ html: '<html><body>b</body></html>' })),
    );
  });
});

describe('normaliseImpact', () => {
  it('passes through valid impact values', () => {
    assert.equal(normaliseImpact('critical'), 'critical');
    assert.equal(normaliseImpact('serious'),  'serious');
    assert.equal(normaliseImpact('moderate'), 'moderate');
    assert.equal(normaliseImpact('minor'),    'minor');
  });

  it('defaults unknown values to minor', () => {
    assert.equal(normaliseImpact('unknown'), 'minor');
    assert.equal(normaliseImpact(null),      'minor');
    assert.equal(normaliseImpact(undefined), 'minor');
  });
});

describe('isBlocking', () => {
  it('critical and serious are blocking', () => {
    assert.equal(isBlocking('critical'), true);
    assert.equal(isBlocking('serious'),  true);
  });

  it('moderate and minor are not blocking', () => {
    assert.equal(isBlocking('moderate'), false);
    assert.equal(isBlocking('minor'),    false);
  });
});

// ── runAxe — no violations ────────────────────────────────────────────────────

describe('runAxe — no violations', () => {
  it('returns passed=true with empty violations[]', async () => {
    const r = await runAxe(req(), mockRunner(noViolationsResp()), mockCacheOps());
    assert.equal(r.passed,          true);
    assert.deepEqual(r.violations,  []);
    assert.equal(r.violation_count, 0);
    assert.equal(r.critical_count,  0);
    assert.equal(r.serious_count,   0);
    assert.equal(r.cached,          false);
  });

  it('passes count reflects runner output', async () => {
    const r = await runAxe(req(), mockRunner(noViolationsResp()), mockCacheOps());
    assert.equal(r.passes, 24);
  });

  it('result has run_id, tenant_id, url', async () => {
    const r = await runAxe(req(), mockRunner(noViolationsResp()), mockCacheOps());
    assert.equal(r.run_id,    'run-axe-001');
    assert.equal(r.tenant_id, 't-aaa');
    assert.equal(r.url,       req().url);
  });
});

// ── runAxe — blocking violations ─────────────────────────────────────────────

describe('runAxe — critical violation', () => {
  it('returns passed=false', async () => {
    const resp = axeResp([{ id: 'image-alt', impact: 'critical', description: 'Images must have alternate text', nodes: 3 }]);
    const r    = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.passed,         false);
    assert.equal(r.critical_count, 1);
    assert.equal(r.serious_count,  0);
    assert.equal(r.violation_count, 1);
    assert.equal(r.violations[0].id,     'image-alt');
    assert.equal(r.violations[0].impact, 'critical');
    assert.equal(r.violations[0].nodes,  3);
  });
});

describe('runAxe — serious violation', () => {
  it('returns passed=false', async () => {
    const resp = axeResp([{ id: 'label', impact: 'serious', description: 'Form elements must have labels' }]);
    const r    = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.passed,        false);
    assert.equal(r.serious_count, 1);
    assert.equal(r.critical_count, 0);
  });
});

describe('runAxe — non-blocking violations', () => {
  it('moderate violation does NOT cause passed=false', async () => {
    const resp = axeResp([{ id: 'color-contrast', impact: 'moderate', description: 'Color contrast check' }]);
    const r    = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.passed,          true);
    assert.equal(r.violation_count, 1);
    assert.equal(r.critical_count,  0);
    assert.equal(r.serious_count,   0);
  });

  it('minor violation does NOT cause passed=false', async () => {
    const resp = axeResp([{ id: 'skip-link', impact: 'minor', description: 'Skip link check' }]);
    const r    = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.passed, true);
  });

  it('mixed: critical + moderate → passed=false, both recorded', async () => {
    const resp = axeResp([
      { id: 'image-alt',     impact: 'critical', description: 'Missing alt text',    nodes: 2 },
      { id: 'color-contrast', impact: 'moderate', description: 'Low color contrast', nodes: 5 },
    ]);
    const r = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.passed,          false);
    assert.equal(r.violation_count, 2);
    assert.equal(r.critical_count,  1);
    assert.equal(r.serious_count,   0);
  });
});

// ── runAxe — violation_count + critical_count accuracy ────────────────────────

describe('runAxe — counts', () => {
  it('violation_count, critical_count, serious_count are accurate', async () => {
    const resp = axeResp([
      { id: 'image-alt', impact: 'critical', description: 'Alt text', nodes: 4 },
      { id: 'label',     impact: 'serious',  description: 'Label',    nodes: 1 },
      { id: 'contrast',  impact: 'moderate', description: 'Contrast', nodes: 7 },
      { id: 'skip',      impact: 'minor',    description: 'Skip',     nodes: 1 },
    ]);
    const r = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.violation_count, 4);
    assert.equal(r.critical_count,  1);
    assert.equal(r.serious_count,   1);
    assert.equal(r.passed,          false);
  });

  it('nodes count reflects number of affected elements', async () => {
    const resp = axeResp([{ id: 'image-alt', impact: 'critical', description: 'Alt', nodes: 6 }]);
    const r    = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.violations[0].nodes, 6);
  });
});

// ── runAxe — cache hit ────────────────────────────────────────────────────────

describe('runAxe — cache hit', () => {
  it('returns cached result and skips runner', async () => {
    let runnerCalled = false;
    const runner: AxeRunner = async () => {
      runnerCalled = true;
      return noViolationsResp();
    };
    const cached = axeResult({ passed: true, passes: 20 });
    const r      = await runAxe(req(), runner, mockCacheOps({ cached }));
    assert.equal(r.cached, true);
    assert.equal(r.passes, 20);
    assert.equal(runnerCalled, false, 'runner must not be called on cache hit');
  });
});

// ── runAxe — runner unavailable ───────────────────────────────────────────────

describe('runAxe — runner unavailable', () => {
  it('returns passed=true without throwing when runner throws', async () => {
    const runner = mockRunner(new Error('Playwright not installed'));
    let r: AxeResult | undefined;
    await assert.doesNotReject(async () => {
      r = await runAxe(req(), runner, mockCacheOps());
    });
    assert.ok(r);
    assert.equal(r!.passed,          true);
    assert.equal(r!.violation_count, 0);
    assert.ok(r!.incomplete.some((i) => i.description.includes('axe_runner_unavailable')));
  });

  it('does not throw on runner failure', async () => {
    await assert.doesNotReject(() =>
      runAxe(req(), mockRunner(new Error('Browser crash')), mockCacheOps()),
    );
  });
});

// ── runAxe — incomplete ───────────────────────────────────────────────────────

describe('runAxe — incomplete', () => {
  it('populates incomplete[] from runner output', async () => {
    const resp = axeResp(
      [],
      [{ id: 'aria-required-children', impact: 'serious', description: 'Needs manual review' }],
    );
    const r = await runAxe(req(), mockRunner(resp), mockCacheOps());
    assert.equal(r.incomplete.length, 1);
    assert.equal(r.incomplete[0].id, 'aria-required-children');
  });

  it('incomplete does not affect passed status', async () => {
    const resp = axeResp(
      [],
      [{ id: 'aria-required-children', impact: 'critical', description: 'Review needed' }],
    );
    const r = await runAxe(req(), mockRunner(resp), mockCacheOps());
    // incomplete items never block — only violations do
    assert.equal(r.passed, true);
  });
});

// ── ActionLog ─────────────────────────────────────────────────────────────────

describe('runAxe — ActionLog', () => {
  it('writes axe:start and axe:complete on success', async () => {
    const lines = await captureStdout(async () => {
      await runAxe(req(), mockRunner(noViolationsResp()), mockCacheOps());
    });
    const entries = parseLines(lines);
    const start    = entries.find((e) => e['stage'] === 'axe:start');
    const complete = entries.find((e) => e['stage'] === 'axe:complete');

    assert.ok(start,    'axe:start expected');
    assert.ok(complete, 'axe:complete expected');
    assert.equal(complete!['status'], 'ok');

    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['passed'],          true);
    assert.equal(meta['violation_count'], 0);
  });

  it('writes axe:blocked when critical violations found — matches spec', async () => {
    const resp = axeResp([
      { id: 'image-alt', impact: 'critical', description: 'Images must have alternate text', nodes: 2 },
    ]);
    const lines = await captureStdout(async () => {
      await runAxe(req(), mockRunner(resp), mockCacheOps());
    });
    const entries = parseLines(lines);
    const blocked  = entries.find((e) => e['stage'] === 'axe:blocked');
    const complete = entries.find((e) => e['stage'] === 'axe:complete');

    assert.ok(blocked,  'axe:blocked expected');
    assert.equal(blocked!['status'], 'failed');

    const blockedMeta = blocked!['metadata'] as Record<string, unknown>;
    const ids = blockedMeta['blocking_rule_ids'] as string[];
    assert.ok(ids.includes('image-alt'));

    assert.ok(complete);
    assert.equal(complete!['status'], 'failed');
    assert.equal(complete!['run_id'],    'run-axe-001');
    assert.equal(complete!['tenant_id'], 't-aaa');
    assert.equal(complete!['command'],   'axe');
  });

  it('does NOT write axe:blocked when only moderate/minor', async () => {
    const resp  = axeResp([{ id: 'color-contrast', impact: 'moderate', description: 'Contrast' }]);
    const lines = await captureStdout(async () => {
      await runAxe(req(), mockRunner(resp), mockCacheOps());
    });
    const entries = parseLines(lines);
    const blocked = entries.find((e) => e['stage'] === 'axe:blocked');
    assert.ok(!blocked, 'axe:blocked must not fire for non-blocking violations');
  });

  it('writes axe:cache_hit when returning from cache', async () => {
    const cached = axeResult();
    const lines  = await captureStdout(async () => {
      await runAxe(req(), mockRunner(noViolationsResp()), mockCacheOps({ cached }));
    });
    const entries = parseLines(lines);
    const hit = entries.find((e) => e['stage'] === 'axe:cache_hit');
    assert.ok(hit, 'axe:cache_hit expected');
    assert.equal(hit!['status'], 'ok');
  });
});

// ── runAxe — cache write ──────────────────────────────────────────────────────

describe('runAxe — cache write', () => {
  it('writes result to cache after fresh run', async () => {
    let cachedKey   = '';
    let cachedValue: AxeResult | undefined;

    const r = req();
    await runAxe(
      r,
      mockRunner(noViolationsResp()),
      mockCacheOps({ cacheSetFn: (k, v) => { cachedKey = k; cachedValue = v; } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(cachedKey, cacheKey(r));
    assert.ok(cachedValue);
    assert.equal(cachedValue!.passed, true);
  });
});
