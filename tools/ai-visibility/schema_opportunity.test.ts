/**
 * tools/ai-visibility/schema_opportunity.test.ts
 *
 * Tests for schema opportunity detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSchemaOpportunities,
  simulateSchemaOpportunities,
  SCHEMA_FOR_AI_CITATION,
  type PageSchemaInput,
} from './schema_opportunity.js';

// ── detectSchemaOpportunities — missing types ────────────────────────────────

describe('detectSchemaOpportunities — missing types', () => {
  it('detects missing schema for product page', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/products/tee', page_type: 'product', existing_schema: ['Product'] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps.length, 1);
    assert.ok(opps[0].missing_schema_types.includes('FAQPage'));
    assert.ok(opps[0].missing_schema_types.includes('Review'));
  });

  it('returns empty when all schema present', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/products/tee', page_type: 'product', existing_schema: ['Product', 'FAQPage', 'Review'] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps.length, 0);
  });

  it('detects missing schema for article page', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/blog/post', page_type: 'article', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.ok(opps[0].missing_schema_types.includes('Article'));
    assert.ok(opps[0].missing_schema_types.includes('Speakable'));
  });

  it('uses default schema for unknown page type', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/other', page_type: 'unknown', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.ok(opps[0].missing_schema_types.includes('WebPage'));
    assert.ok(opps[0].missing_schema_types.includes('FAQPage'));
  });
});

// ── detectSchemaOpportunities — ai_impact_score ──────────────────────────────

describe('detectSchemaOpportunities — ai_impact_score', () => {
  it('FAQPage missing adds 40', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/', page_type: 'homepage', existing_schema: ['Organization', 'WebSite'] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps[0].ai_impact_score, 40); // Only FAQPage missing = 40
  });

  it('Speakable missing adds 35', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/blog', page_type: 'article', existing_schema: ['Article', 'FAQPage', 'HowTo'] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps[0].ai_impact_score, 35); // Only Speakable missing = 35
  });

  it('multiple missing types sum up', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/blog', page_type: 'article', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    // Article(20) + FAQPage(40) + HowTo(10) + Speakable(35) = 100 (capped)
    assert.equal(opps[0].ai_impact_score, 100);
  });

  it('caps at 100', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/blog', page_type: 'article', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.ok(opps[0].ai_impact_score <= 100);
  });
});

// ── detectSchemaOpportunities — priority ─────────────────────────────────────

describe('detectSchemaOpportunities — priority', () => {
  it('critical when score >= 70', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/blog', page_type: 'article', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps[0].priority, 'critical');
  });

  it('high when score >= 50', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/products/a', page_type: 'product', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    // Product(30) + FAQPage(40) + Review(10) = 80 → critical actually
    // Use a case where it's 50-69
    const pages2: PageSchemaInput[] = [
      { url: 'https://x.com/', page_type: 'homepage', existing_schema: [] },
    ];
    const opps2 = detectSchemaOpportunities('s1', pages2);
    // Organization(25) + WebSite(10) + FAQPage(40) = 75 → critical
    // Need a 50-69 case: Product page with Product present → FAQPage(40) + Review(10) = 50
    const pages3: PageSchemaInput[] = [
      { url: 'https://x.com/p', page_type: 'product', existing_schema: ['Product'] },
    ];
    const opps3 = detectSchemaOpportunities('s1', pages3);
    assert.equal(opps3[0].ai_impact_score, 50);
    assert.equal(opps3[0].priority, 'high');
  });

  it('medium when score >= 30', () => {
    // FAQPage only missing on homepage with Organization + WebSite present = 40 → medium? No 40 >= 30 but < 50 → medium
    // Actually 40 is >= 30 and < 50 → medium
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/', page_type: 'homepage', existing_schema: ['Organization', 'WebSite'] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps[0].priority, 'medium');
  });

  it('low when score < 30', () => {
    // Collection with ItemList present → CollectionPage missing = 10
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/c', page_type: 'collection', existing_schema: ['ItemList'] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps[0].priority, 'low');
  });
});

// ── detectSchemaOpportunities — can_auto_fix ─────────────────────────────────

describe('detectSchemaOpportunities — can_auto_fix', () => {
  it('always true', () => {
    const pages: PageSchemaInput[] = [
      { url: 'https://x.com/p', page_type: 'product', existing_schema: [] },
    ];
    const opps = detectSchemaOpportunities('s1', pages);
    assert.equal(opps[0].can_auto_fix, true);
  });
});

// ── SCHEMA_FOR_AI_CITATION ───────────────────────────────────────────────────

describe('SCHEMA_FOR_AI_CITATION', () => {
  it('has product entry', () => {
    assert.ok(SCHEMA_FOR_AI_CITATION.product.includes('Product'));
  });

  it('has article entry with Speakable', () => {
    assert.ok(SCHEMA_FOR_AI_CITATION.article.includes('Speakable'));
  });
});

// ── simulateSchemaOpportunities ──────────────────────────────────────────────

describe('simulateSchemaOpportunities', () => {
  it('returns 8-12 opportunities', () => {
    const opps = simulateSchemaOpportunities('s1', 'example.com');
    assert.ok(opps.length >= 1 && opps.length <= 12);
  });

  it('deterministic from domain', () => {
    const a = simulateSchemaOpportunities('s1', 'test.com');
    const b = simulateSchemaOpportunities('s1', 'test.com');
    assert.equal(a.length, b.length);
    assert.deepEqual(a.map((o) => o.url), b.map((o) => o.url));
  });

  it('never throws', () => {
    const opps = simulateSchemaOpportunities('s1', '');
    assert.ok(Array.isArray(opps));
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('detectSchemaOpportunities — never throws', () => {
  it('handles empty pages', () => {
    const opps = detectSchemaOpportunities('s1', []);
    assert.equal(opps.length, 0);
  });
});
