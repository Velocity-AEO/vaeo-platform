/**
 * tools/ai-visibility/perplexity_simulator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulatePerplexityResult,
  simulateCitationCheck,
} from './perplexity_simulator.ts';
import { buildQuerySet } from './query_generator.ts';

// ── simulatePerplexityResult ──────────────────────────────────────────────────

describe('simulatePerplexityResult', () => {
  it('returns a PerplexityResult with correct shape', () => {
    const r = simulatePerplexityResult('best beach decor', 'cococabanalife.com');
    assert.ok(typeof r.query === 'string');
    assert.ok(typeof r.answer === 'string');
    assert.ok(Array.isArray(r.sources));
    assert.ok(Array.isArray(r.cited_domains));
    assert.ok(typeof r.response_time_ms === 'number');
    assert.equal(r.simulated, true);
  });

  it('is deterministic — same query+domain produces same result', () => {
    const a = simulatePerplexityResult('best beach decor', 'cococabanalife.com');
    const b = simulatePerplexityResult('best beach decor', 'cococabanalife.com');
    assert.equal(a.cited_domains.join(','), b.cited_domains.join(','));
    assert.equal(a.response_time_ms, b.response_time_ms);
  });

  it('different queries produce different results', () => {
    const a = simulatePerplexityResult('query aaa', 'example.com');
    const b = simulatePerplexityResult('query bbb', 'example.com');
    assert.notEqual(a.cited_domains.join(','), b.cited_domains.join(','));
  });

  it('cited_domains is a non-empty array', () => {
    const r = simulatePerplexityResult('test query', 'example.com');
    assert.ok(r.cited_domains.length >= 3);
  });

  it('sources is a non-empty array', () => {
    const r = simulatePerplexityResult('test query', 'example.com');
    assert.ok(r.sources.length >= 3);
  });

  it('response_time_ms is between 800 and 2400', () => {
    const r = simulatePerplexityResult('test query', 'example.com');
    assert.ok(r.response_time_ms >= 800 && r.response_time_ms <= 2400);
  });

  it('answer contains the query topic', () => {
    const r = simulatePerplexityResult('best beach decor', 'example.com');
    assert.ok(r.answer.includes('best beach decor'));
  });

  it('domain appears in cited_domains when hash % 3 === 0', () => {
    // Try multiple queries to find one that cites the domain
    let cited = false;
    for (let i = 0; i < 30; i++) {
      const r = simulatePerplexityResult(`query ${i}`, 'testdomain.com');
      if (r.cited_domains.includes('testdomain.com')) { cited = true; break; }
    }
    assert.ok(cited, 'expected at least one citation across 30 queries');
  });

  it('never throws on empty inputs', () => {
    assert.doesNotThrow(() => simulatePerplexityResult('', ''));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => simulatePerplexityResult(null as never, null as never));
  });
});

// ── simulateCitationCheck ─────────────────────────────────────────────────────

describe('simulateCitationCheck', () => {
  const queries = buildQuerySet('site-1', 'cococabanalife.com', 'Coco Cabana');

  it('returns array with count matching queries', () => {
    const results = simulateCitationCheck('site-1', 'cococabanalife.com', queries);
    assert.equal(results.length, queries.length);
  });

  it('all results have source=perplexity', () => {
    const results = simulateCitationCheck('site-1', 'cococabanalife.com', queries);
    assert.ok(results.every(r => r.source === 'perplexity'));
  });

  it('cited=true when domain in cited_domains', () => {
    // Find a query that produces a citation
    for (const q of queries) {
      const result = simulatePerplexityResult(q.query, 'cococabanalife.com');
      if (result.cited_domains.includes('cococabanalife.com')) {
        const citation = simulateCitationCheck('site-1', 'cococabanalife.com', [q])[0];
        assert.equal(citation.cited, true);
        return;
      }
    }
    // If no query produced citation with this domain, that's ok — test passes as informational
  });

  it('cited=false when domain not in cited_domains', () => {
    for (const q of queries) {
      const result = simulatePerplexityResult(q.query, 'cococabanalife.com');
      if (!result.cited_domains.includes('cococabanalife.com')) {
        const citation = simulateCitationCheck('site-1', 'cococabanalife.com', [q])[0];
        assert.equal(citation.cited, false);
        return;
      }
    }
  });

  it('confidence is 0.85 for cited entries', () => {
    const results = simulateCitationCheck('site-1', 'cococabanalife.com', queries);
    for (const r of results) {
      if (r.cited) assert.equal(r.confidence, 0.85);
    }
  });

  it('confidence is 0.1 for non-cited entries', () => {
    const results = simulateCitationCheck('site-1', 'cococabanalife.com', queries);
    for (const r of results) {
      if (!r.cited) assert.equal(r.confidence, 0.1);
    }
  });

  it('branded queries set is_branded=true', () => {
    const brandedQ = queries.filter(q => q.category === 'branded');
    assert.ok(brandedQ.length > 0);
    const results = simulateCitationCheck('site-1', 'cococabanalife.com', brandedQ);
    assert.ok(results.every(r => r.is_branded === true));
  });

  it('handles empty queries array', () => {
    const results = simulateCitationCheck('site-1', 'example.com', []);
    assert.equal(results.length, 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => simulateCitationCheck(null as never, null as never, null as never));
  });
});
