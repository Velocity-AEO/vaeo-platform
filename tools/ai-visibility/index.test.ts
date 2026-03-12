import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_VISIBILITY_VERSION,
  AI_SOURCES_SUPPORTED,
  buildCitation,
  buildCitationSummary,
  buildQuerySet,
  simulatePerplexityCitation,
  simulatePerplexityBatch,
  simulateGoogleAIO,
  simulateGoogleAIOBatch,
  buildAIOCitations,
  buildUnifiedSignal,
  generateUnifiedReport,
  computeAIVisibilityScore,
  buildVisibilitySnapshot,
  simulateVisibilityHistory,
  computeVisibilityTrend,
  analyzeCompetitorGap,
  simulateSchemaOpportunities,
  generateAIVisibilityReport,
} from './index.js';

// ── Barrel export tests ──────────────────────────────────────────────────────

describe('ai-visibility index barrel', () => {
  it('AI_VISIBILITY_VERSION is semver string', () => {
    assert.match(AI_VISIBILITY_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('AI_SOURCES_SUPPORTED includes perplexity and google_ai_overview', () => {
    assert.ok(AI_SOURCES_SUPPORTED.includes('perplexity'));
    assert.ok(AI_SOURCES_SUPPORTED.includes('google_ai_overview'));
  });

  it('AI_SOURCES_SUPPORTED has 4 entries', () => {
    assert.equal(AI_SOURCES_SUPPORTED.length, 4);
  });

  it('buildCitation is exported and callable', () => {
    const c = buildCitation('site1', {
      url: 'https://test.com/', domain: 'test.com', query: 'test',
      source: 'perplexity', cited: true, confidence: 0.9,
      query_category: 'informational', is_branded: false, is_competitor: false,
    });
    assert.ok(c.citation_id);
    assert.equal(c.cited, true);
  });

  it('buildCitationSummary is exported and callable', () => {
    const s = buildCitationSummary('site1', 'test.com', []);
    assert.equal(s.total_citations, 0);
  });

  it('buildQuerySet is exported and callable', () => {
    const qs = buildQuerySet('site1', 'test.com', 'TestBrand');
    assert.ok(Array.isArray(qs));
    assert.ok(qs.length > 0);
  });

  it('simulatePerplexityCitation is exported and callable', () => {
    const c = simulatePerplexityCitation('site1', 'test.com', 'best shoes', 'informational');
    assert.equal(c.source, 'perplexity');
  });

  it('simulatePerplexityBatch is exported and callable', () => {
    const batch = simulatePerplexityBatch('site1', 'test.com', [
      { query: 'test', category: 'informational' },
    ]);
    assert.equal(batch.length, 1);
  });

  it('simulateGoogleAIO is exported and callable', () => {
    const r = simulateGoogleAIO('best shoes', 'test.com');
    assert.equal(typeof r.has_ai_overview, 'boolean');
  });

  it('simulateGoogleAIOBatch is exported and callable', () => {
    const batch = simulateGoogleAIOBatch('test.com', ['query1']);
    assert.equal(batch.length, 1);
  });

  it('buildAIOCitations is exported and callable', () => {
    const results = simulateGoogleAIOBatch('test.com', ['query1']);
    const citations = buildAIOCitations('site1', 'test.com', results);
    assert.ok(Array.isArray(citations));
  });

  it('buildUnifiedSignal is exported and callable', () => {
    const signal = buildUnifiedSignal('site1', 'test.com', [], []);
    assert.equal(signal.combined_score, 0);
  });

  it('generateUnifiedReport is exported and callable', async () => {
    const report = await generateUnifiedReport('site1', 'test.com');
    assert.ok(report.signal);
    assert.ok(report.summary);
  });

  it('computeAIVisibilityScore is exported and callable', () => {
    const score = computeAIVisibilityScore(
      { site_id: 'site1', domain: 'test.com', total_queries: 10, total_citations: 3, citation_rate: 0.3 },
      { branded_rate: 0.5, product_rate: 0.3, informational_rate: 0.1 },
    );
    assert.ok(typeof score.score === 'number');
  });

  it('buildVisibilitySnapshot is exported and callable', () => {
    const signal = buildUnifiedSignal('site1', 'test.com', [], []);
    const snap = buildVisibilitySnapshot('site1', 'test.com', signal);
    assert.ok(snap.snapshot_id);
  });

  it('simulateVisibilityHistory is exported and callable', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 7);
    assert.equal(history.length, 7);
  });

  it('computeVisibilityTrend is exported and callable', () => {
    const trend = computeVisibilityTrend([]);
    assert.equal(trend, 'stable');
  });

  it('analyzeCompetitorGap is exported and callable', () => {
    const gaps = analyzeCompetitorGap('site1', 'test.com', ['rival.com'], ['query1']);
    assert.ok(Array.isArray(gaps));
  });

  it('simulateSchemaOpportunities is exported and callable', () => {
    const opps = simulateSchemaOpportunities('site1', 'test.com');
    assert.ok(Array.isArray(opps));
  });

  it('generateAIVisibilityReport is exported and callable', async () => {
    const report = await generateAIVisibilityReport('site1', 'test.com');
    assert.ok(report.report_id);
    assert.equal(report.simulated, true);
  });
});
