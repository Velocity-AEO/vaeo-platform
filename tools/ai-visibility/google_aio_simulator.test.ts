import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateGoogleAIO,
  simulateGoogleAIOBatch,
  buildAIOCitations,
} from './google_aio_simulator.js';

describe('simulateGoogleAIO', () => {
  it('returns deterministic result for same query+domain', () => {
    const a = simulateGoogleAIO('best shoes', 'example.com');
    const b = simulateGoogleAIO('best shoes', 'example.com');
    assert.equal(a.has_ai_overview, b.has_ai_overview);
    assert.equal(a.your_domain_cited, b.your_domain_cited);
  });

  it('always has simulated: true', () => {
    const r = simulateGoogleAIO('test query', 'test.com');
    assert.equal(r.simulated, true);
  });

  it('has ~75% AI overview rate across 20 queries', () => {
    const queries = Array.from({ length: 20 }, (_, i) => `query number ${i}`);
    const results = queries.map((q) => simulateGoogleAIO(q, 'test.com'));
    const withAIO = results.filter((r) => r.has_ai_overview).length;
    // Should be roughly 75% (15/20), allow 8-20 range
    assert.ok(withAIO >= 8, `Expected >=8 with AIO, got ${withAIO}`);
    assert.ok(withAIO <= 20, `Expected <=20 with AIO, got ${withAIO}`);
  });

  it('your_domain_cited only when has_ai_overview is true', () => {
    const queries = Array.from({ length: 30 }, (_, i) => `test ${i}`);
    for (const q of queries) {
      const r = simulateGoogleAIO(q, 'test.com');
      if (!r.has_ai_overview) {
        assert.equal(r.your_domain_cited, false);
      }
    }
  });

  it('cited_domains non-empty when has_ai_overview', () => {
    const queries = Array.from({ length: 20 }, (_, i) => `item ${i}`);
    for (const q of queries) {
      const r = simulateGoogleAIO(q, 'test.com');
      if (r.has_ai_overview) {
        assert.ok(r.cited_domains.length >= 3);
      }
    }
  });

  it('cited_domains includes domain when cited', () => {
    const queries = Array.from({ length: 50 }, (_, i) => `product ${i}`);
    for (const q of queries) {
      const r = simulateGoogleAIO(q, 'myshop.com');
      if (r.your_domain_cited) {
        assert.ok(r.cited_domains.includes('myshop.com'));
      }
    }
  });

  it('position_in_overview set when cited', () => {
    const queries = Array.from({ length: 50 }, (_, i) => `keyword ${i}`);
    for (const q of queries) {
      const r = simulateGoogleAIO(q, 'test.com');
      if (r.your_domain_cited) {
        assert.ok(r.position_in_overview !== undefined);
        assert.ok(r.position_in_overview! >= 1 && r.position_in_overview! <= 5);
      }
    }
  });

  it('position_in_overview undefined when not cited', () => {
    const queries = Array.from({ length: 50 }, (_, i) => `niche ${i}`);
    for (const q of queries) {
      const r = simulateGoogleAIO(q, 'test.com');
      if (!r.your_domain_cited) {
        assert.equal(r.position_in_overview, undefined);
      }
    }
  });

  it('traditional_rank between 1 and 20', () => {
    const r = simulateGoogleAIO('buy widgets', 'store.com');
    assert.ok(r.traditional_rank! >= 1);
    assert.ok(r.traditional_rank! <= 20);
  });

  it('ai_overview_text present when has_ai_overview', () => {
    const queries = Array.from({ length: 20 }, (_, i) => `topic ${i}`);
    for (const q of queries) {
      const r = simulateGoogleAIO(q, 'test.com');
      if (r.has_ai_overview) {
        assert.ok(r.ai_overview_text);
        assert.ok(r.ai_overview_text!.length > 10);
      }
    }
  });

  it('never throws on empty query', () => {
    const r = simulateGoogleAIO('', 'test.com');
    assert.equal(r.simulated, true);
  });

  it('never throws on empty domain', () => {
    const r = simulateGoogleAIO('test', '');
    assert.equal(r.simulated, true);
  });
});

describe('simulateGoogleAIOBatch', () => {
  it('result count matches query count', () => {
    const queries = ['q1', 'q2', 'q3', 'q4', 'q5'];
    const results = simulateGoogleAIOBatch('test.com', queries);
    assert.equal(results.length, 5);
  });

  it('each result has simulated: true', () => {
    const results = simulateGoogleAIOBatch('test.com', ['a', 'b']);
    for (const r of results) {
      assert.equal(r.simulated, true);
    }
  });

  it('never throws on empty queries array', () => {
    const results = simulateGoogleAIOBatch('test.com', []);
    assert.deepEqual(results, []);
  });

  it('queries match results', () => {
    const queries = ['first', 'second'];
    const results = simulateGoogleAIOBatch('test.com', queries);
    assert.equal(results[0].query, 'first');
    assert.equal(results[1].query, 'second');
  });
});

describe('buildAIOCitations', () => {
  it('source is google_ai_overview', () => {
    const aio = [simulateGoogleAIO('test', 'test.com')];
    const citations = buildAIOCitations('site1', 'test.com', aio);
    assert.equal(citations[0].source, 'google_ai_overview');
  });

  it('cited matches your_domain_cited', () => {
    const queries = Array.from({ length: 20 }, (_, i) => `check ${i}`);
    const aioResults = queries.map((q) => simulateGoogleAIO(q, 'test.com'));
    const citations = buildAIOCitations('site1', 'test.com', aioResults);
    for (let i = 0; i < aioResults.length; i++) {
      assert.equal(citations[i].cited, aioResults[i].your_domain_cited);
    }
  });

  it('confidence 0.9 when cited', () => {
    const queries = Array.from({ length: 50 }, (_, i) => `conf ${i}`);
    const aioResults = queries.map((q) => simulateGoogleAIO(q, 'test.com'));
    const citations = buildAIOCitations('site1', 'test.com', aioResults);
    for (const c of citations) {
      if (c.cited) assert.equal(c.confidence, 0.9);
      else assert.equal(c.confidence, 0.05);
    }
  });

  it('never throws on empty array', () => {
    const citations = buildAIOCitations('site1', 'test.com', []);
    assert.deepEqual(citations, []);
  });
});
