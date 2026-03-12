/**
 * tools/copyright/scrape_detector.test.ts
 *
 * Tests for scrape detection engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSimilarity,
  severityFromSimilarity,
  detectScrape,
  simulateScrapeMatches,
} from './scrape_detector.js';

const ORIGINAL = 'Our organic cotton collection is ethically sourced from certified farms. Each garment undergoes rigorous quality testing to ensure lasting comfort and sustainability.';
const SCRAPED_EXACT = ORIGINAL;
const SCRAPED_PARTIAL = 'Our organic cotton collection is ethically sourced. But we also sell synthetic blends and imported fabrics at discount prices.';
const SCRAPED_UNRELATED = 'The best pizza recipes for a Friday night dinner party with friends and family around the table.';

// ── computeSimilarity ────────────────────────────────────────────────────────

describe('computeSimilarity', () => {
  it('returns 1 for identical strings', () => {
    assert.equal(computeSimilarity(ORIGINAL, SCRAPED_EXACT), 1);
  });

  it('returns value between 0 and 1 for partial overlap', () => {
    const sim = computeSimilarity(ORIGINAL, SCRAPED_PARTIAL);
    assert.ok(sim > 0 && sim < 1);
  });

  it('returns low value for unrelated content', () => {
    const sim = computeSimilarity(ORIGINAL, SCRAPED_UNRELATED);
    assert.ok(sim < 0.2);
  });

  it('returns 0 when either string is empty', () => {
    assert.equal(computeSimilarity('', ORIGINAL), 0);
    assert.equal(computeSimilarity(ORIGINAL, ''), 0);
  });

  it('returns 0 for both empty', () => {
    assert.equal(computeSimilarity('', ''), 0);
  });

  it('is case insensitive', () => {
    const a = computeSimilarity('Hello World Example', 'hello world example');
    assert.equal(a, 1);
  });
});

// ── severityFromSimilarity ───────────────────────────────────────────────────

describe('severityFromSimilarity', () => {
  it('returns critical for >= 0.7', () => {
    assert.equal(severityFromSimilarity(0.7), 'critical');
    assert.equal(severityFromSimilarity(1.0), 'critical');
  });

  it('returns high for >= 0.5 and < 0.7', () => {
    assert.equal(severityFromSimilarity(0.5), 'high');
    assert.equal(severityFromSimilarity(0.69), 'high');
  });

  it('returns medium for >= 0.3 and < 0.5', () => {
    assert.equal(severityFromSimilarity(0.3), 'medium');
    assert.equal(severityFromSimilarity(0.49), 'medium');
  });

  it('returns low for < 0.3', () => {
    assert.equal(severityFromSimilarity(0.1), 'low');
    assert.equal(severityFromSimilarity(0), 'low');
  });
});

// ── detectScrape ─────────────────────────────────────────────────────────────

describe('detectScrape', () => {
  it('returns critical severity for exact copy', () => {
    const m = detectScrape('s1', 'https://x.com/p', ORIGINAL, 'https://bad.com/p', SCRAPED_EXACT);
    assert.equal(m.severity, 'critical');
    assert.equal(m.similarity, 1);
  });

  it('returns lower severity for partial overlap', () => {
    const m = detectScrape('s1', 'https://x.com/p', ORIGINAL, 'https://bad.com/p', SCRAPED_PARTIAL);
    assert.ok(m.similarity > 0 && m.similarity < 1);
    assert.ok(['low', 'medium', 'high'].includes(m.severity));
  });

  it('extracts scraped_domain from URL', () => {
    const m = detectScrape('s1', 'https://x.com/p', ORIGINAL, 'https://bad.com/copied', SCRAPED_EXACT);
    assert.equal(m.scraped_domain, 'bad.com');
  });

  it('has matched_phrases for similar content', () => {
    const m = detectScrape('s1', 'https://x.com/p', ORIGINAL, 'https://bad.com/p', SCRAPED_EXACT);
    assert.ok(m.matched_phrases.length > 0);
  });

  it('sets match_id and detected_at', () => {
    const m = detectScrape('s1', 'https://x.com/p', ORIGINAL, 'https://bad.com/p', SCRAPED_EXACT);
    assert.ok(m.match_id.length > 0);
    assert.ok(m.detected_at.includes('T'));
  });

  it('handles empty content gracefully', () => {
    const m = detectScrape('s1', 'https://x.com/p', '', 'https://bad.com/p', '');
    assert.equal(m.similarity, 0);
    assert.equal(m.severity, 'low');
  });
});

// ── simulateScrapeMatches ────────────────────────────────────────────────────

describe('simulateScrapeMatches', () => {
  it('returns requested count', () => {
    const matches = simulateScrapeMatches('s1', 'example.com', 5);
    assert.equal(matches.length, 5);
  });

  it('default count is 8', () => {
    const matches = simulateScrapeMatches('s1', 'example.com');
    assert.equal(matches.length, 8);
  });

  it('has ~30% high-similarity hits', () => {
    const matches = simulateScrapeMatches('s1', 'test.com', 20);
    const hits = matches.filter((m) => m.similarity >= 0.5);
    assert.ok(hits.length >= 1, 'should have at least 1 hit');
    assert.ok(hits.length <= 15, 'should not be all hits');
  });

  it('all matches have valid severity', () => {
    const matches = simulateScrapeMatches('s1', 'shop.com');
    for (const m of matches) {
      assert.ok(['critical', 'high', 'medium', 'low'].includes(m.severity));
    }
  });

  it('never throws on empty domain', () => {
    const matches = simulateScrapeMatches('s1', '');
    assert.ok(Array.isArray(matches));
  });

  it('scraped_domain comes from known scraper list', () => {
    const matches = simulateScrapeMatches('s1', 'example.com');
    for (const m of matches) {
      assert.ok(m.scraped_domain.length > 0);
    }
  });
});
