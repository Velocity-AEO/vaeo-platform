/**
 * tools/heavyweight/regression_guard.ts
 *
 * Checks whether simulated production conditions cause performance
 * regressions beyond acceptable thresholds. Compares before/after
 * Lighthouse-style scores and flags violations.
 *
 * Never throws.
 */

import type { SimulatedCost } from './script_stub_library.js';
import type { BudgetStatus } from './production_simulator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LighthouseScore {
  performance:    number;  // 0–100
  accessibility:  number;  // 0–100
  best_practices: number;  // 0–100
  seo:            number;  // 0–100
}

export interface RegressionRule {
  rule_id:      string;
  metric:       string;
  threshold:    number;
  description:  string;
}

export interface RegressionViolation {
  rule_id:      string;
  metric:       string;
  before:       number;
  after:        number;
  delta:        number;
  threshold:    number;
  description:  string;
  severity:     'critical' | 'warning';
}

export interface RegressionCheckResult {
  passed:           boolean;
  violations:       RegressionViolation[];
  rules_checked:    number;
  scores_before:    LighthouseScore;
  scores_after:     LighthouseScore;
  budget_status:    BudgetStatus;
  recommendation:   string;
}

// ── Default rules ────────────────────────────────────────────────────────────

export const DEFAULT_REGRESSION_RULES: RegressionRule[] = [
  {
    rule_id:     'perf_drop_critical',
    metric:      'performance',
    threshold:   15,
    description: 'Performance score dropped by more than 15 points',
  },
  {
    rule_id:     'perf_drop_warning',
    metric:      'performance',
    threshold:   5,
    description: 'Performance score dropped by more than 5 points',
  },
  {
    rule_id:     'seo_drop_critical',
    metric:      'seo',
    threshold:   10,
    description: 'SEO score dropped by more than 10 points',
  },
  {
    rule_id:     'seo_drop_warning',
    metric:      'seo',
    threshold:   3,
    description: 'SEO score dropped by more than 3 points',
  },
  {
    rule_id:     'a11y_drop_critical',
    metric:      'accessibility',
    threshold:   10,
    description: 'Accessibility score dropped by more than 10 points',
  },
  {
    rule_id:     'bp_drop_warning',
    metric:      'best_practices',
    threshold:   10,
    description: 'Best practices score dropped by more than 10 points',
  },
];

// ── Score helpers ────────────────────────────────────────────────────────────

export function estimateScoreImpact(
  baseScores: LighthouseScore,
  cost: SimulatedCost,
): LighthouseScore {
  try {
    // Estimate performance impact: ~1 point per 200ms load, ~1 per 150ms main thread
    const loadPenalty = Math.floor(cost.total_load_ms / 200);
    const threadPenalty = Math.floor(cost.total_main_thread_ms / 150);
    const perfDrop = Math.min(loadPenalty + threadPenalty, 50);

    // CLS contributors reduce accessibility slightly
    const clsPenalty = cost.cls_contributors.length * 2;

    // LCP contributors reduce performance further
    const lcpPenalty = cost.lcp_contributors.length * 3;

    return {
      performance:    Math.max(0, baseScores.performance - perfDrop - lcpPenalty),
      accessibility:  Math.max(0, baseScores.accessibility - clsPenalty),
      best_practices: Math.max(0, baseScores.best_practices - Math.floor(cost.total_network_requests / 10)),
      seo:            baseScores.seo, // SEO not directly affected by load
    };
  } catch {
    return baseScores;
  }
}

export function defaultBaseScores(): LighthouseScore {
  return {
    performance:    90,
    accessibility:  95,
    best_practices: 90,
    seo:            92,
  };
}

// ── Regression checker ───────────────────────────────────────────────────────

export function runRegressionCheck(
  scoresBefore: LighthouseScore,
  scoresAfter: LighthouseScore,
  budgetStatus: BudgetStatus,
  rules?: RegressionRule[],
): RegressionCheckResult {
  try {
    const activeRules = rules ?? DEFAULT_REGRESSION_RULES;
    const violations: RegressionViolation[] = [];

    for (const rule of activeRules) {
      const before = getMetricValue(scoresBefore, rule.metric);
      const after = getMetricValue(scoresAfter, rule.metric);
      const delta = before - after;

      if (delta > rule.threshold) {
        violations.push({
          rule_id:     rule.rule_id,
          metric:      rule.metric,
          before,
          after,
          delta,
          threshold:   rule.threshold,
          description: rule.description,
          severity:    rule.rule_id.includes('critical') ? 'critical' : 'warning',
        });
      }
    }

    // Budget violations count as critical
    if (!budgetStatus.all_budgets_ok) {
      if (!budgetStatus.load_ms_ok) {
        violations.push({
          rule_id:     'budget_load_ms',
          metric:      'load_ms',
          before:      0,
          after:       -budgetStatus.load_ms_remaining,
          delta:       -budgetStatus.load_ms_remaining,
          threshold:   0,
          description: 'Load time budget exceeded',
          severity:    'critical',
        });
      }
      if (!budgetStatus.main_thread_ms_ok) {
        violations.push({
          rule_id:     'budget_main_thread_ms',
          metric:      'main_thread_ms',
          before:      0,
          after:       -budgetStatus.main_thread_ms_remaining,
          delta:       -budgetStatus.main_thread_ms_remaining,
          threshold:   0,
          description: 'Main thread budget exceeded',
          severity:    'critical',
        });
      }
      if (!budgetStatus.network_requests_ok) {
        violations.push({
          rule_id:     'budget_network_requests',
          metric:      'network_requests',
          before:      0,
          after:       -budgetStatus.network_requests_remaining,
          delta:       -budgetStatus.network_requests_remaining,
          threshold:   0,
          description: 'Network requests budget exceeded',
          severity:    'warning',
        });
      }
    }

    const hasCritical = violations.some((v) => v.severity === 'critical');
    const hasWarning = violations.some((v) => v.severity === 'warning');

    let recommendation: string;
    if (hasCritical) {
      recommendation = 'BLOCK: Critical regression detected. Fix must be re-evaluated under lighter conditions.';
    } else if (hasWarning) {
      recommendation = 'WARN: Minor regressions detected. Fix may proceed with monitoring.';
    } else {
      recommendation = 'PASS: No regressions detected. Fix is safe under production conditions.';
    }

    return {
      passed:        violations.length === 0,
      violations,
      rules_checked: activeRules.length,
      scores_before: scoresBefore,
      scores_after:  scoresAfter,
      budget_status: budgetStatus,
      recommendation,
    };
  } catch {
    return {
      passed:        false,
      violations:    [{
        rule_id:     'error',
        metric:      'unknown',
        before:      0,
        after:       0,
        delta:       0,
        threshold:   0,
        description: 'Regression check failed with error',
        severity:    'critical',
      }],
      rules_checked: 0,
      scores_before: scoresBefore,
      scores_after:  scoresAfter,
      budget_status: budgetStatus,
      recommendation: 'BLOCK: Regression check failed.',
    };
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function getMetricValue(scores: LighthouseScore, metric: string): number {
  switch (metric) {
    case 'performance':    return scores.performance;
    case 'accessibility':  return scores.accessibility;
    case 'best_practices': return scores.best_practices;
    case 'seo':            return scores.seo;
    default:               return 0;
  }
}
