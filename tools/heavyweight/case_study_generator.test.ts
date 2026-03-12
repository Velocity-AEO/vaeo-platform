import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCaseStudy,
  type CaseStudyInput,
  type HeavyweightRun,
  type CaseStudy,
} from './case_study_generator.js';
import type { PerformanceAnalysis } from './performance_analyzer.js';
import type { FixValidationResult } from './fix_validator.js';

function makeRun(overrides: Partial<HeavyweightRun> = {}): HeavyweightRun {
  return {
    run_id: 'run1',
    site_id: 'site1',
    url: 'https://example.com',
    status: 'complete',
    score_before: { performance: 38, seo: 72, accessibility: 80, best_practices: 90, lcp_ms: 9800, cls: 0.2 },
    score_after: { performance: 67, seo: 89, accessibility: 85, best_practices: 92, lcp_ms: 4200, cls: 0.08 },
    detected_apps: ['Hotjar', 'Klaviyo', 'Intercom'],
    fix_types_applied: ['title_missing', 'meta_description_missing', 'image_alt_missing'],
    comparison: { performance_delta: 29, seo_delta: 17, lcp_delta_ms: 5600, cls_delta: -0.12, grade_before: 'F', grade_after: 'C' },
    duration_ms: 47000,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeAnalysis(): PerformanceAnalysis {
  return {
    site_id: 'site1',
    url: 'https://example.com',
    total_third_party_load_ms: 2100,
    total_main_thread_ms: 900,
    total_network_requests: 35,
    app_impacts: [
      { app_id: 'hotjar', app_name: 'Hotjar', load_cost_ms: 800, main_thread_cost_ms: 450, network_requests: 12, performance_impact: 'high', affects_lcp: false, affects_cls: true, replaceable_by_vaeo: false, monthly_cost_usd: 0, recommendation: 'Defer' },
      { app_id: 'klaviyo', app_name: 'Klaviyo', load_cost_ms: 700, main_thread_cost_ms: 250, network_requests: 15, performance_impact: 'high', affects_lcp: true, affects_cls: false, replaceable_by_vaeo: true, monthly_cost_usd: 20, recommendation: 'Replace' },
      { app_id: 'intercom', app_name: 'Intercom', load_cost_ms: 600, main_thread_cost_ms: 200, network_requests: 8, performance_impact: 'medium', affects_lcp: false, affects_cls: true, replaceable_by_vaeo: false, monthly_cost_usd: 39, recommendation: 'Defer' },
    ],
    top_offenders: [],
    vaeo_fixable_savings_ms: 2100,
    vaeo_replaceable_savings_ms: 700,
    vaeo_replaceable_savings_usd: 20,
    baseline_score: 38,
    projected_score_after_replacements: 45,
    analysis_summary: 'Found 3 apps.',
    analyzed_at: new Date().toISOString(),
  };
}

function makeValidation(): FixValidationResult {
  return {
    site_id: 'site1',
    url: 'https://example.com',
    fix_types: ['title_missing', 'meta_description_missing', 'image_alt_missing'],
    html_before: '<html><head></head><body></body></html>',
    html_after: '<html><head><title>Page</title></head><body></body></html>',
    fixes_applied: [
      { fix_type: 'title_missing', success: true, change_description: 'Inserted <title> tag', lines_changed: 1 },
      { fix_type: 'meta_description_missing', success: true, change_description: 'Inserted meta description', lines_changed: 1 },
      { fix_type: 'image_alt_missing', success: true, change_description: 'Added alt attribute', lines_changed: 1 },
    ],
    simulation_applied: true,
    production_condition_warnings: [],
    validated_at: new Date().toISOString(),
    ready_for_scoring: true,
  };
}

function makeInput(overrides: Partial<CaseStudyInput> = {}): CaseStudyInput {
  return {
    site_id: 'site1',
    site_domain: 'example.com',
    run: makeRun(),
    performance_analysis: makeAnalysis(),
    fix_validation: makeValidation(),
    ...overrides,
  };
}

describe('generateCaseStudy — complete run', () => {
  it('generates headline with delta', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.headline.includes('+29'));
    assert.ok(cs.headline.includes('example.com'));
  });

  it('generates subheadline with before/after and app count', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.subheadline.includes('38'));
    assert.ok(cs.subheadline.includes('67'));
    assert.ok(cs.subheadline.includes('3'));
  });

  it('has 5 sections for run with replaceable apps', () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.sections.length, 5);
  });

  it('section 1 is The Challenge', () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.sections[0].heading, 'The Challenge');
    assert.ok(cs.sections[0].body.includes('Hotjar'));
  });

  it('section 2 is What VAEO Found', () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.sections[1].heading, 'What VAEO Found');
  });

  it('section 3 is What VAEO Fixed', () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.sections[2].heading, 'What VAEO Fixed');
    assert.ok(cs.sections[2].body.includes('3 fixes'));
  });

  it('section 4 is The Results', () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.sections[3].heading, 'The Results');
    assert.ok(cs.sections[3].body.includes('+29'));
  });

  it("section 5 is What's Next", () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.sections[4].heading, "What's Next");
  });

  it('metrics_snapshot has correct values', () => {
    const cs = generateCaseStudy(makeInput());
    assert.equal(cs.metrics_snapshot.performance_before, 38);
    assert.equal(cs.metrics_snapshot.performance_after, 67);
    assert.equal(cs.metrics_snapshot.performance_delta, 29);
    assert.equal(cs.metrics_snapshot.lcp_before_ms, 9800);
    assert.equal(cs.metrics_snapshot.lcp_after_ms, 4200);
    assert.equal(cs.metrics_snapshot.apps_detected, 3);
    assert.equal(cs.metrics_snapshot.fixes_applied, 3);
  });

  it('generates pullquote with LCP improvement', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.pullquote.includes('LCP'));
    assert.ok(cs.pullquote.includes('9.8'));
    assert.ok(cs.pullquote.includes('4.2'));
  });

  it('generates CTA', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.cta.includes('vaeo.app'));
  });

  it('generates shareable_summary', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.shareable_summary.includes('example.com'));
    assert.ok(cs.shareable_summary.includes('+29'));
    assert.ok(cs.shareable_summary.includes('VAEO'));
  });

  it('includes grade change in results section when grade changes', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.sections[3].body.includes('D'));
    assert.ok(cs.sections[3].body.includes('C'));
  });

  it('sets generated_at', () => {
    const cs = generateCaseStudy(makeInput());
    assert.ok(cs.generated_at);
    assert.ok(!isNaN(Date.parse(cs.generated_at)));
  });

  it('data_points contain meaningful values', () => {
    const cs = generateCaseStudy(makeInput());
    const challenge = cs.sections[0];
    assert.ok(challenge.data_points.length >= 3);
    assert.ok(challenge.data_points.some((d) => d.label === 'Performance Score'));
  });
});

describe('generateCaseStudy — incomplete run', () => {
  it('returns minimal case study for pending run', () => {
    const cs = generateCaseStudy(makeInput({ run: makeRun({ status: 'pending', score_after: undefined, comparison: undefined }) }));
    assert.ok(cs.headline.includes('In Progress'));
    assert.equal(cs.sections.length, 0);
  });

  it('returns minimal case study for failed run', () => {
    const cs = generateCaseStudy(makeInput({ run: makeRun({ status: 'failed', score_after: undefined, comparison: undefined }) }));
    assert.equal(cs.sections.length, 0);
  });

  it('still has metrics_snapshot with before values', () => {
    const cs = generateCaseStudy(makeInput({ run: makeRun({ status: 'running', score_after: undefined, comparison: undefined }) }));
    assert.equal(cs.metrics_snapshot.performance_before, 38);
    assert.equal(cs.metrics_snapshot.performance_delta, 0);
  });
});
