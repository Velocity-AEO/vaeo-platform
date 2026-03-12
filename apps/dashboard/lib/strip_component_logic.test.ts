/**
 * apps/dashboard/lib/strip_component_logic.test.ts
 *
 * Tests for viewport screenshot strip component logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTabClasses, getCleanIndicator } from './strip_component_logic.js';

// ── getTabClasses ────────────────────────────────────────────────────────────

describe('getTabClasses', () => {
  it('returns active classes when tab matches', () => {
    const classes = getTabClasses('mobile', 'mobile');
    assert.ok(classes.includes('bg-blue-600'));
    assert.ok(classes.includes('text-white'));
  });

  it('returns inactive classes when tab does not match', () => {
    const classes = getTabClasses('mobile', 'tablet');
    assert.ok(classes.includes('bg-gray-100'));
    assert.ok(classes.includes('text-gray-600'));
  });

  it('returns different classes for active vs inactive', () => {
    const active = getTabClasses('mobile', 'mobile');
    const inactive = getTabClasses('mobile', 'tablet');
    assert.notEqual(active, inactive);
  });

  it('inactive includes hover state', () => {
    const classes = getTabClasses('wide', 'mobile');
    assert.ok(classes.includes('hover:bg-gray-200'));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => getTabClasses(null as any, null as any));
  });

  it('never throws on undefined inputs', () => {
    assert.doesNotThrow(() => getTabClasses(undefined as any, undefined as any));
  });
});

// ── getCleanIndicator ────────────────────────────────────────────────────────

describe('getCleanIndicator', () => {
  it('returns green checkmark for clean=true', () => {
    const result = getCleanIndicator(true);
    assert.equal(result.icon, '✓');
    assert.equal(result.color, 'text-green-600');
    assert.equal(result.label, 'All viewports clean');
  });

  it('returns red X for clean=false', () => {
    const result = getCleanIndicator(false);
    assert.equal(result.icon, '✗');
    assert.equal(result.color, 'text-red-600');
    assert.equal(result.label, 'Viewport issues detected');
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => getCleanIndicator(undefined as any));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getCleanIndicator(null as any));
  });
});
