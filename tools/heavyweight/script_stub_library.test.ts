/**
 * tools/heavyweight/script_stub_library.test.ts
 *
 * Tests for script stub library.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCRIPT_STUB_LIBRARY,
  getStubByAppId,
  getStubsForDetectedApps,
  calculateTotalSimulatedCost,
  type ScriptStub,
} from './script_stub_library.js';

// ── Catalog completeness ─────────────────────────────────────────────────────

describe('SCRIPT_STUB_LIBRARY — completeness', () => {
  it('has at least 10 stubs', () => {
    assert.ok(SCRIPT_STUB_LIBRARY.length >= 10);
  });

  it('all stubs have unique app_id', () => {
    const ids = SCRIPT_STUB_LIBRARY.map((s) => s.app_id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('all stubs have non-empty stub_js', () => {
    for (const stub of SCRIPT_STUB_LIBRARY) {
      assert.ok(stub.stub_js.length > 0, `${stub.app_id} missing stub_js`);
    }
  });

  it('all stub_js contain vaeo_stub marker', () => {
    for (const stub of SCRIPT_STUB_LIBRARY) {
      assert.ok(stub.stub_js.includes('__vaeo_stub'), `${stub.app_id} missing vaeo marker`);
    }
  });

  it('all stubs have positive simulated_load_ms', () => {
    for (const stub of SCRIPT_STUB_LIBRARY) {
      assert.ok(stub.simulated_load_ms > 0, `${stub.app_id} has zero load_ms`);
    }
  });

  it('all stubs have non-empty dom_mutations', () => {
    for (const stub of SCRIPT_STUB_LIBRARY) {
      assert.ok(stub.dom_mutations.length > 0, `${stub.app_id} missing dom_mutations`);
    }
  });
});

// ── getStubByAppId ───────────────────────────────────────────────────────────

describe('getStubByAppId', () => {
  it('returns stub by id', () => {
    const stub = getStubByAppId('intercom');
    assert.ok(stub);
    assert.equal(stub.app_name, 'Intercom');
    assert.equal(stub.simulated_load_ms, 800);
  });

  it('returns undefined for unknown id', () => {
    assert.equal(getStubByAppId('nonexistent'), undefined);
  });
});

// ── getStubsForDetectedApps ──────────────────────────────────────────────────

describe('getStubsForDetectedApps', () => {
  it('returns stubs for known app ids', () => {
    const stubs = getStubsForDetectedApps(['intercom', 'hotjar']);
    assert.equal(stubs.length, 2);
  });

  it('skips unknown app ids silently', () => {
    const stubs = getStubsForDetectedApps(['intercom', 'unknown_app', 'hotjar']);
    assert.equal(stubs.length, 2);
  });

  it('returns empty for empty input', () => {
    assert.equal(getStubsForDetectedApps([]).length, 0);
  });

  it('handles null input', () => {
    assert.equal(getStubsForDetectedApps(null as unknown as string[]).length, 0);
  });
});

// ── calculateTotalSimulatedCost ──────────────────────────────────────────────

describe('calculateTotalSimulatedCost', () => {
  it('sums load_ms across stubs', () => {
    const stubs = getStubsForDetectedApps(['intercom', 'hotjar']);
    const cost = calculateTotalSimulatedCost(stubs);
    assert.equal(cost.total_load_ms, 800 + 600);
  });

  it('sums main_thread_ms across stubs', () => {
    const stubs = getStubsForDetectedApps(['intercom', 'klaviyo_popup']);
    const cost = calculateTotalSimulatedCost(stubs);
    assert.equal(cost.total_main_thread_ms, 450 + 180);
  });

  it('sums network_requests across stubs', () => {
    const stubs = getStubsForDetectedApps(['intercom', 'hotjar']);
    const cost = calculateTotalSimulatedCost(stubs);
    assert.equal(cost.total_network_requests, 12 + 8);
  });

  it('lists CLS contributors', () => {
    const stubs = getStubsForDetectedApps(['intercom', 'hotjar', 'privy']);
    const cost = calculateTotalSimulatedCost(stubs);
    assert.ok(cost.cls_contributors.includes('Intercom'));
    assert.ok(cost.cls_contributors.includes('Privy'));
    assert.ok(!cost.cls_contributors.includes('Hotjar'));
  });

  it('lists LCP contributors', () => {
    const stubs = getStubsForDetectedApps(['hotjar', 'lucky_orange', 'intercom']);
    const cost = calculateTotalSimulatedCost(stubs);
    assert.ok(cost.lcp_contributors.includes('Hotjar'));
    assert.ok(cost.lcp_contributors.includes('Lucky Orange'));
    assert.ok(!cost.lcp_contributors.includes('Intercom'));
  });

  it('returns zeros for empty stubs', () => {
    const cost = calculateTotalSimulatedCost([]);
    assert.equal(cost.total_load_ms, 0);
    assert.equal(cost.total_main_thread_ms, 0);
    assert.equal(cost.total_network_requests, 0);
  });
});
