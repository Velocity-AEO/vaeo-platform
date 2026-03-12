/**
 * tools/heavyweight/regression_guard.test.ts
 *
 * Tests for regression guard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runRegressionCheck,
  estimateScoreImpact,
  defaultBaseScores,
  DEFAULT_REGRESSION_RULES,
  type LighthouseScore,
  type RegressionRule,
} from './regression_guard.js';
import { calculateTotalSimulatedCost, getStubsForDetectedApps } from './script_stub_library.js';
import { checkBudget, defaultSimulatorConfig } from './production_simulator.js';
import type { BudgetStatus } from './production_simulator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function okBudget(): BudgetStatus {
  return {
    load_ms_ok: true,
    main_thread_ms_ok: true,
    network_requests_ok: true,
    load_ms_remaining: 2000,
    main_thread_ms_remaining: 1500,
    network_requests_remaining: 40,
    all_budgets_ok: true,
  };
}

function failedBudget(): BudgetStatus {
  return {
    load_ms_ok: false,
    main_thread_ms_ok: false,
    network_requests_ok: false,
    load_ms_remaining: -500,
    main_thread_ms_remaining: -300,
    network_requests_remaining: -10,
    all_budgets_ok: false,
  };
}

// ── DEFAULT_REGRESSION_RULES ────────────────────────────────────────────────

describe('DEFAULT_REGRESSION_RULES', () => {
  it('has at least 6 rules', () => {
    assert.ok(DEFAULT_REGRESSION_RULES.length >= 6);
  });

  it('includes performance, seo, accessibility, and best_practices metrics', () => {
    const metrics = new Set(DEFAULT_REGRESSION_RULES.map((r) => r.metric));
    assert.ok(metrics.has('performance'));
    assert.ok(metrics.has('seo'));
    assert.ok(metrics.has('accessibility'));
    assert.ok(metrics.has('best_practices'));
  });

  it('all rules have unique rule_id', () => {
    const ids = DEFAULT_REGRESSION_RULES.map((r) => r.rule_id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ── runRegressionCheck — passing ─────────────────────────────────────────────

describe('runRegressionCheck — passing', () => {
  it('passes when no regressions', () => {
    const before: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 92 };
    const after: LighthouseScore = { performance: 89, accessibility: 95, best_practices: 90, seo: 92 };
    const result = runRegressionCheck(before, after, okBudget());
    assert.equal(result.passed, true);
    assert.equal(result.violations.length, 0);
  });

  it('includes PASS recommendation', () => {
    const scores = defaultBaseScores();
    const result = runRegressionCheck(scores, scores, okBudget());
    assert.ok(result.recommendation.startsWith('PASS'));
  });

  it('reports rules_checked count', () => {
    const scores = defaultBaseScores();
    const result = runRegressionCheck(scores, scores, okBudget());
    assert.equal(result.rules_checked, DEFAULT_REGRESSION_RULES.length);
  });
});

// ── runRegressionCheck — violations ──────────────────────────────────────────

describe('runRegressionCheck — violations', () => {
  it('detects critical performance drop', () => {
    const before: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 92 };
    const after: LighthouseScore = { performance: 70, accessibility: 95, best_practices: 90, seo: 92 };
    const result = runRegressionCheck(before, after, okBudget());
    assert.equal(result.passed, false);
    const perfViolation = result.violations.find((v) => v.rule_id === 'perf_drop_critical');
    assert.ok(perfViolation);
    assert.equal(perfViolation.severity, 'critical');
    assert.equal(perfViolation.delta, 20);
  });

  it('detects SEO score drop', () => {
    const before: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 92 };
    const after: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 78 };
    const result = runRegressionCheck(before, after, okBudget());
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.metric === 'seo'));
  });

  it('includes BLOCK recommendation for critical violations', () => {
    const before: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 92 };
    const after: LighthouseScore = { performance: 50, accessibility: 95, best_practices: 90, seo: 92 };
    const result = runRegressionCheck(before, after, okBudget());
    assert.ok(result.recommendation.startsWith('BLOCK'));
  });

  it('includes WARN recommendation for warning-only violations', () => {
    const before: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 92 };
    const after: LighthouseScore = { performance: 83, accessibility: 95, best_practices: 90, seo: 92 };
    const result = runRegressionCheck(before, after, okBudget());
    assert.ok(result.recommendation.startsWith('WARN'));
  });
});

// ── runRegressionCheck — budget violations ───────────────────────────────────

describe('runRegressionCheck — budget violations', () => {
  it('adds budget violation when load_ms exceeded', () => {
    const scores = defaultBaseScores();
    const budget = { ...okBudget(), load_ms_ok: false, load_ms_remaining: -200, all_budgets_ok: false };
    const result = runRegressionCheck(scores, scores, budget);
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.rule_id === 'budget_load_ms'));
  });

  it('adds all budget violations when all budgets blown', () => {
    const scores = defaultBaseScores();
    const result = runRegressionCheck(scores, scores, failedBudget());
    assert.ok(result.violations.some((v) => v.rule_id === 'budget_load_ms'));
    assert.ok(result.violations.some((v) => v.rule_id === 'budget_main_thread_ms'));
    assert.ok(result.violations.some((v) => v.rule_id === 'budget_network_requests'));
  });
});

// ── runRegressionCheck — custom rules ────────────────────────────────────────

describe('runRegressionCheck — custom rules', () => {
  it('supports custom rule set', () => {
    const customRules: RegressionRule[] = [
      { rule_id: 'custom_perf', metric: 'performance', threshold: 1, description: 'Any perf drop' },
    ];
    const before: LighthouseScore = { performance: 90, accessibility: 95, best_practices: 90, seo: 92 };
    const after: LighthouseScore = { performance: 88, accessibility: 95, best_practices: 90, seo: 92 };
    const result = runRegressionCheck(before, after, okBudget(), customRules);
    assert.equal(result.rules_checked, 1);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].rule_id, 'custom_perf');
  });
});

// ── estimateScoreImpact ──────────────────────────────────────────────────────

describe('estimateScoreImpact', () => {
  it('reduces performance score based on load cost', () => {
    const base = defaultBaseScores();
    const cost = calculateTotalSimulatedCost(getStubsForDetectedApps(['intercom', 'hotjar', 'lucky_orange']));
    const after = estimateScoreImpact(base, cost);
    assert.ok(after.performance < base.performance);
  });

  it('reduces accessibility when CLS contributors present', () => {
    const base = defaultBaseScores();
    const cost = calculateTotalSimulatedCost(getStubsForDetectedApps(['intercom', 'privy']));
    const after = estimateScoreImpact(base, cost);
    assert.ok(after.accessibility < base.accessibility);
  });

  it('keeps seo unchanged', () => {
    const base = defaultBaseScores();
    const cost = calculateTotalSimulatedCost(getStubsForDetectedApps(['intercom']));
    const after = estimateScoreImpact(base, cost);
    assert.equal(after.seo, base.seo);
  });

  it('never returns negative scores', () => {
    const base: LighthouseScore = { performance: 5, accessibility: 5, best_practices: 5, seo: 5 };
    const cost = calculateTotalSimulatedCost(getStubsForDetectedApps([
      'intercom', 'hotjar', 'lucky_orange', 'tidio', 'privy',
    ]));
    const after = estimateScoreImpact(base, cost);
    assert.ok(after.performance >= 0);
    assert.ok(after.accessibility >= 0);
    assert.ok(after.best_practices >= 0);
  });
});

// ── defaultBaseScores ────────────────────────────────────────────────────────

describe('defaultBaseScores', () => {
  it('returns scores in 0-100 range', () => {
    const s = defaultBaseScores();
    for (const val of [s.performance, s.accessibility, s.best_practices, s.seo]) {
      assert.ok(val >= 0 && val <= 100);
    }
  });
});
