/**
 * tools/sandbox/regression_monitor.test.ts
 *
 * Tests for regression monitor.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkForRegressions,
  createMemoryStore,
  getHistory,
  hasActiveRegressions,
  type MonitorStore,
} from './regression_monitor.js';
import type {
  MultiVerifyResult,
  SignalResult,
  VerifySignal,
} from './multi_verify.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const URL = 'https://example.com/page';

function makeResult(
  signalStatuses: Array<[VerifySignal, 'PASS' | 'FAIL' | 'SKIP']>,
): MultiVerifyResult {
  const signals: SignalResult[] = signalStatuses.map(([signal, status]) => ({
    signal,
    status,
  }));
  const pass_count = signals.filter((s) => s.status === 'PASS').length;
  const fail_count = signals.filter((s) => s.status === 'FAIL').length;
  return {
    url: URL,
    fetchedAt: new Date().toISOString(),
    signals,
    overall: fail_count === 0 ? 'PASS' : pass_count === 0 ? 'FAIL' : 'PARTIAL',
    pass_count,
    fail_count,
  };
}

// ── No history (first check) ─────────────────────────────────────────────────

describe('checkForRegressions — first check', () => {
  it('no alerts on first check (no baseline)', () => {
    const store = createMemoryStore();
    const current = makeResult([['title', 'PASS'], ['schema', 'FAIL']]);
    const result = checkForRegressions(current, store);
    assert.equal(result.has_regression, false);
    assert.equal(result.alerts.length, 0);
    assert.equal(result.streak, 0);
  });

  it('saves snapshot to history', () => {
    const store = createMemoryStore();
    const current = makeResult([['title', 'PASS']]);
    checkForRegressions(current, store);
    const history = getHistory(URL, store);
    assert.ok(history);
    assert.equal(history!.snapshots.length, 1);
  });
});

// ── Regression detection ─────────────────────────────────────────────────────

describe('checkForRegressions — regression', () => {
  it('detects PASS→FAIL regression', () => {
    const store = createMemoryStore();
    const baseline = makeResult([['title', 'PASS'], ['schema', 'PASS']]);
    checkForRegressions(baseline, store);

    const current = makeResult([['title', 'FAIL'], ['schema', 'PASS']]);
    const result = checkForRegressions(current, store);

    assert.equal(result.has_regression, true);
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].signal, 'title');
    assert.equal(result.alerts[0].was, 'PASS');
    assert.equal(result.alerts[0].now, 'FAIL');
  });

  it('detects multiple regressions', () => {
    const store = createMemoryStore();
    const baseline = makeResult([['title', 'PASS'], ['schema', 'PASS'], ['h1', 'PASS']]);
    checkForRegressions(baseline, store);

    const current = makeResult([['title', 'FAIL'], ['schema', 'FAIL'], ['h1', 'PASS']]);
    const result = checkForRegressions(current, store);

    assert.equal(result.alerts.length, 2);
    const regressed = result.alerts.map((a) => a.signal);
    assert.ok(regressed.includes('title'));
    assert.ok(regressed.includes('schema'));
  });

  it('alert includes descriptive message', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'PASS']]), store);

    const current = makeResult([['title', 'FAIL']]);
    const result = checkForRegressions(current, store);

    assert.ok(result.alerts[0].message.includes('title'));
    assert.ok(result.alerts[0].message.includes('regressed'));
  });
});

// ── No regression ────────────────────────────────────────────────────────────

describe('checkForRegressions — no regression', () => {
  it('no alerts when signals stay PASS', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'PASS']]), store);

    const result = checkForRegressions(makeResult([['title', 'PASS']]), store);
    assert.equal(result.has_regression, false);
    assert.equal(result.alerts.length, 0);
  });

  it('FAIL→PASS is NOT a regression (improvement)', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'FAIL']]), store);

    const result = checkForRegressions(makeResult([['title', 'PASS']]), store);
    assert.equal(result.has_regression, false);
  });

  it('FAIL→FAIL is NOT a regression (unchanged)', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['schema', 'FAIL']]), store);

    const result = checkForRegressions(makeResult([['schema', 'FAIL']]), store);
    assert.equal(result.has_regression, false);
  });
});

// ── Streak tracking ──────────────────────────────────────────────────────────

describe('checkForRegressions — streak', () => {
  it('increments streak on consecutive regressions', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'PASS']]), store);

    const r1 = checkForRegressions(makeResult([['title', 'FAIL']]), store);
    assert.equal(r1.streak, 1);

    // Now baseline is FAIL, so FAIL→FAIL is not a regression, streak resets
    const r2 = checkForRegressions(makeResult([['title', 'FAIL']]), store);
    assert.equal(r2.streak, 0);
  });

  it('resets streak on clear check', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'PASS']]), store);
    checkForRegressions(makeResult([['title', 'FAIL']]), store); // streak=1

    const result = checkForRegressions(makeResult([['title', 'FAIL']]), store);
    assert.equal(result.streak, 0); // FAIL→FAIL is not regression
  });
});

// ── hasActiveRegressions ─────────────────────────────────────────────────────

describe('hasActiveRegressions', () => {
  it('returns false for unknown URL', () => {
    const store = createMemoryStore();
    assert.equal(hasActiveRegressions('https://unknown.com', store), false);
  });

  it('returns true after regression detected', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'PASS']]), store);
    checkForRegressions(makeResult([['title', 'FAIL']]), store);

    assert.equal(hasActiveRegressions(URL, store), true);
  });

  it('returns false after regression clears', () => {
    const store = createMemoryStore();
    checkForRegressions(makeResult([['title', 'PASS']]), store);
    checkForRegressions(makeResult([['title', 'FAIL']]), store);
    checkForRegressions(makeResult([['title', 'FAIL']]), store); // FAIL→FAIL is not regression

    assert.equal(hasActiveRegressions(URL, store), false);
  });
});

// ── History management ───────────────────────────────────────────────────────

describe('history management', () => {
  it('limits snapshots to 50', () => {
    const store = createMemoryStore();
    for (let i = 0; i < 60; i++) {
      checkForRegressions(makeResult([['title', 'PASS']]), store);
    }
    const history = getHistory(URL, store);
    assert.ok(history);
    assert.ok(history!.snapshots.length <= 50);
  });

  it('getHistory returns null for unknown URL', () => {
    const store = createMemoryStore();
    assert.equal(getHistory('https://unknown.com', store), null);
  });
});
