/**
 * tools/copyright/copyright_report.test.ts
 *
 * Tests for copyright report generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCopyrightReport,
  simulateCopyrightReport,
} from './copyright_report.js';
import type { ScrapeMatch } from './scrape_detector.js';

function makeMatch(overrides: Partial<ScrapeMatch> = {}): ScrapeMatch {
  return {
    match_id: 'mid-1',
    site_id: 's1',
    original_url: 'https://shop.com/p1',
    scraped_url: 'https://bad.com/p1',
    scraped_domain: 'bad.com',
    similarity: 0.8,
    severity: 'critical',
    matched_phrases: ['organic cotton collection'],
    detected_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── generateCopyrightReport — basics ─────────────────────────────────────────

describe('generateCopyrightReport — basics', () => {
  it('sets report_id and generated_at', () => {
    const r = generateCopyrightReport('s1', 'shop.com', [makeMatch()]);
    assert.ok(r.report_id.length > 0);
    assert.ok(r.generated_at.includes('T'));
  });

  it('total_matches equals input length', () => {
    const r = generateCopyrightReport('s1', 'shop.com', [makeMatch(), makeMatch()]);
    assert.equal(r.total_matches, 2);
  });

  it('handles empty matches', () => {
    const r = generateCopyrightReport('s1', 'shop.com', []);
    assert.equal(r.total_matches, 0);
    assert.equal(r.pages_affected, 0);
  });
});

// ── severity_breakdown ───────────────────────────────────────────────────────

describe('generateCopyrightReport — severity_breakdown', () => {
  it('counts each severity correctly', () => {
    const matches = [
      makeMatch({ severity: 'critical' }),
      makeMatch({ severity: 'critical' }),
      makeMatch({ severity: 'high' }),
      makeMatch({ severity: 'medium' }),
      makeMatch({ severity: 'low' }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    assert.equal(r.severity_breakdown.critical, 2);
    assert.equal(r.severity_breakdown.high, 1);
    assert.equal(r.severity_breakdown.medium, 1);
    assert.equal(r.severity_breakdown.low, 1);
  });

  it('all zero for empty matches', () => {
    const r = generateCopyrightReport('s1', 'shop.com', []);
    assert.equal(r.severity_breakdown.critical, 0);
    assert.equal(r.severity_breakdown.high, 0);
  });
});

// ── top_infringing ───────────────────────────────────────────────────────────

describe('generateCopyrightReport — top_infringing', () => {
  it('groups by scraped_domain', () => {
    const matches = [
      makeMatch({ scraped_domain: 'a.com' }),
      makeMatch({ scraped_domain: 'a.com' }),
      makeMatch({ scraped_domain: 'b.com' }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    assert.ok(r.top_infringing.length <= 3);
    const aDomain = r.top_infringing.find((d) => d.domain === 'a.com');
    assert.ok(aDomain);
    assert.equal(aDomain!.match_count, 2);
  });

  it('max 3 domains', () => {
    const matches = [
      makeMatch({ scraped_domain: 'a.com' }),
      makeMatch({ scraped_domain: 'b.com' }),
      makeMatch({ scraped_domain: 'c.com' }),
      makeMatch({ scraped_domain: 'd.com' }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    assert.equal(r.top_infringing.length, 3);
  });

  it('sorted by severity then count', () => {
    const matches = [
      makeMatch({ scraped_domain: 'low.com', severity: 'low' }),
      makeMatch({ scraped_domain: 'low.com', severity: 'low' }),
      makeMatch({ scraped_domain: 'low.com', severity: 'low' }),
      makeMatch({ scraped_domain: 'crit.com', severity: 'critical' }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    assert.equal(r.top_infringing[0].domain, 'crit.com');
  });

  it('computes avg_similarity', () => {
    const matches = [
      makeMatch({ scraped_domain: 'a.com', similarity: 0.8 }),
      makeMatch({ scraped_domain: 'a.com', similarity: 0.6 }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    const a = r.top_infringing.find((d) => d.domain === 'a.com')!;
    assert.equal(a.avg_similarity, 0.7);
  });
});

// ── estimated_traffic_impact ─────────────────────────────────────────────────

describe('generateCopyrightReport — traffic impact', () => {
  it('critical = 500 per match', () => {
    const r = generateCopyrightReport('s1', 'shop.com', [makeMatch({ severity: 'critical' })]);
    assert.equal(r.estimated_traffic_impact, 500);
  });

  it('high = 200 per match', () => {
    const r = generateCopyrightReport('s1', 'shop.com', [makeMatch({ severity: 'high' })]);
    assert.equal(r.estimated_traffic_impact, 200);
  });

  it('medium = 50 per match', () => {
    const r = generateCopyrightReport('s1', 'shop.com', [makeMatch({ severity: 'medium' })]);
    assert.equal(r.estimated_traffic_impact, 50);
  });

  it('low = 10 per match', () => {
    const r = generateCopyrightReport('s1', 'shop.com', [makeMatch({ severity: 'low' })]);
    assert.equal(r.estimated_traffic_impact, 10);
  });

  it('sums across multiple', () => {
    const matches = [
      makeMatch({ severity: 'critical' }),
      makeMatch({ severity: 'low' }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    assert.equal(r.estimated_traffic_impact, 510);
  });
});

// ── pages_affected ───────────────────────────────────────────────────────────

describe('generateCopyrightReport — pages_affected', () => {
  it('counts unique original_urls', () => {
    const matches = [
      makeMatch({ original_url: 'https://shop.com/a' }),
      makeMatch({ original_url: 'https://shop.com/a' }),
      makeMatch({ original_url: 'https://shop.com/b' }),
    ];
    const r = generateCopyrightReport('s1', 'shop.com', matches);
    assert.equal(r.pages_affected, 2);
  });
});

// ── simulateCopyrightReport ──────────────────────────────────────────────────

describe('simulateCopyrightReport', () => {
  it('returns a valid report', () => {
    const r = simulateCopyrightReport('s1', 'example.com');
    assert.ok(r.report_id.length > 0);
    assert.equal(r.total_matches, 12);
  });

  it('never throws on empty domain', () => {
    const r = simulateCopyrightReport('s1', '');
    assert.ok(r.report_id);
  });
});
