/**
 * tools/sandbox/wp_sandbox_orchestrator.test.ts
 *
 * Tests for WordPress sandbox orchestrator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runWPSandbox,
  type WPSandboxConfig,
  type WPSandboxDeps,
  type WPSandboxResult,
} from './wp_sandbox_orchestrator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function config(overrides?: Partial<WPSandboxConfig>): WPSandboxConfig {
  return {
    site_id:              's_1',
    wp_url:               'https://example.com',
    username:             'admin',
    app_password:         'xxxx',
    run_lighthouse:       false,
    run_regression:       true,
    run_delta_verify:     true,
    lighthouse_threshold: 5,
    ...overrides,
  };
}

function happyDeps(): Partial<WPSandboxDeps> {
  return {
    fetchHTMLFn:   async () => '<html><body>page</body></html>',
    deltaVerifyFn: async () => ({ verified: true }),
    regressionFn:  async () => ({ passed: true, regressions: [] }),
    lighthouseFn:  async () => ({ score: 90 }),
  };
}

const noop = async () => {};

// ── Full happy path ──────────────────────────────────────────────────────────

describe('runWPSandbox — happy path', () => {
  it('returns passed=true when all steps succeed', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.equal(result.passed, true);
    assert.equal(result.failure_reasons.length, 0);
  });

  it('sets html_snapshot_success=true', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.equal(result.html_snapshot_success, true);
  });

  it('sets delta_verified=true', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.equal(result.delta_verified, true);
  });

  it('sets regression_passed=true', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.equal(result.regression_passed, true);
  });

  it('includes fix_id, url, site_id', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.equal(result.fix_id, 'f1');
    assert.equal(result.url, 'https://example.com/p');
    assert.equal(result.site_id, 's_1');
  });

  it('includes timestamps', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.ok(result.started_at);
    assert.ok(result.completed_at);
  });
});

// ── Delta verify failures ────────────────────────────────────────────────────

describe('runWPSandbox — delta verify', () => {
  it('adds delta_verify_failed when verify fails', async () => {
    const deps = { ...happyDeps(), deltaVerifyFn: async () => ({ verified: false, reason: 'no change' }) };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.ok(result.failure_reasons.includes('delta_verify_failed'));
    assert.equal(result.passed, false);
  });

  it('adds delta_verify_failed when deltaVerifyFn throws', async () => {
    const deps = { ...happyDeps(), deltaVerifyFn: async () => { throw new Error('boom'); } };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.ok(result.failure_reasons.includes('delta_verify_failed'));
  });

  it('skips delta verify when config disabled', async () => {
    const deps = { ...happyDeps(), deltaVerifyFn: async () => ({ verified: false }) };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config({ run_delta_verify: false }), deps);
    assert.ok(!result.failure_reasons.includes('delta_verify_failed'));
  });
});

// ── Regression failures ──────────────────────────────────────────────────────

describe('runWPSandbox — regression', () => {
  it('adds regression failures to failure_reasons', async () => {
    const deps = {
      ...happyDeps(),
      regressionFn: async () => ({
        passed: false,
        regressions: [{ signal: 'title', was: 'PASS', now: 'FAIL', message: 'title disappeared' }],
      }),
    };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.equal(result.regression_passed, false);
    assert.ok(result.failure_reasons.some(r => r.includes('regression')));
    assert.equal(result.passed, false);
  });

  it('populates regressions array', async () => {
    const deps = {
      ...happyDeps(),
      regressionFn: async () => ({
        passed: false,
        regressions: [{ signal: 'og', was: 'PASS', now: 'FAIL', message: 'og tags removed' }],
      }),
    };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.ok(result.regressions);
    assert.equal(result.regressions!.length, 1);
    assert.equal(result.regressions![0].signal, 'og');
  });

  it('skips regression when config disabled', async () => {
    const deps = {
      ...happyDeps(),
      regressionFn: async () => ({ passed: false, regressions: [{ signal: 'x', was: 'PASS', now: 'FAIL', message: 'fail' }] }),
    };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config({ run_regression: false }), deps);
    assert.equal(result.regression_passed, true);
  });
});

// ── Lighthouse ───────────────────────────────────────────────────────────────

describe('runWPSandbox — lighthouse', () => {
  it('adds lighthouse_regression when score drops beyond threshold', async () => {
    let callCount = 0;
    const deps = {
      ...happyDeps(),
      lighthouseFn: async () => {
        callCount++;
        return { score: callCount === 1 ? 90 : 80 };
      },
    };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config({ run_lighthouse: true }), deps);
    assert.ok(result.failure_reasons.includes('lighthouse_regression'));
    assert.equal(result.passed, false);
  });

  it('does not add lighthouse_regression when score stable', async () => {
    const deps = { ...happyDeps(), lighthouseFn: async () => ({ score: 90 }) };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config({ run_lighthouse: true }), deps);
    assert.ok(!result.failure_reasons.includes('lighthouse_regression'));
  });

  it('populates lighthouse_delta', async () => {
    const deps = { ...happyDeps(), lighthouseFn: async () => ({ score: 85 }) };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config({ run_lighthouse: true }), deps);
    assert.ok(result.lighthouse_delta);
    assert.equal(result.lighthouse_delta!.delta, 0);
  });
});

// ── HTML snapshot failures ───────────────────────────────────────────────────

describe('runWPSandbox — snapshot failures', () => {
  it('html_snapshot_success=false when fetch fails', async () => {
    const deps = { ...happyDeps(), fetchHTMLFn: async () => { throw new Error('network'); } };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.equal(result.html_snapshot_success, false);
    assert.ok(result.failure_reasons.includes('html_snapshot_failed'));
  });

  it('adds after_snapshot_failed when second fetch fails', async () => {
    let callCount = 0;
    const deps = {
      ...happyDeps(),
      fetchHTMLFn: async () => {
        callCount++;
        if (callCount === 2) throw new Error('fail');
        return '<html></html>';
      },
    };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.ok(result.failure_reasons.includes('after_snapshot_failed'));
  });

  it('sandbox continues when before snapshot fails', async () => {
    let fixCalled = false;
    const deps = { ...happyDeps(), fetchHTMLFn: async () => { throw new Error('fail'); } };
    const result = await runWPSandbox(
      'f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage',
      async () => { fixCalled = true; },
      config({ run_delta_verify: false, run_regression: false }),
      deps,
    );
    assert.equal(fixCalled, true);
    assert.ok(result.completed_at);
  });

  it('html_snapshot_success=false when fetch returns empty string', async () => {
    const deps = { ...happyDeps(), fetchHTMLFn: async () => '' };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.equal(result.html_snapshot_success, false);
  });
});

// ── Fix execution ────────────────────────────────────────────────────────────

describe('runWPSandbox — fix execution', () => {
  it('runFix is called between before and after snapshots', async () => {
    const order: string[] = [];
    let fetchCount = 0;
    const deps: Partial<WPSandboxDeps> = {
      fetchHTMLFn: async () => {
        fetchCount++;
        order.push(fetchCount === 1 ? 'before_fetch' : 'after_fetch');
        return '<html></html>';
      },
      deltaVerifyFn: async () => ({ verified: true }),
      regressionFn:  async () => ({ passed: true, regressions: [] }),
    };
    await runWPSandbox(
      'f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage',
      async () => { order.push('fix'); },
      config(), deps,
    );
    assert.equal(order[0], 'before_fetch');
    assert.equal(order[1], 'fix');
    assert.equal(order[2], 'after_fetch');
  });

  it('adds fix_execution_failed when runFix throws', async () => {
    const result = await runWPSandbox(
      'f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage',
      async () => { throw new Error('fix broke'); },
      config(), happyDeps(),
    );
    assert.ok(result.failure_reasons.includes('fix_execution_failed'));
    assert.equal(result.passed, false);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('runWPSandbox — never throws', () => {
  it('never throws on any step failure', async () => {
    const deps: Partial<WPSandboxDeps> = {
      fetchHTMLFn:   async () => { throw new Error('fail'); },
      deltaVerifyFn: async () => { throw new Error('fail'); },
      regressionFn:  async () => { throw new Error('fail'); },
      lighthouseFn:  async () => { throw new Error('fail'); },
    };
    await assert.doesNotReject(() =>
      runWPSandbox(
        'f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage',
        async () => { throw new Error('fail'); },
        config({ run_lighthouse: true }), deps,
      ),
    );
  });

  it('never throws with null deps', async () => {
    await assert.doesNotReject(() =>
      runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config()),
    );
  });
});

// ── passed flag ──────────────────────────────────────────────────────────────

describe('runWPSandbox — passed flag', () => {
  it('passed=false when any failure_reason present', async () => {
    const deps = { ...happyDeps(), deltaVerifyFn: async () => ({ verified: false }) };
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), deps);
    assert.equal(result.passed, false);
    assert.ok(result.failure_reasons.length > 0);
  });

  it('passed=true only when failure_reasons is empty', async () => {
    const result = await runWPSandbox('f1', 'https://example.com/p', 'SCHEMA_MISSING', 'WebPage', noop, config(), happyDeps());
    assert.equal(result.passed, true);
    assert.equal(result.failure_reasons.length, 0);
  });
});
