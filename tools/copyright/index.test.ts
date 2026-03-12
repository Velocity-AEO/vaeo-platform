import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COPYRIGHT_VERSION,
  MONITORED_SIGNALS,
  buildFingerprint,
  buildFingerprintBatch,
  simulateFingerprints,
  detectScrape,
  computeSimilarity,
  severityFromSimilarity,
  simulateScrapeMatches,
  generateCopyrightReport,
  simulateCopyrightReport,
} from './index.js';

describe('copyright index barrel', () => {
  it('COPYRIGHT_VERSION is a semver string', () => {
    assert.match(COPYRIGHT_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('MONITORED_SIGNALS is array with 3 items', () => {
    assert.equal(MONITORED_SIGNALS.length, 3);
  });

  it('MONITORED_SIGNALS includes exact_match, phrase_match, fuzzy_match', () => {
    assert.ok(MONITORED_SIGNALS.includes('exact_match'));
    assert.ok(MONITORED_SIGNALS.includes('phrase_match'));
    assert.ok(MONITORED_SIGNALS.includes('fuzzy_match'));
  });

  it('buildFingerprint is exported and callable', () => {
    const fp = buildFingerprint('site1', 'https://test.com/page', 'some content here for testing');
    assert.ok(fp.fingerprint_id);
    assert.equal(fp.site_id, 'site1');
    assert.ok(fp.content_hash.length > 0);
  });

  it('buildFingerprintBatch is exported and callable', () => {
    const batch = buildFingerprintBatch('site1', [
      { url: 'https://test.com/a', content: 'content a' },
      { url: 'https://test.com/b', content: 'content b' },
    ]);
    assert.equal(batch.length, 2);
  });

  it('simulateFingerprints is exported and callable', () => {
    const fps = simulateFingerprints('site1', 'test.com', 5);
    assert.equal(fps.length, 5);
    assert.ok(fps[0].fingerprint_id);
  });

  it('detectScrape is exported and callable', () => {
    const match = detectScrape(
      'site1',
      'https://test.com/page',
      'original content here for testing purposes',
      'https://scraper.com/page',
      'original content here for testing purposes',
    );
    assert.ok(match.match_id);
    assert.ok(match.similarity > 0);
  });

  it('computeSimilarity is exported and callable', () => {
    const sim = computeSimilarity('hello world test', 'hello world test');
    assert.equal(sim, 1);
  });

  it('severityFromSimilarity is exported and callable', () => {
    assert.equal(severityFromSimilarity(0.8), 'critical');
    assert.equal(severityFromSimilarity(0.6), 'high');
    assert.equal(severityFromSimilarity(0.4), 'medium');
    assert.equal(severityFromSimilarity(0.1), 'low');
  });

  it('simulateScrapeMatches is exported and callable', () => {
    const matches = simulateScrapeMatches('site1', 'test.com', 5);
    assert.equal(matches.length, 5);
    assert.ok(matches[0].match_id);
  });

  it('generateCopyrightReport is exported and callable', () => {
    const matches = simulateScrapeMatches('site1', 'test.com', 5);
    const report = generateCopyrightReport('site1', 'test.com', matches);
    assert.ok(report.report_id);
    assert.equal(report.total_matches, 5);
  });

  it('simulateCopyrightReport is exported and callable', () => {
    const report = simulateCopyrightReport('site1', 'test.com');
    assert.ok(report.report_id);
    assert.equal(report.site_id, 'site1');
    assert.ok(report.total_matches > 0);
  });

  it('never throws on empty inputs', () => {
    assert.doesNotThrow(() => {
      buildFingerprint('', '', '');
      simulateFingerprints('', '', 0);
      simulateScrapeMatches('', '', 0);
    });
  });
});
