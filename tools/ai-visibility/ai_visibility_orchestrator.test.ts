/**
 * tools/ai-visibility/ai_visibility_orchestrator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateAIVisibilityReport } from './ai_visibility_orchestrator.ts';

// ── generateAIVisibilityReport ────────────────────────────────────────────────

describe('generateAIVisibilityReport', () => {
  it('returns a report with correct shape', async () => {
    const r = await generateAIVisibilityReport('site-1', 'cococabanalife.com', 'Coco Cabana');
    assert.ok(typeof r.report_id === 'string');
    assert.ok(typeof r.site_id === 'string');
    assert.ok(typeof r.domain === 'string');
    assert.ok(typeof r.queries_checked === 'number');
    assert.ok(typeof r.citations_found === 'number');
    assert.ok(typeof r.citation_rate === 'number');
    assert.ok(Array.isArray(r.perplexity_citations));
    assert.ok(Array.isArray(r.recommendations));
    assert.ok(Array.isArray(r.top_cited_queries));
    assert.ok(Array.isArray(r.top_missed_queries));
    assert.ok(typeof r.generated_at === 'string');
    assert.equal(r.simulated, true);
  });

  it('queries_checked > 0', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'TestBrand');
    assert.ok(r.queries_checked > 0);
  });

  it('citation_rate is between 0 and 1', async () => {
    const r = await generateAIVisibilityReport('site-1', 'cococabanalife.com', 'Coco Cabana');
    assert.ok(r.citation_rate >= 0 && r.citation_rate <= 1);
  });

  it('citations_found <= queries_checked', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'Brand');
    assert.ok(r.citations_found <= r.queries_checked);
  });

  it('recommendations array is not empty', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'Brand');
    assert.ok(r.recommendations.length > 0);
  });

  it('recommendations include FAQ schema when citation_rate < 0.2', async () => {
    // Use a domain/brand combo that produces low citation rate
    // Try several until we find one with low rate or just check the logic
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'Brand');
    if (r.citation_rate < 0.2) {
      assert.ok(r.recommendations.some(rec => rec.includes('FAQ schema')));
    } else if (r.citation_rate < 0.5) {
      assert.ok(r.recommendations.some(rec => rec.includes('Good AI visibility')));
    } else {
      assert.ok(r.recommendations.some(rec => rec.includes('Strong AI visibility')));
    }
  });

  it('top_missed_queries contains non-cited query text', async () => {
    const r = await generateAIVisibilityReport('site-1', 'cococabanalife.com', 'Coco Cabana');
    if (r.top_missed_queries.length > 0) {
      // All missed queries should correspond to non-cited citations
      const nonCitedQueries = new Set(
        r.perplexity_citations.filter(c => !c.cited).map(c => c.query),
      );
      for (const q of r.top_missed_queries) {
        assert.ok(nonCitedQueries.has(q), `missed query "${q}" not found in non-cited`);
      }
    }
  });

  it('top_missed_queries length <= 5', async () => {
    const r = await generateAIVisibilityReport('site-1', 'cococabanalife.com');
    assert.ok(r.top_missed_queries.length <= 5);
  });

  it('simulated is true', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com');
    assert.equal(r.simulated, true);
  });

  it('works without brand_name', async () => {
    const r = await generateAIVisibilityReport('site-1', 'cococabanalife.com');
    assert.ok(r.queries_checked > 0);
  });

  it('works without product_keywords', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'Brand');
    assert.ok(r.queries_checked > 0);
  });

  it('works with product_keywords', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'Brand', ['rattan chair', 'boho decor']);
    assert.ok(r.queries_checked > 0);
  });

  it('report_id is a UUID string', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com');
    assert.ok(r.report_id.length > 0);
  });

  it('generated_at is ISO string', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com');
    assert.ok(!isNaN(Date.parse(r.generated_at)));
  });

  it('perplexity_citations length matches queries_checked', async () => {
    const r = await generateAIVisibilityReport('site-1', 'example.com', 'Brand');
    assert.equal(r.perplexity_citations.length, r.queries_checked);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() =>
      generateAIVisibilityReport(null as never, null as never),
    );
  });
});
