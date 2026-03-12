/**
 * tools/heavyweight/stub_injector.test.ts
 *
 * Tests for HTML stub injector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  injectStubs,
  defaultInjectionConfig,
  type StubInjectionConfig,
} from './stub_injector.js';
import { getStubsForDetectedApps, type ScriptStub } from './script_stub_library.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_HTML = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';

function stubs(...ids: string[]): ScriptStub[] {
  return getStubsForDetectedApps(ids);
}

function config(ids: string[], overrides?: Partial<StubInjectionConfig>): StubInjectionConfig {
  return { ...defaultInjectionConfig(stubs(...ids)), ...overrides };
}

// ── head_end injection ───────────────────────────────────────────────────────

describe('injectStubs — head_end', () => {
  it('injects before </head>', () => {
    const result = injectStubs(BASE_HTML, config(['intercom']));
    const headEnd = result.html.indexOf('</head>');
    const stubPos = result.html.indexOf('__vaeo_stub_intercom');
    assert.ok(stubPos < headEnd);
    assert.equal(result.injection_point, 'before_</head>');
  });

  it('injects multiple stubs', () => {
    const result = injectStubs(BASE_HTML, config(['intercom', 'hotjar']));
    assert.equal(result.stubs_injected, 2);
    assert.ok(result.html.includes('__vaeo_stub_intercom'));
    assert.ok(result.html.includes('__vaeo_stub_hotjar'));
  });

  it('adds timing marker comment', () => {
    const result = injectStubs(BASE_HTML, config(['intercom']));
    assert.ok(result.html.includes('vaeo-stubs: 1 stubs'));
    assert.ok(result.html.includes('800ms load cost'));
  });

  it('adds sentinel comment', () => {
    const result = injectStubs(BASE_HTML, config(['intercom']));
    assert.ok(result.html.includes('<!-- vaeo-stubs-injected -->'));
    assert.equal(result.sentinel_present, true);
  });
});

// ── body_start injection ─────────────────────────────────────────────────────

describe('injectStubs — body_start', () => {
  it('injects after <body>', () => {
    const result = injectStubs(BASE_HTML, config(['intercom'], { inject_position: 'body_start' }));
    const bodyTag = result.html.indexOf('<body>');
    const stubPos = result.html.indexOf('__vaeo_stub_intercom');
    assert.ok(stubPos > bodyTag);
    assert.equal(result.injection_point, 'after_<body>');
  });

  it('handles body with attributes', () => {
    const html = '<html><head></head><body class="main"><p>Hi</p></body></html>';
    const result = injectStubs(html, config(['intercom'], { inject_position: 'body_start' }));
    assert.equal(result.injection_point, 'after_<body>');
    assert.ok(result.html.includes('__vaeo_stub_intercom'));
  });
});

// ── body_end injection ───────────────────────────────────────────────────────

describe('injectStubs — body_end', () => {
  it('injects before </body>', () => {
    const result = injectStubs(BASE_HTML, config(['intercom'], { inject_position: 'body_end' }));
    const bodyEnd = result.html.indexOf('</body>');
    const stubPos = result.html.indexOf('__vaeo_stub_intercom');
    assert.ok(stubPos < bodyEnd);
    assert.equal(result.injection_point, 'before_</body>');
  });
});

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('injectStubs — idempotency', () => {
  it('does not double-inject when sentinel present', () => {
    const first = injectStubs(BASE_HTML, config(['intercom']));
    const second = injectStubs(first.html, config(['intercom']));
    assert.equal(second.already_injected, true);
    assert.equal(second.stubs_injected, 0);
    assert.equal(second.html, first.html);
  });

  it('reports sentinel_present on second call', () => {
    const first = injectStubs(BASE_HTML, config(['intercom']));
    const second = injectStubs(first.html, config(['intercom']));
    assert.equal(second.sentinel_present, true);
  });
});

// ── Fallback ─────────────────────────────────────────────────────────────────

describe('injectStubs — fallback', () => {
  it('appends at end when target not found (head_end)', () => {
    const html = '<div>no head tag</div>';
    const result = injectStubs(html, config(['intercom']));
    assert.equal(result.injection_point, 'append_fallback');
    assert.ok(result.html.includes('__vaeo_stub_intercom'));
  });

  it('appends at end when target not found (body_end)', () => {
    const html = '<div>no body tag</div>';
    const result = injectStubs(html, config(['intercom'], { inject_position: 'body_end' }));
    assert.equal(result.injection_point, 'append_fallback');
  });
});

// ── Timing markers ───────────────────────────────────────────────────────────

describe('injectStubs — timing markers', () => {
  it('omits timing marker when disabled', () => {
    const result = injectStubs(BASE_HTML, config(['intercom'], { add_timing_markers: false }));
    assert.ok(!result.html.includes('vaeo-stubs:'));
    assert.ok(result.html.includes('__vaeo_stub_intercom'));
  });
});

// ── Cost calculation ─────────────────────────────────────────────────────────

describe('injectStubs — cost', () => {
  it('includes simulated cost in result', () => {
    const result = injectStubs(BASE_HTML, config(['intercom', 'hotjar']));
    assert.equal(result.simulated_cost.total_load_ms, 800 + 600);
    assert.equal(result.simulated_cost.total_network_requests, 12 + 8);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('injectStubs — edge cases', () => {
  it('handles empty HTML', () => {
    const result = injectStubs('', config(['intercom']));
    assert.equal(result.html, '');
    assert.equal(result.stubs_injected, 0);
  });

  it('handles empty stubs array', () => {
    const result = injectStubs(BASE_HTML, config([]));
    assert.equal(result.stubs_injected, 0);
    assert.equal(result.html, BASE_HTML);
  });

  it('wraps stubs in script tags', () => {
    const result = injectStubs(BASE_HTML, config(['intercom']));
    assert.ok(result.html.includes('<script>/* VAEO stub: Intercom */'));
  });
});

// ── defaultInjectionConfig ──────────────────────────────────────────────────

describe('defaultInjectionConfig', () => {
  it('defaults to head_end position', () => {
    const cfg = defaultInjectionConfig(stubs('intercom'));
    assert.equal(cfg.inject_position, 'head_end');
  });

  it('enables timing markers by default', () => {
    const cfg = defaultInjectionConfig(stubs('hotjar'));
    assert.equal(cfg.add_timing_markers, true);
  });
});
