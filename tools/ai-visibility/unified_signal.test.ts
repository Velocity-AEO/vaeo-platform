import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedSignal, generateUnifiedReport } from './unified_signal.js';
import { buildCitation, type AICitation } from './citation.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCitation(source: 'perplexity' | 'google_ai_overview', cited: boolean): AICitation {
  return buildCitation('site1', {
    url: 'https://test.com/', domain: 'test.com', query: 'test query',
    source, cited, confidence: cited ? 0.9 : 0.05,
    query_category: 'informational', is_branded: false, is_competitor: false,
  });
}

// ── buildUnifiedSignal ──────────────────────────────────────────────────────

describe('buildUnifiedSignal', () => {
  it('sets signal_id as UUID', () => {
    const signal = buildUnifiedSignal('site1', 'test.com', [], []);
    assert.ok(signal.signal_id);
    assert.match(signal.signal_id, /^[0-9a-f-]{36}$/);
  });

  it('sets site_id and domain', () => {
    const signal = buildUnifiedSignal('site1', 'test.com', [], []);
    assert.equal(signal.site_id, 'site1');
    assert.equal(signal.domain, 'test.com');
  });

  it('perplexity_citation_rate correct', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', false)];
    const signal = buildUnifiedSignal('site1', 'test.com', p, []);
    assert.equal(signal.perplexity_citation_rate, 0.5);
  });

  it('google_aio_citation_rate correct', () => {
    const g = [makeCitation('google_ai_overview', true), makeCitation('google_ai_overview', true), makeCitation('google_ai_overview', false)];
    const signal = buildUnifiedSignal('site1', 'test.com', [], g);
    assert.ok(Math.abs(signal.google_aio_citation_rate - 2/3) < 0.01);
  });

  it('combined_citation_rate is mean of both rates', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', false)]; // 0.5
    const g = [makeCitation('google_ai_overview', true), makeCitation('google_ai_overview', false), makeCitation('google_ai_overview', false)]; // 0.333
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    const expected = (0.5 + 1/3) / 2;
    assert.ok(Math.abs(signal.combined_citation_rate - expected) < 0.01);
  });

  it('combined_score is 0-100', () => {
    const p = [makeCitation('perplexity', true)];
    const g = [makeCitation('google_ai_overview', true)];
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    assert.ok(signal.combined_score >= 0);
    assert.ok(signal.combined_score <= 100);
  });

  it('total_citations counts cited only', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', false)];
    const g = [makeCitation('google_ai_overview', true)];
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    assert.equal(signal.total_citations, 2);
  });

  it('total_queries counts all citations', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', false)];
    const g = [makeCitation('google_ai_overview', true)];
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    assert.equal(signal.total_queries, 3);
  });

  it('citations_by_source counts correct', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', true)];
    const g = [makeCitation('google_ai_overview', true)];
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    assert.equal(signal.citations_by_source.perplexity, 2);
    assert.equal(signal.citations_by_source.google_ai_overview, 1);
  });

  it('strongest_source is source with higher rate', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', true)]; // 100%
    const g = [makeCitation('google_ai_overview', false)]; // 0%
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    assert.equal(signal.strongest_source, 'perplexity');
  });

  it('weakest_source is source with lower rate', () => {
    const p = [makeCitation('perplexity', true), makeCitation('perplexity', true)]; // 100%
    const g = [makeCitation('google_ai_overview', false)]; // 0%
    const signal = buildUnifiedSignal('site1', 'test.com', p, g);
    assert.equal(signal.weakest_source, 'google_ai_overview');
  });

  it('computed_at is ISO string', () => {
    const signal = buildUnifiedSignal('site1', 'test.com', [], []);
    assert.ok(!isNaN(Date.parse(signal.computed_at)));
  });

  it('empty citations yield zero scores', () => {
    const signal = buildUnifiedSignal('site1', 'test.com', [], []);
    assert.equal(signal.combined_score, 0);
    assert.equal(signal.total_citations, 0);
    assert.equal(signal.combined_citation_rate, 0);
  });

  it('never throws on null inputs', () => {
    const signal = buildUnifiedSignal('', '', null as unknown as AICitation[], null as unknown as AICitation[]);
    assert.ok(signal);
    assert.equal(typeof signal.combined_score, 'number');
  });
});

// ── generateUnifiedReport ───────────────────────────────────────────────────

describe('generateUnifiedReport', () => {
  it('returns correct shape', async () => {
    const report = await generateUnifiedReport('site1', 'test.com');
    assert.ok(report.signal);
    assert.ok(report.summary);
    assert.ok(Array.isArray(report.perplexity_citations));
    assert.ok(Array.isArray(report.google_citations));
    assert.ok(Array.isArray(report.all_citations));
  });

  it('all_citations = perplexity + google', async () => {
    const report = await generateUnifiedReport('site1', 'test.com');
    assert.equal(report.all_citations.length, report.perplexity_citations.length + report.google_citations.length);
  });

  it('runs both simulators (both arrays non-empty)', async () => {
    const report = await generateUnifiedReport('site1', 'test.com', 'TestBrand', ['shoes', 'bags']);
    assert.ok(report.perplexity_citations.length > 0);
    assert.ok(report.google_citations.length > 0);
  });

  it('signal has correct site_id', async () => {
    const report = await generateUnifiedReport('my-site', 'myshop.com');
    assert.equal(report.signal.site_id, 'my-site');
  });

  it('summary has correct domain', async () => {
    const report = await generateUnifiedReport('site1', 'myshop.com');
    assert.equal(report.summary.domain, 'myshop.com');
  });

  it('never throws on empty domain', async () => {
    const report = await generateUnifiedReport('site1', '');
    assert.ok(report);
    assert.ok(report.signal);
  });

  it('product_keywords increase query count', async () => {
    const noKw = await generateUnifiedReport('site1', 'test.com');
    const withKw = await generateUnifiedReport('site1', 'test.com', 'Test', ['widget', 'gadget', 'tool']);
    assert.ok(withKw.all_citations.length >= noKw.all_citations.length);
  });

  it('perplexity citations have source perplexity', async () => {
    const report = await generateUnifiedReport('site1', 'test.com');
    for (const c of report.perplexity_citations) {
      assert.equal(c.source, 'perplexity');
    }
  });

  it('google citations have source google_ai_overview', async () => {
    const report = await generateUnifiedReport('site1', 'test.com');
    for (const c of report.google_citations) {
      assert.equal(c.source, 'google_ai_overview');
    }
  });
});
