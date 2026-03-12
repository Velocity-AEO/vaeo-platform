/**
 * tools/ai-visibility/citation.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCitation, buildCitationSummary } from './citation.ts';
import type { AICitation } from './citation.ts';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCitation(overrides: Partial<Omit<AICitation, 'citation_id' | 'site_id' | 'detected_at'>> = {}): AICitation {
  return buildCitation('site-1', {
    url:            'https://example.com/products/widget',
    domain:         'example.com',
    query:          'best widgets',
    source:         'perplexity',
    cited:          true,
    confidence:     0.85,
    query_category: 'product',
    is_branded:     false,
    is_competitor:  false,
    ...overrides,
  });
}

// ── buildCitation ─────────────────────────────────────────────────────────────

describe('buildCitation', () => {
  it('sets site_id', () => {
    const c = makeCitation();
    assert.equal(c.site_id, 'site-1');
  });

  it('sets citation_id as a string', () => {
    const c = makeCitation();
    assert.ok(typeof c.citation_id === 'string' && c.citation_id.length > 0);
  });

  it('sets detected_at as ISO string', () => {
    const c = makeCitation();
    assert.ok(!isNaN(Date.parse(c.detected_at)));
  });

  it('passes through cited field', () => {
    const c = makeCitation({ cited: true });
    assert.equal(c.cited, true);
  });

  it('passes through source field', () => {
    const c = makeCitation({ source: 'chatgpt' });
    assert.equal(c.source, 'chatgpt');
  });

  it('passes through query field', () => {
    const c = makeCitation({ query: 'my test query' });
    assert.equal(c.query, 'my test query');
  });

  it('passes through is_branded field', () => {
    const c = makeCitation({ is_branded: true });
    assert.equal(c.is_branded, true);
  });

  it('passes through optional position', () => {
    const c = makeCitation({ position: 2 });
    assert.equal(c.position, 2);
  });

  it('passes through optional snippet', () => {
    const c = makeCitation({ snippet: 'some text' });
    assert.equal(c.snippet, 'some text');
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildCitation(null as never, null as never));
  });
});

// ── buildCitationSummary ──────────────────────────────────────────────────────

describe('buildCitationSummary', () => {
  const citations: AICitation[] = [
    makeCitation({ cited: true,  source: 'perplexity',        query: 'q1', url: 'https://example.com/a', is_branded: true }),
    makeCitation({ cited: true,  source: 'perplexity',        query: 'q2', url: 'https://example.com/a', is_branded: false }),
    makeCitation({ cited: false, source: 'google_ai_overview',query: 'q3', url: 'https://example.com/b', is_branded: true }),
    makeCitation({ cited: true,  source: 'chatgpt',           query: 'q1', url: 'https://example.com/b', is_branded: false }),
    makeCitation({ cited: false, source: 'bing_copilot',      query: 'q4', url: 'https://example.com/c', is_branded: false }),
    makeCitation({ cited: true,  source: 'perplexity',        query: 'q5', url: 'https://example.com/c', is_branded: true }),
  ];

  it('total_queries_checked = all citations length', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.equal(s.total_queries_checked, 6);
  });

  it('total_citations = count of cited=true', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.equal(s.total_citations, 4);
  });

  it('citation_rate = 4/6', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.ok(Math.abs(s.citation_rate - 4/6) < 0.001);
  });

  it('by_source counts perplexity correctly', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.equal(s.by_source['perplexity'], 3);
  });

  it('by_source counts chatgpt correctly', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.equal(s.by_source['chatgpt'], 1);
  });

  it('by_source counts uncited sources as 0', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.equal(s.by_source['bing_copilot'], 0);
  });

  it('branded_citation_rate: 2 branded total, 2 branded cited', () => {
    // branded: q1(cited), q3(not cited), q5(cited) → 3 branded, 2 cited
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.ok(Math.abs(s.branded_citation_rate - 2/3) < 0.001);
  });

  it('top_cited_urls length <= 5', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.ok(s.top_cited_urls.length <= 5);
  });

  it('top_cited_urls includes most cited URL', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.ok(s.top_cited_urls.includes('https://example.com/a'));
  });

  it('top_cited_queries length <= 5', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.ok(s.top_cited_queries.length <= 5);
  });

  it('top_cited_queries includes q1 (cited twice)', () => {
    const s = buildCitationSummary('site-1', 'example.com', citations);
    assert.ok(s.top_cited_queries.includes('q1'));
  });

  it('handles empty citations array', () => {
    const s = buildCitationSummary('site-1', 'example.com', []);
    assert.equal(s.total_citations, 0);
    assert.equal(s.citation_rate, 0);
  });

  it('computed_at is ISO string', () => {
    const s = buildCitationSummary('site-1', 'example.com', []);
    assert.ok(!isNaN(Date.parse(s.computed_at)));
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildCitationSummary(null as never, null as never, null as never));
  });
});
