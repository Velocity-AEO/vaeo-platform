import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAEOSignals,
  calculateAEOScore,
  calculateSiteAEOScore,
  AEO_SIGNALS,
} from './aeo_score_calculator.js';

// ── HTML helpers ─────────────────────────────────────────────────────────────

const SPEAKABLE_HTML = '<script type="application/ld+json">{"@type":"Speakable"}</script>';
const FAQ_HTML = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
const HOWTO_HTML = '<script type="application/ld+json">{"@type":"HowTo"}</script>';
const ARTICLE_HTML = '<script type="application/ld+json">{"@type":"Article"}</script>';
const BREADCRUMB_HTML = '<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>';
const META_DESC_HTML = '<meta name="description" content="Test page">';
const HEADINGS_HTML = '<h1>Title</h1><h2>Section</h2><h3>Sub</h3>';
const ALL_SIGNALS_HTML = `<html><head>${META_DESC_HTML}</head><body>${HEADINGS_HTML}${SPEAKABLE_HTML}${FAQ_HTML}${HOWTO_HTML}${ARTICLE_HTML}${BREADCRUMB_HTML}</body></html>`;
const EMPTY_HTML = '<html><head><title>Empty</title></head><body></body></html>';

// ── detectAEOSignals ─────────────────────────────────────────────────────────

describe('detectAEOSignals', () => {
  it('detects speakable schema', () => {
    const s = detectAEOSignals(SPEAKABLE_HTML, 'https://x.com');
    assert.equal(s.speakable_schema, true);
  });

  it('detects FAQ schema', () => {
    const s = detectAEOSignals(FAQ_HTML, 'https://x.com');
    assert.equal(s.faq_schema, true);
  });

  it('detects HowTo schema', () => {
    const s = detectAEOSignals(HOWTO_HTML, 'https://x.com');
    assert.equal(s.how_to_schema, true);
  });

  it('detects Article schema', () => {
    const s = detectAEOSignals(ARTICLE_HTML, 'https://x.com');
    assert.equal(s.article_schema, true);
  });

  it('detects breadcrumb schema', () => {
    const s = detectAEOSignals(BREADCRUMB_HTML, 'https://x.com');
    assert.equal(s.breadcrumb_schema, true);
  });

  it('detects meta description', () => {
    const s = detectAEOSignals(META_DESC_HTML, 'https://x.com');
    assert.equal(s.meta_description, true);
  });

  it('detects structured headings', () => {
    const s = detectAEOSignals(HEADINGS_HTML, 'https://x.com');
    assert.equal(s.structured_headings, true);
  });

  it('returns false when absent', () => {
    const s = detectAEOSignals(EMPTY_HTML, 'https://x.com');
    assert.equal(s.speakable_schema, false);
    assert.equal(s.faq_schema, false);
    assert.equal(s.how_to_schema, false);
    assert.equal(s.article_schema, false);
    assert.equal(s.meta_description, false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectAEOSignals(null as any, null as any));
  });
});

// ── AEO_SIGNALS ──────────────────────────────────────────────────────────────

describe('AEO_SIGNALS', () => {
  it('has all 7 signals', () => {
    assert.equal(Object.keys(AEO_SIGNALS).length, 7);
    assert.ok(AEO_SIGNALS.speakable_schema);
    assert.ok(AEO_SIGNALS.faq_schema);
    assert.ok(AEO_SIGNALS.how_to_schema);
    assert.ok(AEO_SIGNALS.article_schema);
    assert.ok(AEO_SIGNALS.breadcrumb_schema);
    assert.ok(AEO_SIGNALS.meta_description);
    assert.ok(AEO_SIGNALS.structured_headings);
  });

  it('weights sum to 100', () => {
    const total = Object.values(AEO_SIGNALS).reduce((s, v) => s + v.weight, 0);
    assert.equal(total, 100);
  });
});

// ── calculateAEOScore ────────────────────────────────────────────────────────

describe('calculateAEOScore', () => {
  it('returns A for >= 90 (all signals)', () => {
    const score = calculateAEOScore(ALL_SIGNALS_HTML, 'site1', 'https://x.com');
    assert.equal(score.grade, 'A');
    assert.equal(score.percentage, 100);
  });

  it('returns F for < 40 (no signals)', () => {
    const score = calculateAEOScore(EMPTY_HTML, 'site1', 'https://x.com');
    assert.equal(score.grade, 'F');
    assert.equal(score.percentage, 0);
  });

  it('returns 100 when all present', () => {
    const score = calculateAEOScore(ALL_SIGNALS_HTML, 'site1', 'https://x.com');
    assert.equal(score.score, 100);
    assert.equal(score.max_score, 100);
  });

  it('sets top_recommendation from highest weight missing signal', () => {
    const score = calculateAEOScore(EMPTY_HTML, 'site1', 'https://x.com');
    assert.ok(score.top_recommendation);
    assert.ok(score.top_recommendation!.includes('speakable'));
  });

  it('top_recommendation is null when all present', () => {
    const score = calculateAEOScore(ALL_SIGNALS_HTML, 'site1', 'https://x.com');
    assert.equal(score.top_recommendation, null);
  });

  it('calculates partial scores correctly', () => {
    // Only meta_description (10) + structured_headings (5) = 15
    const html = `<html><head><meta name="description" content="test"></head><body><h1>A</h1><h2>B</h2><h3>C</h3></body></html>`;
    const score = calculateAEOScore(html, 'site1', 'https://x.com');
    assert.equal(score.score, 15);
    assert.equal(score.percentage, 15);
    assert.equal(score.grade, 'F');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateAEOScore(null as any, null as any, null as any));
  });
});

// ── calculateSiteAEOScore ────────────────────────────────────────────────────

describe('calculateSiteAEOScore', () => {
  it('returns empty on error', async () => {
    const result = await calculateSiteAEOScore('site1', 10, {
      loadPagesFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.average_score, 0);
    assert.equal(result.page_scores.length, 0);
  });

  it('calculates average across pages', async () => {
    const result = await calculateSiteAEOScore('site1', 2, {
      loadPagesFn: async () => [
        { html: ALL_SIGNALS_HTML, url: 'https://x.com/a' },
        { html: EMPTY_HTML, url: 'https://x.com/b' },
      ],
    });
    assert.equal(result.average_score, 50);
    assert.equal(result.page_scores.length, 2);
  });

  it('returns empty for no pages', async () => {
    const result = await calculateSiteAEOScore('site1', 10, {
      loadPagesFn: async () => [],
    });
    assert.equal(result.average_score, 0);
    assert.equal(result.grade, 'F');
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => calculateSiteAEOScore(null as any));
  });
});
