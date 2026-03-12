import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePerformanceImpact,
  type PerformanceAnalysis,
} from './performance_analyzer.js';
import type { ScriptStub } from './script_stub_library.js';
import type { LighthouseScore } from './fix_validator.js';
import type { EnvironmentScan, DetectedApp } from '../apps/environment_scanner.js';
import type { AppFingerprint } from '../apps/app_fingerprint_catalog.js';

function makeFp(id: string, overrides: Partial<AppFingerprint> = {}): AppFingerprint {
  return {
    app_id: id,
    name: `App ${id}`,
    category: 'analytics',
    monthly_cost_usd: 20,
    script_patterns: [],
    domain_patterns: [],
    dom_patterns: [],
    cookie_patterns: [],
    performance_impact: 'high',
    performance_notes: '',
    replaceable_by_vaeo: true,
    regulatory_exempt: false,
    description: '',
    ...overrides,
  };
}

function makeDetected(id: string, fpOverrides: Partial<AppFingerprint> = {}): DetectedApp {
  return {
    fingerprint: makeFp(id, fpOverrides),
    confidence: 'high',
    matched_patterns: ['test'],
    estimated_monthly_cost: 20,
    performance_impact: 'high',
  };
}

function makeStub(id: string, overrides: Partial<ScriptStub> = {}): ScriptStub {
  return {
    app_id: id,
    app_name: `App ${id}`,
    category: 'analytics',
    stub_js: 'console.log("stub")',
    simulated_load_ms: 500,
    simulated_main_thread_ms: 200,
    simulated_network_requests: 8,
    affects_cls: false,
    affects_lcp: true,
    dom_mutations: [],
    description: '',
    ...overrides,
  };
}

function makeScan(apps: DetectedApp[]): EnvironmentScan {
  return {
    site_id: 'site1',
    url: 'https://example.com',
    scanned_at: new Date().toISOString(),
    detected_apps: apps,
    total_apps_detected: apps.length,
    regulatory_exempt_count: 0,
    replaceable_count: apps.length,
    estimated_monthly_spend: 60,
    performance_offenders: apps,
    vaeo_replacement_savings: 60,
    app_categories: {} as any,
  };
}

const BASE_SCORE: LighthouseScore = {
  performance: 38, seo: 72, accessibility: 80,
  best_practices: 90, lcp_ms: 9800, cls: 0.2,
};

