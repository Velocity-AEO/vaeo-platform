/**
 * tools/heavyweight/production_simulator.ts
 *
 * Simulates production-like conditions by combining original HTML
 * with heavyweight script stubs and measuring estimated performance
 * impact. Used to validate that SEO fixes hold under real-world load.
 *
 * Never throws.
 */

import {
  getStubsForDetectedApps,
  calculateTotalSimulatedCost,
  type ScriptStub,
  type SimulatedCost,
} from './script_stub_library.js';
import {
  injectStubs,
  defaultInjectionConfig,
  type StubInjectionConfig,
  type StubInjectionResult,
} from './stub_injector.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductionSimulatorConfig {
  detected_app_ids:     string[];
  inject_position:      'head_end' | 'body_start' | 'body_end';
  add_timing_markers:   boolean;
  budget_load_ms:       number;
  budget_main_thread_ms: number;
  budget_network_requests: number;
}

export interface BudgetStatus {
  load_ms_ok:             boolean;
  main_thread_ms_ok:      boolean;
  network_requests_ok:    boolean;
  load_ms_remaining:      number;
  main_thread_ms_remaining: number;
  network_requests_remaining: number;
  all_budgets_ok:         boolean;
}

export interface ProductionSimulationResult {
  html:                 string;
  original_length:      number;
  simulated_length:     number;
  stubs_injected:       number;
  injection_point:      string;
  simulated_cost:       SimulatedCost;
  budget_status:        BudgetStatus;
  detected_apps:        string[];
  sentinel_present:     boolean;
  already_simulated:    boolean;
}

// ── Default config ───────────────────────────────────────────────────────────

export function defaultSimulatorConfig(app_ids: string[]): ProductionSimulatorConfig {
  return {
    detected_app_ids:       app_ids,
    inject_position:        'head_end',
    add_timing_markers:     true,
    budget_load_ms:         3000,
    budget_main_thread_ms:  2000,
    budget_network_requests: 50,
  };
}

// ── Budget checker ───────────────────────────────────────────────────────────

export function checkBudget(
  cost: SimulatedCost,
  config: ProductionSimulatorConfig,
): BudgetStatus {
  const load_ms_remaining = config.budget_load_ms - cost.total_load_ms;
  const main_thread_ms_remaining = config.budget_main_thread_ms - cost.total_main_thread_ms;
  const network_requests_remaining = config.budget_network_requests - cost.total_network_requests;

  const load_ms_ok = load_ms_remaining >= 0;
  const main_thread_ms_ok = main_thread_ms_remaining >= 0;
  const network_requests_ok = network_requests_remaining >= 0;

  return {
    load_ms_ok,
    main_thread_ms_ok,
    network_requests_ok,
    load_ms_remaining,
    main_thread_ms_remaining,
    network_requests_remaining,
    all_budgets_ok: load_ms_ok && main_thread_ms_ok && network_requests_ok,
  };
}

// ── Simulator ────────────────────────────────────────────────────────────────

export function simulateProductionConditions(
  html: string,
  config: ProductionSimulatorConfig,
): ProductionSimulationResult {
  try {
    if (!html) {
      const emptyCost = calculateTotalSimulatedCost([]);
      return {
        html:               '',
        original_length:    0,
        simulated_length:   0,
        stubs_injected:     0,
        injection_point:    'none',
        simulated_cost:     emptyCost,
        budget_status:      checkBudget(emptyCost, config),
        detected_apps:      [],
        sentinel_present:   false,
        already_simulated:  false,
      };
    }

    const stubs = getStubsForDetectedApps(config.detected_app_ids);
    const cost = calculateTotalSimulatedCost(stubs);
    const budgetStatus = checkBudget(cost, config);

    const injectionConfig: StubInjectionConfig = {
      ...defaultInjectionConfig(stubs),
      inject_position:    config.inject_position,
      add_timing_markers: config.add_timing_markers,
    };

    const injectionResult = injectStubs(html, injectionConfig);

    return {
      html:               injectionResult.html,
      original_length:    html.length,
      simulated_length:   injectionResult.html.length,
      stubs_injected:     injectionResult.stubs_injected,
      injection_point:    injectionResult.injection_point,
      simulated_cost:     cost,
      budget_status:      budgetStatus,
      detected_apps:      stubs.map((s) => s.app_name),
      sentinel_present:   injectionResult.sentinel_present,
      already_simulated:  injectionResult.already_injected,
    };
  } catch {
    const emptyCost = calculateTotalSimulatedCost([]);
    return {
      html,
      original_length:    html.length,
      simulated_length:   html.length,
      stubs_injected:     0,
      injection_point:    'error',
      simulated_cost:     emptyCost,
      budget_status:      checkBudget(emptyCost, config),
      detected_apps:      [],
      sentinel_present:   false,
      already_simulated:  false,
    };
  }
}
