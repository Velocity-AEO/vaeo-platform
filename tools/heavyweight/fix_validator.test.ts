import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTextFixes,
  validateFixUnderLoad,
  type FixValidationInput,
  type SimulationResult,
  type LighthouseScore,
} from './fix_validator.js';

const BASE_HTML = `<html><head></head><body><img src="test.jpg"><p>Hello</p></body></html>`;

const EMPTY_SIM: SimulationResult = {
  stubs_applied: [],
  total_simulated_load_ms: 0,
  total_simulated_main_thread_ms: 0,
  warnings: [],
};

const BASE_SCORE: LighthouseScore = {
  performance: 45, seo: 72, accessibility: 80,
  best_practices: 90, lcp_ms: 5000, cls: 0.1,
};

function makeInput(overrides: Partial<FixValidationInput> = {}): FixValidationInput {
  return {
    site_id: 'site1',
    url: 'https://example.com',
    html_before: BASE_HTML,
    fix_types: ['title_missing'],
    simulation_result: EMPTY_SIM,
    score_before: BASE_SCORE,
    ...overrides,
  };
}

describe('applyTextFixes', () => {
  it('inserts title tag when missing', () => {
    const { html, applied } = applyTextFixes(BASE_HTML, ['title_missing']);
    assert.ok(html.includes('<title>Page Title</title>'));
    assert.deepEqual(applied, ['title_missing']);
  });

  it('skips title tag when present', () => {
    const withTitle = BASE_HTML.replace('<head>', '<head><title>Existing</title>');
    const { html, applied } = applyTextFixes(withTitle, ['title_missing']);
    assert.ok(!html.includes('Page Title'));
    assert.deepEqual(applied, []);
  });

  it('inserts meta description when missing', () => {
    const { html, applied } = applyTextFixes(BASE_HTML, ['meta_description_missing']);
    assert.ok(html.includes('<meta name="description"'));
    assert.deepEqual(applied, ['meta_description_missing']);
  });

  it('skips meta description when present', () => {
    const withMeta = BASE_HTML.replace('<head>', '<head><meta name="description" content="test">');
    const { applied } = applyTextFixes(withMeta, ['meta_description_missing']);
    assert.deepEqual(applied, []);
  });

  it('adds alt attribute to img without alt', () => {
    const { html, applied } = applyTextFixes(BASE_HTML, ['image_alt_missing']);
    assert.ok(html.includes('alt=""'));
    assert.deepEqual(applied, ['image_alt_missing']);
  });

  it('skips img that already has alt', () => {
    const withAlt = BASE_HTML.replace('<img src="test.jpg">', '<img alt="photo" src="test.jpg">');
    const { applied } = applyTextFixes(withAlt, ['image_alt_missing']);
    assert.deepEqual(applied, []);
  });

  it('adds lang attribute when missing', () => {
    const { html, applied } = applyTextFixes(BASE_HTML, ['lang_missing']);
    assert.ok(html.includes('lang="en"'));
    assert.deepEqual(applied, ['lang_missing']);
  });

  it('skips lang when present', () => {
    const withLang = BASE_HTML.replace('<html>', '<html lang="fr">');
    const { applied } = applyTextFixes(withLang, ['lang_missing']);
    assert.deepEqual(applied, []);
  });

  it('adds canonical link when missing', () => {
    const { html, applied } = applyTextFixes(BASE_HTML, ['canonical_missing']);
    assert.ok(html.includes('rel="canonical"'));
    assert.deepEqual(applied, ['canonical_missing']);
  });

  it('applies multiple fixes at once', () => {
    const { html, applied } = applyTextFixes(BASE_HTML, [
      'title_missing', 'meta_description_missing', 'lang_missing',
    ]);
    assert.ok(html.includes('<title>'));
    assert.ok(html.includes('meta name="description"'));
    assert.ok(html.includes('lang="en"'));
    assert.equal(applied.length, 3);
  });

  it('is idempotent', () => {
    const { html: first } = applyTextFixes(BASE_HTML, ['title_missing']);
    const { html: second, applied } = applyTextFixes(first, ['title_missing']);
    assert.equal(first, second);
    assert.deepEqual(applied, []);
  });
});

describe('validateFixUnderLoad', () => {
  it('returns successful result for valid fix', async () => {
    const result = await validateFixUnderLoad(makeInput());
    assert.equal(result.site_id, 'site1');
    assert.equal(result.ready_for_scoring, true);
    assert.equal(result.fixes_applied.length, 1);
    assert.equal(result.fixes_applied[0].success, true);
  });

  it('includes html_after with fix applied', async () => {
    const result = await validateFixUnderLoad(makeInput());
    assert.ok(result.html_after.includes('<title>'));
  });

  it('re-injects stubs after fixing', async () => {
    const sim: SimulationResult = {
      stubs_applied: [{
        app_id: 'hotjar', app_name: 'Hotjar', category: 'analytics',
        stub_js: 'console.log("stub")', simulated_load_ms: 500,
        simulated_main_thread_ms: 200, simulated_network_requests: 5,
        affects_cls: false, affects_lcp: true, dom_mutations: [],
        description: 'Hotjar stub',
      }],
      total_simulated_load_ms: 500,
      total_simulated_main_thread_ms: 200,
      warnings: ['High load'],
    };
    const result = await validateFixUnderLoad(makeInput({ simulation_result: sim }));
    assert.equal(result.simulation_applied, true);
    assert.ok(result.html_after.includes('vaeo-stub'));
  });

  it('passes production_condition_warnings from simulation', async () => {
    const sim: SimulationResult = {
      ...EMPTY_SIM,
      warnings: ['Slow network', 'High CPU'],
    };
    const result = await validateFixUnderLoad(makeInput({ simulation_result: sim }));
    assert.deepEqual(result.production_condition_warnings, ['Slow network', 'High CPU']);
  });

  it('reports lines_changed for each fix', async () => {
    const result = await validateFixUnderLoad(makeInput());
    assert.ok(result.fixes_applied[0].lines_changed > 0);
  });

  it('marks not ready when fix not applicable', async () => {
    const withTitle = BASE_HTML.replace('<head>', '<head><title>Exists</title>');
    const result = await validateFixUnderLoad(makeInput({
      html_before: withTitle,
      fix_types: ['title_missing'],
    }));
    assert.equal(result.ready_for_scoring, false);
    assert.equal(result.fixes_applied[0].success, false);
  });

  it('never throws on bad input', async () => {
    const result = await validateFixUnderLoad(makeInput({ html_before: '' }));
    assert.ok(result.validated_at);
  });
});
