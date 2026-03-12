/**
 * tools/agency/agency_health_overview.test.ts
 *
 * Tests for agency health overview logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreToGrade,
  computeAverageScore,
  countByGrade,
  getWorstPerformers,
  getBestPerformers,
  buildAgencyHealthOverview,
  fetchAgencyHealthOverview,
  type ClientSiteHealth,
} from './agency_health_overview.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function site(domain: string, score: number): ClientSiteHealth {
  const grade = score >= 90 ? 'A' as const : score >= 80 ? 'B' as const : score >= 70 ? 'C' as const : score >= 60 ? 'D' as const : 'F' as const;
  return { site_id: `s_${domain}`, domain, score, grade, total_issues: 100 - score, last_scan_at: '2026-01-01T00:00:00Z' };
}

// ── scoreToGrade ─────────────────────────────────────────────────────────────

describe('scoreToGrade', () => {
  it('returns A for 90+', () => {
    assert.equal(scoreToGrade(95), 'A');
  });

  it('returns B for 80-89', () => {
    assert.equal(scoreToGrade(85), 'B');
  });

  it('returns C for 70-79', () => {
    assert.equal(scoreToGrade(75), 'C');
  });

  it('returns D for 60-69', () => {
    assert.equal(scoreToGrade(65), 'D');
  });

  it('returns F for below 60', () => {
    assert.equal(scoreToGrade(50), 'F');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => scoreToGrade(null as any));
  });
});

// ── computeAverageScore ──────────────────────────────────────────────────────

describe('computeAverageScore', () => {
  it('calculates average correctly', () => {
    assert.equal(computeAverageScore([site('a.com', 80), site('b.com', 60)]), 70);
  });

  it('returns 0 for empty array', () => {
    assert.equal(computeAverageScore([]), 0);
  });

  it('returns 0 for null', () => {
    assert.equal(computeAverageScore(null as any), 0);
  });

  it('rounds to integer', () => {
    assert.equal(typeof computeAverageScore([site('a.com', 33), site('b.com', 34)]), 'number');
  });
});

// ── countByGrade ─────────────────────────────────────────────────────────────

describe('countByGrade', () => {
  it('counts grades correctly', () => {
    const sites = [site('a.com', 95), site('b.com', 92), site('c.com', 50)];
    const counts = countByGrade(sites);
    assert.equal(counts.A, 2);
    assert.equal(counts.F, 1);
    assert.equal(counts.B, 0);
  });

  it('returns zeros for empty', () => {
    const counts = countByGrade([]);
    assert.equal(counts.A, 0);
    assert.equal(counts.F, 0);
  });

  it('returns zeros for null', () => {
    const counts = countByGrade(null as any);
    assert.equal(counts.A, 0);
  });
});

// ── getWorstPerformers ───────────────────────────────────────────────────────

describe('getWorstPerformers', () => {
  it('returns lowest-score sites first', () => {
    const sites = [site('a.com', 90), site('b.com', 40), site('c.com', 70)];
    const worst = getWorstPerformers(sites, 2);
    assert.equal(worst.length, 2);
    assert.equal(worst[0].domain, 'b.com');
    assert.equal(worst[1].domain, 'c.com');
  });

  it('returns empty for null', () => {
    assert.deepEqual(getWorstPerformers(null as any), []);
  });

  it('respects limit', () => {
    const sites = [site('a.com', 10), site('b.com', 20), site('c.com', 30)];
    assert.equal(getWorstPerformers(sites, 1).length, 1);
  });
});

// ── getBestPerformers ────────────────────────────────────────────────────────

describe('getBestPerformers', () => {
  it('returns highest-score sites first', () => {
    const sites = [site('a.com', 40), site('b.com', 95), site('c.com', 70)];
    const best = getBestPerformers(sites, 2);
    assert.equal(best.length, 2);
    assert.equal(best[0].domain, 'b.com');
    assert.equal(best[1].domain, 'c.com');
  });

  it('returns empty for null', () => {
    assert.deepEqual(getBestPerformers(null as any), []);
  });
});

// ── buildAgencyHealthOverview ────────────────────────────────────────────────

describe('buildAgencyHealthOverview', () => {
  it('builds complete overview', () => {
    const sites = [site('a.com', 90), site('b.com', 50)];
    const overview = buildAgencyHealthOverview('ag_1', sites);
    assert.equal(overview.agency_id, 'ag_1');
    assert.equal(overview.total_sites, 2);
    assert.equal(overview.avg_score, 70);
    assert.equal(overview.avg_grade, 'C');
    assert.ok(overview.computed_at);
  });

  it('handles empty sites', () => {
    const overview = buildAgencyHealthOverview('ag_1', []);
    assert.equal(overview.total_sites, 0);
    assert.equal(overview.avg_score, 0);
  });

  it('handles null sites', () => {
    const overview = buildAgencyHealthOverview('ag_1', null as any);
    assert.equal(overview.total_sites, 0);
  });

  it('populates worst and best performers', () => {
    const sites = [site('a.com', 95), site('b.com', 40)];
    const overview = buildAgencyHealthOverview('ag_1', sites);
    assert.equal(overview.worst_performers[0].domain, 'b.com');
    assert.equal(overview.best_performers[0].domain, 'a.com');
  });
});

// ── fetchAgencyHealthOverview ────────────────────────────────────────────────

describe('fetchAgencyHealthOverview', () => {
  it('fetches and builds overview', async () => {
    const sites = [site('x.com', 80)];
    const overview = await fetchAgencyHealthOverview('ag_1', {
      loadRosterHealth: async () => sites,
    });
    assert.equal(overview.total_sites, 1);
    assert.equal(overview.avg_score, 80);
  });

  it('returns empty overview on error', async () => {
    const overview = await fetchAgencyHealthOverview('ag_1', {
      loadRosterHealth: async () => { throw new Error('fail'); },
    });
    assert.equal(overview.total_sites, 0);
  });

  it('returns empty overview with no deps', async () => {
    const overview = await fetchAgencyHealthOverview('ag_1');
    assert.equal(overview.total_sites, 0);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => fetchAgencyHealthOverview(null as any, null as any));
  });
});
