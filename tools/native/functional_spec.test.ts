import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpec,
  approveSpec,
  validateSpec,
  type FunctionalSpec,
  type NativeAppCategory,
} from './functional_spec.js';

function makeValidInput() {
  return {
    name: 'Test Component',
    category: 'shipping' as NativeAppCategory,
    version: '1.0.0',
    replaces_app: 'Some App',
    replaces_app_id: 'some_app',
    observed_behaviors: [
      {
        id: 'b1',
        description: 'Shows a banner',
        trigger: 'Page load',
        expected_output: 'Banner visible',
        user_visible: true,
      },
    ],
    data_inputs: [
      { name: 'threshold', type: 'number', description: 'Amount', required: true },
    ],
    performance_requirements: {
      max_js_kb: 5,
      no_external_cdn: true,
      no_render_blocking: true,
      lazy_load_eligible: false,
    },
    legal_notes: 'Observed behavior only.',
  };
}

describe('createSpec', () => {
  it('generates a spec_id', () => {
    const spec = createSpec(makeValidInput());
    assert.ok(spec.spec_id);
    assert.ok(spec.spec_id.length > 10);
  });

  it('sets status to draft', () => {
    const spec = createSpec(makeValidInput());
    assert.equal(spec.status, 'draft');
  });

  it('sets created_at to ISO string', () => {
    const spec = createSpec(makeValidInput());
    assert.ok(spec.created_at);
    assert.ok(!isNaN(Date.parse(spec.created_at)));
  });

  it('preserves input fields', () => {
    const input = makeValidInput();
    const spec = createSpec(input);
    assert.equal(spec.name, 'Test Component');
    assert.equal(spec.category, 'shipping');
    assert.equal(spec.replaces_app, 'Some App');
    assert.equal(spec.observed_behaviors.length, 1);
  });

  it('generates unique IDs for each call', () => {
    const s1 = createSpec(makeValidInput());
    const s2 = createSpec(makeValidInput());
    assert.notEqual(s1.spec_id, s2.spec_id);
  });

  it('never throws', () => {
    const spec = createSpec({
      name: '',
      category: 'other',
      version: '',
      replaces_app: '',
      replaces_app_id: '',
      observed_behaviors: [],
      data_inputs: [],
      performance_requirements: {
        max_js_kb: 0,
        no_external_cdn: false,
        no_render_blocking: false,
        lazy_load_eligible: false,
      },
      legal_notes: '',
    });
    assert.equal(spec.status, 'draft');
  });
});

describe('approveSpec', () => {
  it('sets status to approved', () => {
    const draft = createSpec(makeValidInput());
    const approved = approveSpec(draft);
    assert.equal(approved.status, 'approved');
  });

  it('sets approved_at', () => {
    const draft = createSpec(makeValidInput());
    const approved = approveSpec(draft);
    assert.ok(approved.approved_at);
    assert.ok(!isNaN(Date.parse(approved.approved_at!)));
  });

  it('preserves other fields', () => {
    const draft = createSpec(makeValidInput());
    const approved = approveSpec(draft);
    assert.equal(approved.name, draft.name);
    assert.equal(approved.spec_id, draft.spec_id);
    assert.equal(approved.category, draft.category);
  });

  it('never throws on already approved spec', () => {
    const draft = createSpec(makeValidInput());
    const approved = approveSpec(draft);
    const reapproved = approveSpec(approved);
    assert.equal(reapproved.status, 'approved');
  });
});

describe('validateSpec', () => {
  it('returns valid for complete spec', () => {
    const spec = createSpec(makeValidInput());
    const result = validateSpec(spec);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('errors if name is empty', () => {
    const input = makeValidInput();
    input.name = '';
    const spec = createSpec(input);
    const result = validateSpec(spec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  it('errors if replaces_app is empty', () => {
    const input = makeValidInput();
    input.replaces_app = '';
    const spec = createSpec(input);
    const result = validateSpec(spec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('replaces_app')));
  });

  it('errors if no observed_behaviors', () => {
    const input = makeValidInput();
    input.observed_behaviors = [];
    const spec = createSpec(input);
    const result = validateSpec(spec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('observed_behavior')));
  });

  it('errors if no data_inputs', () => {
    const input = makeValidInput();
    input.data_inputs = [];
    const spec = createSpec(input);
    const result = validateSpec(spec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('data_input')));
  });

  it('collects multiple errors', () => {
    const spec = createSpec({
      name: '',
      category: 'other',
      version: '',
      replaces_app: '',
      replaces_app_id: '',
      observed_behaviors: [],
      data_inputs: [],
      performance_requirements: {
        max_js_kb: 0,
        no_external_cdn: false,
        no_render_blocking: false,
        lazy_load_eligible: false,
      },
      legal_notes: '',
    });
    const result = validateSpec(spec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });

  it('never throws', () => {
    const result = validateSpec({} as FunctionalSpec);
    assert.equal(result.valid, false);
  });
});
