/**
 * tools/stats/fix_history.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixHistoryEntry, buildFixHistory, simulateFixHistory } from './fix_history.ts';

// ── buildFixHistoryEntry ──────────────────────────────────────────────────────

describe('buildFixHistoryEntry', () => {
  it('maps title_missing → Title Tag Added', () => {
    const e = buildFixHistoryEntry('s', 'https://example.com/', 'title_missing', 'before', 'after');
    assert.equal(e.fix_label, 'Title Tag Added');
  });

  it('maps meta_description_missing → Meta Description Added', () => {
    const e = buildFixHistoryEntry('s', 'u', 'meta_description_missing', 'b', 'a');
    assert.equal(e.fix_label, 'Meta Description Added');
  });

  it('maps schema_missing → Schema Markup Added', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.equal(e.fix_label, 'Schema Markup Added');
  });

  it('maps image_alt_missing → Image Alt Text Added', () => {
    const e = buildFixHistoryEntry('s', 'u', 'image_alt_missing', 'b', 'a');
    assert.equal(e.fix_label, 'Image Alt Text Added');
  });

  it('maps canonical_missing → Canonical URL Added', () => {
    const e = buildFixHistoryEntry('s', 'u', 'canonical_missing', 'b', 'a');
    assert.equal(e.fix_label, 'Canonical URL Added');
  });

  it('maps lang_missing → Language Attribute Added', () => {
    const e = buildFixHistoryEntry('s', 'u', 'lang_missing', 'b', 'a');
    assert.equal(e.fix_label, 'Language Attribute Added');
  });

  it('titlecases unknown fix_type', () => {
    const e = buildFixHistoryEntry('s', 'u', 'some_fix_type', 'b', 'a');
    assert.equal(e.fix_label, 'Some Fix Type');
  });

  it('page_type is homepage for root URL', () => {
    const e = buildFixHistoryEntry('s', 'https://example.com/', 'title_missing', 'b', 'a');
    assert.equal(e.page_type, 'homepage');
  });

  it('page_type is product for /products/ URL', () => {
    const e = buildFixHistoryEntry('s', 'https://example.com/products/widget', 'title_missing', 'b', 'a');
    assert.equal(e.page_type, 'product');
  });

  it('page_type is collection for /collections/ URL', () => {
    const e = buildFixHistoryEntry('s', 'https://example.com/collections/all', 'title_missing', 'b', 'a');
    assert.equal(e.page_type, 'collection');
  });

  it('page_type is blog for /blogs/ URL', () => {
    const e = buildFixHistoryEntry('s', 'https://example.com/blogs/news/post', 'title_missing', 'b', 'a');
    assert.equal(e.page_type, 'blog');
  });

  it('page_type is page for /pages/ URL', () => {
    const e = buildFixHistoryEntry('s', 'https://example.com/pages/about', 'title_missing', 'b', 'a');
    assert.equal(e.page_type, 'page');
  });

  it('health_score_impact is between 1 and 5', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.ok(e.health_score_impact >= 1 && e.health_score_impact <= 5);
  });

  it('approved_by is auto', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.equal(e.approved_by, 'auto');
  });

  it('sandbox_passed is true', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.equal(e.sandbox_passed, true);
  });

  it('verified is true', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.equal(e.verified, true);
  });

  it('fix_id is a string', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.ok(typeof e.fix_id === 'string' && e.fix_id.length > 0);
  });

  it('applied_at is ISO string', () => {
    const e = buildFixHistoryEntry('s', 'u', 'schema_missing', 'b', 'a');
    assert.ok(!isNaN(Date.parse(e.applied_at)));
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildFixHistoryEntry(null as never, null as never, null as never, null as never, null as never));
  });
});

// ── buildFixHistory ───────────────────────────────────────────────────────────

describe('buildFixHistory', () => {
  const entries = [
    buildFixHistoryEntry('s', 'https://example.com/', 'title_missing', 'b', 'a'),
    buildFixHistoryEntry('s', 'https://example.com/products/x', 'schema_missing', 'b', 'a'),
    buildFixHistoryEntry('s', 'https://example.com/products/y', 'title_missing', 'b', 'a'),
  ];

  it('total_fixes is correct', () => {
    const h = buildFixHistory('s', entries);
    assert.equal(h.total_fixes, 3);
  });

  it('by_fix_type counts correctly', () => {
    const h = buildFixHistory('s', entries);
    assert.equal(h.by_fix_type['title_missing'], 2);
    assert.equal(h.by_fix_type['schema_missing'], 1);
  });

  it('by_page_type counts correctly', () => {
    const h = buildFixHistory('s', entries);
    assert.equal(h.by_page_type['homepage'], 1);
    assert.equal(h.by_page_type['product'], 2);
  });

  it('auto_approved_pct is 100 when all auto', () => {
    const h = buildFixHistory('s', entries);
    assert.equal(h.auto_approved_pct, 100);
  });

  it('sandbox_pass_pct is 100 when all passed', () => {
    const h = buildFixHistory('s', entries);
    assert.equal(h.sandbox_pass_pct, 100);
  });

  it('avg_health_impact is a number > 0', () => {
    const h = buildFixHistory('s', entries);
    assert.ok(h.avg_health_impact > 0);
  });

  it('generated_at is ISO string', () => {
    const h = buildFixHistory('s', entries);
    assert.ok(!isNaN(Date.parse(h.generated_at)));
  });

  it('handles empty entries', () => {
    const h = buildFixHistory('s', []);
    assert.equal(h.total_fixes, 0);
    assert.equal(h.avg_health_impact, 0);
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildFixHistory(null as never, null as never));
  });
});

// ── simulateFixHistory ────────────────────────────────────────────────────────

describe('simulateFixHistory', () => {
  it('returns correct entry count (default 30)', () => {
    const h = simulateFixHistory('site-1', 'example.com');
    assert.equal(h.total_fixes, 30);
  });

  it('respects custom entry_count', () => {
    const h = simulateFixHistory('site-1', 'example.com', 10);
    assert.equal(h.total_fixes, 10);
  });

  it('most recent entries have smaller daysAgo (first entry is most recent)', () => {
    const h = simulateFixHistory('site-1', 'example.com', 5);
    const dates = h.entries.map(e => new Date(e.applied_at).getTime());
    assert.ok(dates[0] >= dates[dates.length - 1]);
  });

  it('by_fix_type has multiple types', () => {
    const h = simulateFixHistory('site-1', 'example.com', 30);
    assert.ok(Object.keys(h.by_fix_type).length > 1);
  });

  it('avg_health_impact is between 1 and 5', () => {
    const h = simulateFixHistory('site-1', 'example.com', 20);
    assert.ok(h.avg_health_impact >= 1 && h.avg_health_impact <= 5);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => simulateFixHistory(null as never, null as never));
  });
});