describe('analyzePerformanceImpact', () => {
  it('returns correct site_id and url', () => {
    const result = analyzePerformanceImpact('s1', 'https://test.com', makeScan([]), BASE_SCORE, []);
    assert.equal(result.site_id, 's1');
    assert.equal(result.url, 'https://test.com');
  });

  it('handles empty scan', () => {
    const result = analyzePerformanceImpact('s1', 'https://test.com', makeScan([]), BASE_SCORE, []);
    assert.equal(result.app_impacts.length, 0);
    assert.equal(result.total_third_party_load_ms, 0);
  });

  it('computes total load from stubs', () => {
    const scan = makeScan([makeDetected('hotjar'), makeDetected('klaviyo')]);
    const stubs = [makeStub('hotjar', { simulated_load_ms: 800 }), makeStub('klaviyo', { simulated_load_ms: 600 })];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.total_third_party_load_ms, 1400);
  });

  it('computes total main thread time', () => {
    const scan = makeScan([makeDetected('a1')]);
    const stubs = [makeStub('a1', { simulated_main_thread_ms: 300 })];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.total_main_thread_ms, 300);
  });

  it('computes total network requests', () => {
    const scan = makeScan([makeDetected('a1')]);
    const stubs = [makeStub('a1', { simulated_network_requests: 12 })];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.total_network_requests, 12);
  });

  it('identifies top offenders sorted by load_cost_ms', () => {
    const scan = makeScan([makeDetected('slow'), makeDetected('fast')]);
    const stubs = [
      makeStub('slow', { simulated_load_ms: 1200 }),
      makeStub('fast', { simulated_load_ms: 100 }),
    ];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.top_offenders[0].app_id, 'slow');
    assert.equal(result.top_offenders[1].app_id, 'fast');
  });

  it('limits top_offenders to 5', () => {
    const apps = Array.from({ length: 8 }, (_, i) => makeDetected(`app${i}`));
    const stubs = Array.from({ length: 8 }, (_, i) => makeStub(`app${i}`, { simulated_load_ms: (i + 1) * 100 }));
    const result = analyzePerformanceImpact('s1', 'u', makeScan(apps), BASE_SCORE, stubs);
    assert.equal(result.top_offenders.length, 5);
  });

  it('classifies critical impact for 1000ms+', () => {
    const scan = makeScan([makeDetected('heavy')]);
    const stubs = [makeStub('heavy', { simulated_load_ms: 1200 })];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.app_impacts[0].performance_impact, 'critical');
  });

  it('classifies low impact for < 200ms', () => {
    const scan = makeScan([makeDetected('light', { performance_impact: 'low' })]);
    const stubs = [makeStub('light', { simulated_load_ms: 50 })];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.app_impacts[0].performance_impact, 'low');
  });

  it('computes vaeo_replaceable_savings_ms', () => {
    const scan = makeScan([
      makeDetected('rep', { replaceable_by_vaeo: true }),
      makeDetected('norep', { replaceable_by_vaeo: false }),
    ]);
    const stubs = [
      makeStub('rep', { simulated_load_ms: 600 }),
      makeStub('norep', { simulated_load_ms: 400 }),
    ];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.equal(result.vaeo_replaceable_savings_ms, 600);
  });

  it('computes vaeo_replaceable_savings_usd', () => {
    const scan = makeScan([
      makeDetected('a', { replaceable_by_vaeo: true, monthly_cost_usd: 15 }),
      makeDetected('b', { replaceable_by_vaeo: true, monthly_cost_usd: 25 }),
    ]);
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, []);
    assert.equal(result.vaeo_replaceable_savings_usd, 40);
  });

  it('computes projected score capped at 100', () => {
    const scan = makeScan([makeDetected('big')]);
    const stubs = [makeStub('big', { simulated_load_ms: 5000 })];
    const score: LighthouseScore = { ...BASE_SCORE, performance: 85 };
    const result = analyzePerformanceImpact('s1', 'u', scan, score, stubs);
    assert.ok(result.projected_score_after_replacements <= 100);
  });

  it('projected score boost capped at 30', () => {
    const scan = makeScan([makeDetected('huge')]);
    const stubs = [makeStub('huge', { simulated_load_ms: 10000 })];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.ok(result.projected_score_after_replacements <= BASE_SCORE.performance + 30);
  });

  it('generates recommendation for replaceable apps', () => {
    const scan = makeScan([makeDetected('rep', { replaceable_by_vaeo: true })]);
    const stubs = [makeStub('rep')];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.ok(result.app_impacts[0].recommendation.includes('Replace with VAEO'));
  });

  it('generates recommendation for non-replaceable apps', () => {
    const scan = makeScan([makeDetected('norep', { replaceable_by_vaeo: false })]);
    const stubs = [makeStub('norep')];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.ok(result.app_impacts[0].recommendation.includes('lazy-loading'));
  });

  it('generates analysis_summary', () => {
    const scan = makeScan([makeDetected('a')]);
    const stubs = [makeStub('a')];
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, stubs);
    assert.ok(result.analysis_summary.includes('Found'));
    assert.ok(result.analysis_summary.includes('VAEO can replace'));
  });

  it('sets analyzed_at', () => {
    const result = analyzePerformanceImpact('s1', 'u', makeScan([]), BASE_SCORE, []);
    assert.ok(result.analyzed_at);
    assert.ok(!isNaN(Date.parse(result.analyzed_at)));
  });

  it('handles app without matching stub gracefully', () => {
    const scan = makeScan([makeDetected('nostub')]);
    const result = analyzePerformanceImpact('s1', 'u', scan, BASE_SCORE, []);
    assert.equal(result.app_impacts[0].load_cost_ms, 0);
  });
});
