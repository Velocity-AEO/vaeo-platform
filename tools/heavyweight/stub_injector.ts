/**
 * tools/heavyweight/stub_injector.ts
 *
 * Injects script stub tags into HTML at configurable positions.
 * Idempotent via sentinel comment. Never throws.
 */

import {
  calculateTotalSimulatedCost,
  type ScriptStub,
  type SimulatedCost,
} from './script_stub_library.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StubInjectionConfig {
  stubs:               ScriptStub[];
  inject_position:     'head_end' | 'body_start' | 'body_end';
  add_timing_markers:  boolean;
  sentinel:            string;
}

export interface StubInjectionResult {
  html:              string;
  stubs_injected:    number;
  injection_point:   string;
  sentinel_present:  boolean;
  simulated_cost:    SimulatedCost;
  already_injected:  boolean;
}

// ── Default config ───────────────────────────────────────────────────────────

export function defaultInjectionConfig(stubs: ScriptStub[]): StubInjectionConfig {
  return {
    stubs,
    inject_position:    'head_end',
    add_timing_markers: true,
    sentinel:           '<!-- vaeo-stubs-injected -->',
  };
}

// ── Injector ─────────────────────────────────────────────────────────────────

export function injectStubs(
  html: string,
  config: StubInjectionConfig,
): StubInjectionResult {
  const cost = calculateTotalSimulatedCost(config.stubs);

  try {
    if (!html) {
      return {
        html:             '',
        stubs_injected:   0,
        injection_point:  'none',
        sentinel_present: false,
        simulated_cost:   cost,
        already_injected: false,
      };
    }

    // Idempotency check
    if (html.includes(config.sentinel)) {
      return {
        html,
        stubs_injected:   0,
        injection_point:  'already_present',
        sentinel_present: true,
        simulated_cost:   cost,
        already_injected: true,
      };
    }

    if (config.stubs.length === 0) {
      return {
        html,
        stubs_injected:   0,
        injection_point:  'none',
        sentinel_present: false,
        simulated_cost:   cost,
        already_injected: false,
      };
    }

    // Build injection block
    const parts: string[] = [];

    if (config.add_timing_markers) {
      parts.push(
        `<!-- vaeo-stubs: ${config.stubs.length} stubs, estimated ${cost.total_load_ms}ms load cost -->`,
      );
    }

    for (const stub of config.stubs) {
      parts.push(`<script>/* VAEO stub: ${stub.app_name} */${stub.stub_js}</script>`);
    }

    parts.push(config.sentinel);

    const block = '\n' + parts.join('\n') + '\n';

    // Find injection point
    let result: string;
    let injectionPoint: string;

    if (config.inject_position === 'head_end') {
      const idx = html.toLowerCase().indexOf('</head>');
      if (idx !== -1) {
        result = html.slice(0, idx) + block + html.slice(idx);
        injectionPoint = 'before_</head>';
      } else {
        result = html + block;
        injectionPoint = 'append_fallback';
      }
    } else if (config.inject_position === 'body_start') {
      const match = html.match(/<body\b[^>]*>/i);
      if (match) {
        const idx = html.indexOf(match[0]) + match[0].length;
        result = html.slice(0, idx) + block + html.slice(idx);
        injectionPoint = 'after_<body>';
      } else {
        result = html + block;
        injectionPoint = 'append_fallback';
      }
    } else {
      // body_end
      const idx = html.toLowerCase().indexOf('</body>');
      if (idx !== -1) {
        result = html.slice(0, idx) + block + html.slice(idx);
        injectionPoint = 'before_</body>';
      } else {
        result = html + block;
        injectionPoint = 'append_fallback';
      }
    }

    return {
      html:             result,
      stubs_injected:   config.stubs.length,
      injection_point:  injectionPoint,
      sentinel_present: true,
      simulated_cost:   cost,
      already_injected: false,
    };
  } catch {
    return {
      html,
      stubs_injected:   0,
      injection_point:  'error',
      sentinel_present: false,
      simulated_cost:   cost,
      already_injected: false,
    };
  }
}
