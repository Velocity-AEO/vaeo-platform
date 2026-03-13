/**
 * tools/heavyweight/sandbox_orchestrator.ts
 *
 * Orchestrates a full heavyweight sandbox run: simulate production
 * conditions, apply fixes, run regression guard, and produce a
 * HeavyweightRun result with recommendation.
 *
 * Never throws.
 */

import {
  simulateProductionConditions,
  defaultSimulatorConfig,
  type ProductionSimulatorConfig,
  type ProductionSimulationResult,
} from './production_simulator.js';
import {
  runRegressionCheck,
  estimateScoreImpact,
  defaultBaseScores,
  type LighthouseScore as RegressionLighthouseScore,
  type RegressionCheckResult,
} from './regression_guard.js';
import type { HeavyweightRun } from './case_study_generator.js';
import type { LighthouseScore } from './fix_validator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  site_id:            string;
  url:                string;
  html:               string;
  detected_app_ids:   string[];
  fix_types_applied:  string[];
  score_before:       LighthouseScore;
  simulator_config?:  Partial<ProductionSimulatorConfig>;
}

export interface OrchestratorResult {
  run:                  HeavyweightRun;
  simulation:           ProductionSimulationResult;
  regression:           RegressionCheckResult;
  simulated_html:       string;
  recommendation:       string;
  safe_to_deploy:       boolean;
  capture_timed_out:    boolean;
  timed_out_viewports:  number[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toRegressionScores(score: LighthouseScore): RegressionLighthouseScore {
  return {
    performance:    score.performance,
    accessibility:  score.accessibility,
    best_practices: score.best_practices,
    seo:            score.seo,
  };
}

function generateRunId(): string {
  return `hw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function orchestrateHeavyweightRun(input: OrchestratorInput): OrchestratorResult {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    // 1. Build simulator config
    const simConfig: ProductionSimulatorConfig = {
      ...defaultSimulatorConfig(input.detected_app_ids),
      ...input.simulator_config,
    };

    // 2. Simulate production conditions
    const simulation = simulateProductionConditions(input.html, simConfig);

    // 3. Estimate score impact
    const scoresBefore = toRegressionScores(input.score_before);
    const scoresAfter = estimateScoreImpact(scoresBefore, simulation.simulated_cost);

    // 4. Run regression guard
    const regression = runRegressionCheck(
      scoresBefore,
      scoresAfter,
      simulation.budget_status,
    );

    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    // 5. Build score_after with lcp_ms and cls estimates
    const lcpPenalty = simulation.simulated_cost.lcp_contributors.length * 200;
    const clsPenalty = simulation.simulated_cost.cls_contributors.length * 0.02;
    const scoreAfter: LighthouseScore = {
      performance:    scoresAfter.performance,
      seo:            scoresAfter.seo,
      accessibility:  scoresAfter.accessibility,
      best_practices: scoresAfter.best_practices,
      lcp_ms:         input.score_before.lcp_ms + lcpPenalty,
      cls:            input.score_before.cls + clsPenalty,
    };

    // 6. Build comparison
    const comparison = {
      performance_delta: scoreAfter.performance - input.score_before.performance,
      seo_delta:         scoreAfter.seo - input.score_before.seo,
      lcp_delta_ms:      input.score_before.lcp_ms - scoreAfter.lcp_ms,
      cls_delta:         input.score_before.cls - scoreAfter.cls,
      grade_before:      gradeFromScore(input.score_before.performance),
      grade_after:       gradeFromScore(scoreAfter.performance),
    };

    // 7. Build HeavyweightRun
    const run: HeavyweightRun = {
      run_id:            generateRunId(),
      site_id:           input.site_id,
      url:               input.url,
      status:            'complete',
      score_before:      input.score_before,
      score_after:       scoreAfter,
      detected_apps:     simulation.detected_apps,
      fix_types_applied: input.fix_types_applied,
      comparison,
      simulation_result: simulation,
      regression_check:  regression,
      recommendation:    regression.recommendation,
      duration_ms:       durationMs,
      started_at:        startedAt,
      completed_at:      completedAt,
    };

    return {
      run,
      simulation,
      regression,
      simulated_html:      simulation.html,
      recommendation:      regression.recommendation,
      safe_to_deploy:      regression.passed,
      capture_timed_out:   false,
      timed_out_viewports: [],
    };
  } catch {
    const durationMs = Date.now() - startMs;
    const emptySim = simulateProductionConditions('', defaultSimulatorConfig([]));
    const emptyScores = defaultBaseScores();
    const emptyRegression = runRegressionCheck(emptyScores, emptyScores, emptySim.budget_status);

    const run: HeavyweightRun = {
      run_id:            generateRunId(),
      site_id:           input.site_id,
      url:               input.url,
      status:            'failed',
      score_before:      input.score_before,
      detected_apps:     [],
      fix_types_applied: input.fix_types_applied,
      recommendation:    'BLOCK: Orchestrator failed.',
      duration_ms:       durationMs,
      started_at:        startedAt,
      completed_at:      new Date().toISOString(),
    };

    return {
      run,
      simulation:          emptySim,
      regression:          emptyRegression,
      simulated_html:      input.html,
      recommendation:      'BLOCK: Orchestrator failed.',
      safe_to_deploy:      false,
      capture_timed_out:   false,
      timed_out_viewports: [],
    };
  }
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}
