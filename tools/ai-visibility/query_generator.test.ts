/**
 * tools/ai-visibility/query_generator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBrandedQueries,
  generateProductQueries,
  generateInformationalQueries,
  buildQuerySet,
} from './query_generator.ts';

// ── generateBrandedQueries ────────────────────────────────────────────────────

describe('generateBrandedQueries', () => {
  it('returns exactly 5 queries', () => {
    const qs = generateBrandedQueries('example.com', 'Coco Cabana');
    assert.equal(qs.length, 5);
  });

  it('first query is the brand name', () => {
    const qs = generateBrandedQueries('example.com', 'Coco Cabana');
    assert.equal(qs[0], 'Coco Cabana');
  });

  it('contains brand name in all queries', () => {
    const qs = generateBrandedQueries('example.com', 'Coco Cabana');
    for (const q of qs) {
      assert.ok(q.includes('Coco Cabana'), `query missing brand: ${q}`);
    }
  });

  it('includes reviews query', () => {
    const qs = generateBrandedQueries('example.com', 'TestBrand');
    assert.ok(qs.some(q => q.includes('reviews')));
  });

  it('includes legit query', () => {
    const qs = generateBrandedQueries('example.com', 'TestBrand');
    assert.ok(qs.some(q => q.includes('legit')));
  });

  it('never throws with empty brand', () => {
    assert.doesNotThrow(() => generateBrandedQueries('example.com', ''));
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => generateBrandedQueries(null as never, null as never));
  });
});

// ── generateProductQueries ────────────────────────────────────────────────────

describe('generateProductQueries', () => {
  it('returns up to 3 queries per keyword', () => {
    const qs = generateProductQueries('example.com', ['widget']);
    assert.ok(qs.length >= 2 && qs.length <= 3);
  });

  it('caps at 10 queries', () => {
    const keywords = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const qs = generateProductQueries('example.com', keywords);
    assert.ok(qs.length <= 10);
  });

  it('deduplicates queries', () => {
    const qs = generateProductQueries('example.com', ['widget', 'widget']);
    const unique = new Set(qs);
    assert.equal(qs.length, unique.size);
  });

  it('includes "best X" format', () => {
    const qs = generateProductQueries('example.com', ['rattan chair']);
    assert.ok(qs.some(q => q.includes('best rattan chair')));
  });

  it('includes "where to buy X" format', () => {
    const qs = generateProductQueries('example.com', ['rattan chair']);
    assert.ok(qs.some(q => q.includes('where to buy rattan chair')));
  });

  it('handles empty keyword list', () => {
    const qs = generateProductQueries('example.com', []);
    assert.equal(qs.length, 0);
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => generateProductQueries(null as never, null as never));
  });
});

// ── generateInformationalQueries ──────────────────────────────────────────────

describe('generateInformationalQueries', () => {
  it('returns exactly 5 queries', () => {
    const qs = generateInformationalQueries('example.com');
    assert.equal(qs.length, 5);
  });

  it('returns home decor queries for decor domain', () => {
    const qs = generateInformationalQueries('homedecor.com');
    assert.ok(qs.some(q => q.includes('home decor') || q.includes('decor') || q.includes('coastal') || q.includes('rattan')));
  });

  it('returns fashion queries for fashion domain', () => {
    const qs = generateInformationalQueries('fashionstore.com');
    assert.ok(qs.some(q => q.includes('fashion') || q.includes('clothing') || q.includes('wear')));
  });

  it('returns default queries for generic domain', () => {
    const qs = generateInformationalQueries('generic12345.com');
    assert.equal(qs.length, 5);
  });

  it('coco cabana domain uses home_decor category', () => {
    const qs = generateInformationalQueries('cococabanalife.com');
    assert.ok(qs.some(q => q.toLowerCase().includes('decor') || q.toLowerCase().includes('coastal') || q.toLowerCase().includes('home')));
  });

  it('never throws with null input', () => {
    assert.doesNotThrow(() => generateInformationalQueries(null as never));
  });
});

// ── buildQuerySet ─────────────────────────────────────────────────────────────

describe('buildQuerySet', () => {
  it('returns array of AIQuery objects', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand');
    assert.ok(Array.isArray(qs));
    assert.ok(qs.length > 0);
  });

  it('branded queries have priority 1', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand');
    const branded = qs.filter(q => q.category === 'branded');
    assert.ok(branded.length > 0);
    assert.ok(branded.every(q => q.priority === 1));
  });

  it('informational queries have priority 3', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand');
    const info = qs.filter(q => q.category === 'informational');
    assert.ok(info.length > 0);
    assert.ok(info.every(q => q.priority === 3));
  });

  it('no duplicate query text', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand', ['a', 'b']);
    const texts = qs.map(q => q.query);
    const unique = new Set(texts);
    assert.equal(texts.length, unique.size);
  });

  it('each query has unique query_id', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand');
    const ids = qs.map(q => q.query_id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size);
  });

  it('includes product queries when keywords provided', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand', ['rattan chair']);
    const product = qs.filter(q => q.category === 'product');
    assert.ok(product.length > 0);
  });

  it('product queries have priority 2', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand', ['widget']);
    const product = qs.filter(q => q.category === 'product');
    assert.ok(product.every(q => q.priority === 2));
  });

  it('generated_at is ISO string', () => {
    const qs = buildQuerySet('site-1', 'example.com', 'TestBrand');
    assert.ok(!isNaN(Date.parse(qs[0].generated_at)));
  });

  it('site_id set on all queries', () => {
    const qs = buildQuerySet('my-site', 'example.com', 'Brand');
    assert.ok(qs.every(q => q.site_id === 'my-site'));
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildQuerySet(null as never, null as never, null as never));
  });
});
