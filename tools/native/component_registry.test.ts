import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENT_REGISTRY,
  getComponentBySpecId,
  getLiveComponents,
  getComponentsByPlatform,
  registerComponent,
} from './component_registry.js';
import { SPEC_LIBRARY } from './spec_library.js';

describe('COMPONENT_REGISTRY', () => {
  it('contains 3 components', () => {
    assert.ok(COMPONENT_REGISTRY.length >= 3);
  });

  it('all components are in development', () => {
    const initial = COMPONENT_REGISTRY.slice(0, 3);
    for (const c of initial) {
      assert.equal(c.status, 'development');
    }
  });

  it('all components have unique component_ids', () => {
    const ids = COMPONENT_REGISTRY.slice(0, 3).map((c) => c.component_id);
    assert.equal(new Set(ids).size, 3);
  });

  it('shipping_announcement_bar matches spec 0', () => {
    const c = COMPONENT_REGISTRY.find((r) => r.name === 'shipping_announcement_bar');
    assert.ok(c);
    assert.equal(c!.spec_id, SPEC_LIBRARY[0].spec_id);
    assert.equal(c!.platform, 'shopify');
  });

  it('email_capture_popup matches spec 1 and is both platform', () => {
    const c = COMPONENT_REGISTRY.find((r) => r.name === 'email_capture_popup');
    assert.ok(c);
    assert.equal(c!.spec_id, SPEC_LIBRARY[1].spec_id);
    assert.equal(c!.platform, 'both');
  });

  it('social_feed_widget matches spec 2', () => {
    const c = COMPONENT_REGISTRY.find((r) => r.name === 'social_feed_widget');
    assert.ok(c);
    assert.equal(c!.spec_id, SPEC_LIBRARY[2].spec_id);
  });

  it('all initial components have js_size_kb = 0', () => {
    const initial = COMPONENT_REGISTRY.slice(0, 3);
    for (const c of initial) {
      assert.equal(c.js_size_kb, 0);
    }
  });

  it('all initial components are not legal_approved', () => {
    const initial = COMPONENT_REGISTRY.slice(0, 3);
    for (const c of initial) {
      assert.equal(c.legal_approved, false);
    }
  });
});

describe('getComponentBySpecId', () => {
  it('finds component by spec_id', () => {
    const c = getComponentBySpecId(SPEC_LIBRARY[0].spec_id);
    assert.ok(c);
    assert.equal(c!.name, 'shipping_announcement_bar');
  });

  it('returns undefined for unknown spec_id', () => {
    assert.equal(getComponentBySpecId('nonexistent'), undefined);
  });
});

describe('getLiveComponents', () => {
  it('returns empty array when no live components', () => {
    const live = getLiveComponents();
    assert.equal(live.length, 0);
  });
});

describe('getComponentsByPlatform', () => {
  it('returns shopify components including "both"', () => {
    const shopify = getComponentsByPlatform('shopify');
    assert.ok(shopify.length >= 3); // shipping, social are shopify; email is both
  });

  it('returns wordpress components including "both"', () => {
    const wp = getComponentsByPlatform('wordpress');
    assert.ok(wp.length >= 1); // email_capture_popup is 'both'
  });
});

describe('registerComponent', () => {
  it('creates a new component with generated id', () => {
    const initialLength = COMPONENT_REGISTRY.length;
    const c = registerComponent({
      spec_id: 'test-spec',
      name: 'test_component',
      version: '1.0.0',
      status: 'development',
      platform: 'shopify',
      entry_file: 'test.liquid',
      js_size_kb: 3,
      has_external_cdn: false,
      has_render_blocking: false,
      test_coverage_pct: 0,
      performance_verified: false,
      legal_approved: false,
      notes: 'Test',
    });
    assert.ok(c.component_id);
    assert.ok(c.created_at);
    assert.equal(COMPONENT_REGISTRY.length, initialLength + 1);
  });
});
