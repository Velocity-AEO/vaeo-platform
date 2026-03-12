import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  translateObservationToSpec,
  specToPrompt,
  type TranslatorInput,
} from './translator.js';

function makeInput(overrides: Partial<TranslatorInput> = {}): TranslatorInput {
  return {
    app_name: 'Test App',
    app_id: 'test_app',
    category: 'shipping',
    observed_url: 'https://example.com',
    observation_notes: 'The app shows a banner at the top. It displays the shipping threshold. It updates when cart changes. It hides when user clicks X. It renders a progress bar.',
    observer_name: 'Test Observer',
    ...overrides,
  };
}

describe('translateObservationToSpec', () => {
  it('returns a FunctionalSpec in draft status', () => {
    const result = translateObservationToSpec(makeInput());
    assert.equal(result.spec.status, 'draft');
  });

  it('sets spec name with (Native) suffix', () => {
    const result = translateObservationToSpec(makeInput());
    assert.equal(result.spec.name, 'Test App (Native)');
  });

  it('sets replaces_app and replaces_app_id', () => {
    const result = translateObservationToSpec(makeInput());
    assert.equal(result.spec.replaces_app, 'Test App');
    assert.equal(result.spec.replaces_app_id, 'test_app');
  });

  it('parses behaviors from observation notes', () => {
    const result = translateObservationToSpec(makeInput());
    assert.ok(result.spec.observed_behaviors.length >= 4);
  });

  it('assigns sequential behavior IDs', () => {
    const result = translateObservationToSpec(makeInput());
    const ids = result.spec.observed_behaviors.map((b) => b.id);
    assert.equal(ids[0], 'b1');
    assert.equal(ids[1], 'b2');
  });

  it('returns high confidence for 5+ behaviors', () => {
    const result = translateObservationToSpec(makeInput());
    assert.equal(result.confidence, 'high');
  });

  it('returns medium confidence for 2-4 behaviors', () => {
    const result = translateObservationToSpec(makeInput({
      observation_notes: 'It shows a banner. It displays a message.',
    }));
    assert.equal(result.confidence, 'medium');
  });

  it('returns low confidence for fewer than 2 behaviors', () => {
    const result = translateObservationToSpec(makeInput({
      observation_notes: 'Nothing special here.',
    }));
    assert.equal(result.confidence, 'low');
  });

  it('warns about empty data_inputs', () => {
    const result = translateObservationToSpec(makeInput());
    assert.ok(result.warnings.some((w) => w.includes('data_inputs')));
  });

  it('sets needs_legal_review for payments category', () => {
    const result = translateObservationToSpec(makeInput({ category: 'payments' }));
    assert.equal(result.needs_legal_review, true);
  });

  it('sets needs_legal_review for email category', () => {
    const result = translateObservationToSpec(makeInput({ category: 'email' }));
    assert.equal(result.needs_legal_review, true);
  });

  it('does not need legal review for shipping category', () => {
    const result = translateObservationToSpec(makeInput({ category: 'shipping' }));
    assert.equal(result.needs_legal_review, false);
  });

  it('includes legal_notes with observer info', () => {
    const result = translateObservationToSpec(makeInput());
    assert.ok(result.spec.legal_notes.includes('Test Observer'));
    assert.ok(result.spec.legal_notes.includes('Test App'));
    assert.ok(result.spec.legal_notes.includes('No source code accessed'));
  });

  it('uses observed_url in legal_notes', () => {
    const result = translateObservationToSpec(makeInput());
    assert.ok(result.spec.legal_notes.includes('https://example.com'));
  });

  it('uses "merchant store" when no URL provided', () => {
    const result = translateObservationToSpec(makeInput({ observed_url: undefined }));
    assert.ok(result.spec.legal_notes.includes('merchant store'));
  });

  it('never throws on empty input', () => {
    const result = translateObservationToSpec({
      app_name: '',
      app_id: '',
      category: 'other',
      observation_notes: '',
      observer_name: '',
    });
    assert.equal(result.spec.status, 'draft');
  });
});

describe('specToPrompt', () => {
  it('includes component name', () => {
    const result = translateObservationToSpec(makeInput());
    const prompt = specToPrompt(result.spec);
    assert.ok(prompt.includes('Component: Test App (Native)'));
  });

  it('includes replaces info', () => {
    const result = translateObservationToSpec(makeInput());
    const prompt = specToPrompt(result.spec);
    assert.ok(prompt.includes('Replaces: Test App'));
  });

  it('includes behaviors as numbered list', () => {
    const result = translateObservationToSpec(makeInput());
    const prompt = specToPrompt(result.spec);
    assert.ok(prompt.includes('1.'));
    assert.ok(prompt.includes('Trigger:'));
    assert.ok(prompt.includes('Expected:'));
  });

  it('includes performance requirements', () => {
    const result = translateObservationToSpec(makeInput());
    const prompt = specToPrompt(result.spec);
    assert.ok(prompt.includes('Max JS bundle'));
    assert.ok(prompt.includes('No external CDN'));
  });

  it('includes legal notes', () => {
    const result = translateObservationToSpec(makeInput());
    const prompt = specToPrompt(result.spec);
    assert.ok(prompt.includes('Legal:'));
    assert.ok(prompt.includes('No source code accessed'));
  });

  it('includes clean room instruction', () => {
    const result = translateObservationToSpec(makeInput());
    const prompt = specToPrompt(result.spec);
    assert.ok(prompt.includes('Write original code from scratch'));
  });
});
