/**
 * tools/heavyweight/sandbox_orchestrator.test.ts
 *
 * Tests for sandbox orchestrator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  orchestrateHeavyweightRun,
  type OrchestratorInput,
} from './sandbox_orchestrator.js';
import type { LighthouseScore } from './fix_validator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_HTML = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';

function baseScore(): LighthouseScore {
  return { performance: 85, seo: 90, accessibility: 92, best_practices: 88, lcp_ms: 2500, cls: 0.05 };
}

function input(overrides?: Partial<OrchestratorInput>): OrchestratorInput {
  return {
    site_id: 'site_1',
    url: 'https://example.com',
    html: BASE_HTML,
    detected_app_ids: ['intercom'],
    fix_types_applied: ['title_missing'],
    score_before: baseScore(),
    ...overrides,
  };
}

// ── Basic orchestration ─────────────────────────────────────────────────────

describe('orchestrateHeavyweightRun — basic', () => {
  it('returns complete status', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.equal(result.run.status, 'complete');
  });

  it('generates a run_id starting with hw_', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.run_id.startsWith('hw_'));
  });

  it('includes site_id and url', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.equal(result.run.site_id, 'site_1');
    assert.equal(result.run.url, 'https://example.com');
  });

  it('includes fix_types_applied', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.deepEqual(result.run.fix_types_applied, ['title_missing']);
  });

  it('includes detected_apps from simulation', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.detected_apps.includes('Intercom'));
  });

  it('sets timestamps', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.started_at);
    assert.ok(result.run.completed_at);
  });
});

// ── Simulation wiring ───────────────────────────────────────────────────────

describe('orchestrateHeavyweightRun — simulation', () => {
  it('injects stubs into HTML', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.simulated_html.includes('__vaeo_stub_intercom'));
  });

  it('includes simulation_result on run', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.simulation_result);
    assert.equal(result.run.simulation_result!.stubs_injected, 1);
  });

  it('tracks simulated cost', () => {
    const result = orchestrateHeavyweightRun(input({ detected_app_ids: ['intercom', 'hotjar'] }));
    assert.equal(result.simulation.simulated_cost.total_load_ms, 800 + 600);
  });
});

// ── Regression wiring ───────────────────────────────────────────────────────

describe('orchestrateHeavyweightRun — regression', () => {
  it('includes regression_check on run', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.regression_check);
    assert.ok(result.run.regression_check!.rules_checked > 0);
  });

  it('passes regression with light load', () => {
    const result = orchestrateHeavyweightRun(input({ detected_app_ids: ['instafeed'] }));
    assert.equal(result.regression.passed, true);
    assert.equal(result.safe_to_deploy, true);
  });

  it('includes recommendation on run', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.recommendation);
    assert.equal(result.run.recommendation, result.recommendation);
  });
});

// ── Score comparison ────────────────────────────────────────────────────────

describe('orchestrateHeavyweightRun — scores', () => {
  it('builds score_after with estimated impact', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.score_after);
    assert.ok(result.run.score_after!.performance <= result.run.score_before.performance);
  });

  it('builds comparison with deltas', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.comparison);
    assert.ok(typeof result.run.comparison!.performance_delta === 'number');
    assert.ok(typeof result.run.comparison!.seo_delta === 'number');
  });

  it('includes grade_before and grade_after', () => {
    const result = orchestrateHeavyweightRun(input());
    assert.ok(result.run.comparison!.grade_before);
    assert.ok(result.run.comparison!.grade_after);
  });
});

// ── Budget configuration ────────────────────────────────────────────────────

describe('orchestrateHeavyweightRun — config overrides', () => {
  it('accepts custom budget via simulator_config', () => {
    const result = orchestrateHeavyweightRun(input({
      detected_app_ids: ['intercom', 'hotjar', 'lucky_orange', 'tidio', 'privy'],
      simulator_config: { budget_load_ms: 500 },
    }));
    assert.equal(result.simulation.budget_status.load_ms_ok, false);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('orchestrateHeavyweightRun — edge cases', () => {
  it('handles empty HTML', () => {
    const result = orchestrateHeavyweightRun(input({ html: '' }));
    assert.equal(result.run.status, 'complete');
    assert.equal(result.simulation.stubs_injected, 0);
  });

  it('handles empty app_ids', () => {
    const result = orchestrateHeavyweightRun(input({ detected_app_ids: [] }));
    assert.equal(result.simulation.stubs_injected, 0);
    assert.deepEqual(result.run.detected_apps, []);
  });

  it('handles unknown app_ids gracefully', () => {
    const result = orchestrateHeavyweightRun(input({ detected_app_ids: ['unknown'] }));
    assert.equal(result.simulation.stubs_injected, 0);
  });
});
