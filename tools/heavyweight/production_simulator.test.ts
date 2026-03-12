/**
 * tools/heavyweight/production_simulator.test.ts
 *
 * Tests for production condition simulator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateProductionConditions,
  defaultSimulatorConfig,
  checkBudget,
  type ProductionSimulatorConfig,
} from './production_simulator.js';
import { calculateTotalSimulatedCost, getStubsForDetectedApps } from './script_stub_library.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_HTML = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';

function cfg(ids: string[], overrides?: Partial<ProductionSimulatorConfig>): ProductionSimulatorConfig {
  return { ...defaultSimulatorConfig(ids), ...overrides };
}

// ── Basic simulation ────────────────────────────────────────────────────────

describe('simulateProductionConditions — basic', () => {
  it('injects stubs into HTML', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['intercom']));
    assert.ok(result.html.includes('__vaeo_stub_intercom'));
    assert.equal(result.stubs_injected, 1);
  });

  it('reports detected app names', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['intercom', 'hotjar']));
    assert.deepEqual(result.detected_apps, ['Intercom', 'Hotjar']);
  });

  it('tracks original and simulated lengths', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['intercom']));
    assert.equal(result.original_length, BASE_HTML.length);
    assert.ok(result.simulated_length > result.original_length);
  });

  it('sets injection_point to before_</head> by default', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['intercom']));
    assert.equal(result.injection_point, 'before_</head>');
  });

  it('sets sentinel_present after injection', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['intercom']));
    assert.equal(result.sentinel_present, true);
  });
});

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('simulateProductionConditions — idempotency', () => {
  it('does not double-inject', () => {
    const first = simulateProductionConditions(BASE_HTML, cfg(['intercom']));
    const second = simulateProductionConditions(first.html, cfg(['intercom']));
    assert.equal(second.already_simulated, true);
    assert.equal(second.stubs_injected, 0);
  });
});

// ── Budget checks ───────────────────────────────────────────────────────────

describe('simulateProductionConditions — budget', () => {
  it('passes budget with generous limits', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['intercom']));
    assert.equal(result.budget_status.all_budgets_ok, true);
  });

  it('fails load_ms budget when exceeded', () => {
    const result = simulateProductionConditions(
      BASE_HTML,
      cfg(['intercom'], { budget_load_ms: 100 }),
    );
    assert.equal(result.budget_status.load_ms_ok, false);
    assert.equal(result.budget_status.all_budgets_ok, false);
  });

  it('fails main_thread_ms budget when exceeded', () => {
    const result = simulateProductionConditions(
      BASE_HTML,
      cfg(['intercom'], { budget_main_thread_ms: 100 }),
    );
    assert.equal(result.budget_status.main_thread_ms_ok, false);
  });

  it('fails network_requests budget when exceeded', () => {
    const result = simulateProductionConditions(
      BASE_HTML,
      cfg(['intercom'], { budget_network_requests: 5 }),
    );
    assert.equal(result.budget_status.network_requests_ok, false);
  });

  it('calculates remaining budget correctly', () => {
    const result = simulateProductionConditions(
      BASE_HTML,
      cfg(['intercom'], { budget_load_ms: 1000 }),
    );
    assert.equal(result.budget_status.load_ms_remaining, 1000 - 800);
  });
});

// ── Injection positions ─────────────────────────────────────────────────────

describe('simulateProductionConditions — positions', () => {
  it('supports body_start injection', () => {
    const result = simulateProductionConditions(
      BASE_HTML,
      cfg(['intercom'], { inject_position: 'body_start' }),
    );
    assert.equal(result.injection_point, 'after_<body>');
  });

  it('supports body_end injection', () => {
    const result = simulateProductionConditions(
      BASE_HTML,
      cfg(['intercom'], { inject_position: 'body_end' }),
    );
    assert.equal(result.injection_point, 'before_</body>');
  });
});

// ── checkBudget standalone ──────────────────────────────────────────────────

describe('checkBudget', () => {
  it('returns all_budgets_ok true when within limits', () => {
    const cost = calculateTotalSimulatedCost(getStubsForDetectedApps(['intercom']));
    const status = checkBudget(cost, defaultSimulatorConfig(['intercom']));
    assert.equal(status.all_budgets_ok, true);
  });

  it('returns all false flags when all budgets blown', () => {
    const cost = calculateTotalSimulatedCost(getStubsForDetectedApps(['intercom', 'hotjar', 'lucky_orange']));
    const status = checkBudget(cost, {
      ...defaultSimulatorConfig([]),
      budget_load_ms: 100,
      budget_main_thread_ms: 100,
      budget_network_requests: 5,
    });
    assert.equal(status.load_ms_ok, false);
    assert.equal(status.main_thread_ms_ok, false);
    assert.equal(status.network_requests_ok, false);
    assert.equal(status.all_budgets_ok, false);
  });
});

// ── defaultSimulatorConfig ──────────────────────────────────────────────────

describe('defaultSimulatorConfig', () => {
  it('sets default budget values', () => {
    const c = defaultSimulatorConfig(['intercom']);
    assert.equal(c.budget_load_ms, 3000);
    assert.equal(c.budget_main_thread_ms, 2000);
    assert.equal(c.budget_network_requests, 50);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('simulateProductionConditions — edge cases', () => {
  it('handles empty HTML', () => {
    const result = simulateProductionConditions('', cfg(['intercom']));
    assert.equal(result.html, '');
    assert.equal(result.stubs_injected, 0);
    assert.equal(result.original_length, 0);
  });

  it('handles empty app_ids', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg([]));
    assert.equal(result.stubs_injected, 0);
    assert.equal(result.html, BASE_HTML);
  });

  it('skips unknown app_ids', () => {
    const result = simulateProductionConditions(BASE_HTML, cfg(['unknown_app']));
    assert.equal(result.stubs_injected, 0);
    assert.deepEqual(result.detected_apps, []);
  });
});
