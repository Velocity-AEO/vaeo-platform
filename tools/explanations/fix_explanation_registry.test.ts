/**
 * tools/explanations/fix_explanation_registry.test.ts
 *
 * Tests for fix explanation registry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_EXPLANATION_REGISTRY,
  getFixExplanation,
  getExplanationsByCategory,
  type FixExplanation,
} from './fix_explanation_registry.js';

// ── getFixExplanation — specific types ───────────────────────────────────────

describe('getFixExplanation', () => {
  it('returns correct explanation for SPEAKABLE_MISSING', () => {
    const e = getFixExplanation('SPEAKABLE_MISSING');
    assert.equal(e.short_label, 'Speakable Schema Added');
    assert.ok(e.what_we_did.includes('speakable schema'));
  });

  it('SPEAKABLE_MISSING category is aeo', () => {
    const e = getFixExplanation('SPEAKABLE_MISSING');
    assert.equal(e.category, 'aeo');
  });

  it('returns correct explanation for SCHEMA_MISSING', () => {
    const e = getFixExplanation('SCHEMA_MISSING');
    assert.equal(e.short_label, 'Schema Markup Added');
    assert.equal(e.category, 'seo');
  });

  it('returns correct for TITLE_MISSING', () => {
    const e = getFixExplanation('TITLE_MISSING');
    assert.equal(e.short_label, 'Title Tag Added');
    assert.ok(e.what_we_did.includes('title tag'));
  });

  it('returns correct for TITLE_LONG', () => {
    const e = getFixExplanation('TITLE_LONG');
    assert.equal(e.short_label, 'Title Tag Shortened');
  });

  it('returns correct for TITLE_SHORT', () => {
    const e = getFixExplanation('TITLE_SHORT');
    assert.equal(e.short_label, 'Title Tag Expanded');
  });

  it('returns correct for META_DESC_MISSING', () => {
    const e = getFixExplanation('META_DESC_MISSING');
    assert.equal(e.short_label, 'Meta Description Added');
    assert.ok(e.why_it_matters.includes('click-through'));
  });

  it('returns correct for CANONICAL_MISSING', () => {
    const e = getFixExplanation('CANONICAL_MISSING');
    assert.equal(e.short_label, 'Canonical Tag Added');
    assert.equal(e.category, 'technical');
  });

  it('returns correct for CANONICAL_WRONG', () => {
    const e = getFixExplanation('CANONICAL_WRONG');
    assert.equal(e.short_label, 'Canonical Tag Corrected');
  });

  it('returns correct for OG_MISSING', () => {
    const e = getFixExplanation('OG_MISSING');
    assert.equal(e.short_label, 'Open Graph Tags Added');
    assert.equal(e.category, 'social');
  });

  it('returns correct for ALT_MISSING', () => {
    const e = getFixExplanation('ALT_MISSING');
    assert.equal(e.short_label, 'Image Alt Text Added');
    assert.equal(e.category, 'accessibility');
  });

  it('returns correct for ROBOTS_NOINDEX', () => {
    const e = getFixExplanation('ROBOTS_NOINDEX');
    assert.equal(e.short_label, 'Noindex Directive Removed');
    assert.equal(e.category, 'technical');
  });

  it('returns correct for SCHEMA_INVALID', () => {
    const e = getFixExplanation('SCHEMA_INVALID');
    assert.equal(e.short_label, 'Schema Markup Fixed');
  });

  it('returns generic for unknown type', () => {
    const e = getFixExplanation('TOTALLY_UNKNOWN_TYPE');
    assert.equal(e.short_label, 'SEO Fix Applied');
    assert.equal(e.category, 'seo');
  });

  it('generic explanation has all required fields', () => {
    const e = getFixExplanation('UNKNOWN');
    assert.ok(e.issue_type);
    assert.ok(e.short_label);
    assert.ok(e.what_we_did);
    assert.ok(e.why_it_matters);
    assert.ok(e.expected_impact);
    assert.ok(e.category);
  });

  it('is case-insensitive', () => {
    const e = getFixExplanation('speakable_missing');
    assert.equal(e.short_label, 'Speakable Schema Added');
  });

  it('never throws for unknown issue_type', () => {
    assert.doesNotThrow(() => getFixExplanation('XYZZY'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getFixExplanation(null as any));
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => getFixExplanation(undefined as any));
  });
});

// ── getExplanationsByCategory ────────────────────────────────────────────────

describe('getExplanationsByCategory', () => {
  it('returns aeo types', () => {
    const aeo = getExplanationsByCategory('aeo');
    assert.ok(aeo.length > 0);
    assert.ok(aeo.every(e => e.category === 'aeo'));
    assert.ok(aeo.some(e => e.issue_type === 'SPEAKABLE_MISSING'));
  });

  it('returns seo types', () => {
    const seo = getExplanationsByCategory('seo');
    assert.ok(seo.length > 0);
    assert.ok(seo.every(e => e.category === 'seo'));
    assert.ok(seo.some(e => e.issue_type === 'TITLE_MISSING'));
  });

  it('returns technical types', () => {
    const tech = getExplanationsByCategory('technical');
    assert.ok(tech.length > 0);
    assert.ok(tech.some(e => e.issue_type === 'CANONICAL_MISSING'));
  });

  it('returns accessibility types', () => {
    const acc = getExplanationsByCategory('accessibility');
    assert.ok(acc.length > 0);
    assert.ok(acc.some(e => e.issue_type === 'ALT_MISSING'));
  });

  it('returns social types', () => {
    const soc = getExplanationsByCategory('social');
    assert.ok(soc.length > 0);
    assert.ok(soc.some(e => e.issue_type === 'OG_MISSING'));
  });

  it('returns empty for unknown category', () => {
    const result = getExplanationsByCategory('nonsense' as any);
    assert.equal(result.length, 0);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getExplanationsByCategory(null as any));
  });
});

// ── Registry completeness ────────────────────────────────────────────────────

describe('FIX_EXPLANATION_REGISTRY', () => {
  it('all entries have what_we_did', () => {
    for (const [key, e] of Object.entries(FIX_EXPLANATION_REGISTRY)) {
      assert.ok(e.what_we_did, `${key} missing what_we_did`);
    }
  });

  it('all entries have why_it_matters', () => {
    for (const [key, e] of Object.entries(FIX_EXPLANATION_REGISTRY)) {
      assert.ok(e.why_it_matters, `${key} missing why_it_matters`);
    }
  });

  it('all entries have expected_impact', () => {
    for (const [key, e] of Object.entries(FIX_EXPLANATION_REGISTRY)) {
      assert.ok(e.expected_impact, `${key} missing expected_impact`);
    }
  });

  it('all entries have category', () => {
    for (const [key, e] of Object.entries(FIX_EXPLANATION_REGISTRY)) {
      assert.ok(e.category, `${key} missing category`);
    }
  });

  it('all entries have short_label', () => {
    for (const [key, e] of Object.entries(FIX_EXPLANATION_REGISTRY)) {
      assert.ok(e.short_label, `${key} missing short_label`);
    }
  });

  it('has at least 15 entries', () => {
    assert.ok(Object.keys(FIX_EXPLANATION_REGISTRY).length >= 15);
  });
});
