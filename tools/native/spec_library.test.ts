import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEC_LIBRARY,
  getSpecById,
  getSpecByAppId,
  getApprovedSpecs,
} from './spec_library.js';
import { validateSpec } from './functional_spec.js';

describe('SPEC_LIBRARY', () => {
  it('contains exactly 3 specs', () => {
    assert.equal(SPEC_LIBRARY.length, 3);
  });

  it('all specs are approved', () => {
    for (const spec of SPEC_LIBRARY) {
      assert.equal(spec.status, 'approved');
    }
  });

  it('all specs have approved_at set', () => {
    for (const spec of SPEC_LIBRARY) {
      assert.ok(spec.approved_at);
    }
  });

  it('all specs have unique spec_ids', () => {
    const ids = SPEC_LIBRARY.map((s) => s.spec_id);
    assert.equal(new Set(ids).size, 3);
  });

  it('all specs pass validation', () => {
    for (const spec of SPEC_LIBRARY) {
      const result = validateSpec(spec);
      assert.equal(result.valid, true, `${spec.name} failed: ${result.errors.join(', ')}`);
    }
  });

  it('Shipping Announcement Bar has correct fields', () => {
    const spec = SPEC_LIBRARY[0];
    assert.equal(spec.name, 'Shipping Announcement Bar');
    assert.equal(spec.category, 'shipping');
    assert.equal(spec.replaces_app, 'Hextom Free Shipping Bar');
    assert.equal(spec.replaces_app_id, 'hextom_shipping_bar');
    assert.equal(spec.observed_behaviors.length, 5);
    assert.equal(spec.data_inputs.length, 4);
  });

  it('Email Capture Popup has correct fields', () => {
    const spec = SPEC_LIBRARY[1];
    assert.equal(spec.name, 'Email Capture Popup');
    assert.equal(spec.category, 'popup');
    assert.equal(spec.replaces_app, 'SendWILL Email Popups');
    assert.equal(spec.observed_behaviors.length, 5);
    assert.equal(spec.data_inputs.length, 4);
  });

  it('Social Feed Widget has correct fields', () => {
    const spec = SPEC_LIBRARY[2];
    assert.equal(spec.name, 'Social Feed Widget');
    assert.equal(spec.category, 'social');
    assert.equal(spec.replaces_app, 'Instafeed');
    assert.equal(spec.observed_behaviors.length, 4);
    assert.equal(spec.data_inputs.length, 3);
  });

  it('all specs have legal_notes', () => {
    for (const spec of SPEC_LIBRARY) {
      assert.ok(spec.legal_notes.length > 10);
      assert.ok(spec.legal_notes.includes('No source code accessed'));
    }
  });

  it('all specs have performance_requirements', () => {
    for (const spec of SPEC_LIBRARY) {
      assert.ok(spec.performance_requirements.max_js_kb > 0);
      assert.equal(spec.performance_requirements.no_external_cdn, true);
      assert.equal(spec.performance_requirements.no_render_blocking, true);
    }
  });
});

describe('getSpecById', () => {
  it('finds spec by id', () => {
    const spec = SPEC_LIBRARY[0];
    const found = getSpecById(spec.spec_id);
    assert.equal(found?.name, spec.name);
  });

  it('returns undefined for unknown id', () => {
    assert.equal(getSpecById('nonexistent'), undefined);
  });
});

describe('getSpecByAppId', () => {
  it('finds spec by app id', () => {
    const found = getSpecByAppId('hextom_shipping_bar');
    assert.equal(found?.name, 'Shipping Announcement Bar');
  });

  it('finds instafeed spec', () => {
    const found = getSpecByAppId('instafeed');
    assert.equal(found?.name, 'Social Feed Widget');
  });

  it('returns undefined for unknown app id', () => {
    assert.equal(getSpecByAppId('nonexistent'), undefined);
  });
});

describe('getApprovedSpecs', () => {
  it('returns all approved specs', () => {
    const approved = getApprovedSpecs();
    assert.equal(approved.length, 3);
  });
});
