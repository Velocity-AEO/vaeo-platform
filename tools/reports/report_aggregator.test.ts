/**
 * tools/reports/report_aggregator.test.ts
 *
 * Tests for report data aggregator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSiteReport,
  type ReportDeps,
  type SiteReport,
  type LighthouseSnapshot,
} from './report_aggregator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ReportDeps> = {}): ReportDeps {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const lastWeek = new Date(Date.now() - 5 * 86400000).toISOString();
  const lastMonth = new Date(Date.now() - 20 * 86400000).toISOString();

  return {
    loadSite: async () => ({ site_url: 'https://example.com' }),
    loadHealthScore: async () => ({ score: 82, grade: 'B' as const }),
    loadHealthScoreAt: async (_id, daysAgo) => daysAgo === 7 ? 78 : 70,
    loadFixes: async () => [
      { url: 'https://example.com/page1', issue_type: 'title_missing', applied_at: yesterday, confidence: 0.95, auto_approved: true },
      { url: 'https://example.com/page2', issue_type: 'meta_missing', applied_at: lastWeek, confidence: 0.8, auto_approved: false },
      { url: 'https://example.com/page3', issue_type: 'schema_missing', applied_at: lastMonth, confidence: 0.7, auto_approved: false },
    ],
    loadLighthouseCurrent: async () => ({ score: 85, lcp: 2100, cls: 0.05, measured_at: now }),
    loadLighthouse30d: async () => ({ score: 72, lcp: 3200, cls: 0.12, measured_at: lastMonth }),
    loadRegressions: async () => [
      { url: 'https://example.com/page4', signal: 'schema', detected_at: yesterday, severity: 'major', resolved: false },
      { url: 'https://example.com/page5', signal: 'title', detected_at: lastWeek, severity: 'minor', resolved: true },
    ],
    loadAEOCoverage: async () => ({ speakable_pages: 12, faq_pages: 5, answer_blocks: 8 }),
    loadGSCData: async () => ({
      total_clicks_28d: 15000,
      total_impressions_28d: 450000,
      avg_position: 12.3,
      top_pages: [
        { url: 'https://example.com/', clicks: 5000, impressions: 100000, position: 3.2 },
        { url: 'https://example.com/products', clicks: 3000, impressions: 80000, position: 8.1 },
      ],
    }),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateSiteReport — basic structure', () => {
  it('returns complete report with all sections', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.site_id, 'site-001');
    assert.equal(report.site_url, 'https://example.com');
    assert.ok(report.generated_at);
    assert.ok(report.health);
    assert.ok(report.fixes);
    assert.ok(report.performance);
    assert.ok(report.regressions);
    assert.ok(report.aeo);
    assert.ok(report.gsc);
    assert.equal(report.error, undefined);
  });

  it('returns error when site not found', async () => {
    const report = await generateSiteReport('missing', makeDeps({
      loadSite: async () => null,
    }));
    assert.ok(report.error);
    assert.match(report.error!, /not found/);
  });

  it('returns error when loadSite throws', async () => {
    const report = await generateSiteReport('bad', makeDeps({
      loadSite: async () => { throw new Error('DB down'); },
    }));
    assert.ok(report.error);
    assert.match(report.error!, /DB down/);
  });
});

describe('generateSiteReport — health section', () => {
  it('populates health scores and grade', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.health.current_score, 82);
    assert.equal(report.health.current_grade, 'B');
    assert.equal(report.health.score_7d_ago, 78);
    assert.equal(report.health.score_30d_ago, 70);
  });

  it('calculates improving trend', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadHealthScore: async () => ({ score: 85, grade: 'B' as const }),
      loadHealthScoreAt: async (_id, days) => days === 7 ? 78 : 70,
    }));
    assert.equal(report.health.trend, 'improving');
  });

  it('calculates declining trend', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadHealthScore: async () => ({ score: 60, grade: 'C' as const }),
      loadHealthScoreAt: async (_id, days) => days === 7 ? 68 : 75,
    }));
    assert.equal(report.health.trend, 'declining');
  });

  it('calculates stable trend', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadHealthScore: async () => ({ score: 80, grade: 'B' as const }),
      loadHealthScoreAt: async () => 80,
    }));
    assert.equal(report.health.trend, 'stable');
  });

  it('defaults to current score when historical unavailable', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadHealthScoreAt: async () => null,
    }));
    assert.equal(report.health.score_7d_ago, report.health.current_score);
    assert.equal(report.health.score_30d_ago, report.health.current_score);
  });
});

describe('generateSiteReport — fixes section', () => {
  it('counts total, this_week, this_month fixes', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.fixes.total_applied, 3);
    assert.ok(report.fixes.this_week >= 1);
    assert.ok(report.fixes.this_month >= 2);
  });

  it('groups fixes by type', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.fixes.by_type['title_missing'], 1);
    assert.equal(report.fixes.by_type['meta_missing'], 1);
    assert.equal(report.fixes.by_type['schema_missing'], 1);
  });

  it('returns recent fixes sorted by date desc', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.ok(report.fixes.recent.length >= 1);
    assert.equal(report.fixes.recent[0].issue_type, 'title_missing');
    assert.equal(report.fixes.recent[0].auto_approved, true);
  });

  it('limits recent to 10 items', async () => {
    const fixes = Array.from({ length: 15 }, (_, i) => ({
      url: `https://example.com/page${i}`,
      issue_type: 'title_missing',
      applied_at: new Date(Date.now() - i * 86400000).toISOString(),
      confidence: 0.9,
      auto_approved: false,
    }));
    const report = await generateSiteReport('site-001', makeDeps({
      loadFixes: async () => fixes,
    }));
    assert.ok(report.fixes.recent.length <= 10);
  });
});

describe('generateSiteReport — performance section', () => {
  it('includes Lighthouse current and 30d snapshots', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.ok(report.performance.lighthouse_current);
    assert.equal(report.performance.lighthouse_current!.score, 85);
    assert.ok(report.performance.lighthouse_30d_ago);
    assert.equal(report.performance.lighthouse_30d_ago!.score, 72);
  });

  it('calculates LCP and performance deltas', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.performance.performance_delta, 13);
    assert.equal(report.performance.lcp_delta, -1100);
  });

  it('returns empty performance when no Lighthouse data', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadLighthouseCurrent: async () => null,
      loadLighthouse30d: async () => null,
    }));
    assert.equal(report.performance.lighthouse_current, undefined);
    assert.equal(report.performance.lcp_delta, undefined);
  });
});

describe('generateSiteReport — regressions section', () => {
  it('counts active and resolved regressions', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.regressions.active, 1);
    assert.ok(report.regressions.resolved_this_week >= 0);
  });

  it('lists recent active regressions', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.ok(report.regressions.recent.length >= 1);
    assert.equal(report.regressions.recent[0].signal, 'schema');
  });
});

describe('generateSiteReport — AEO section', () => {
  it('includes AEO coverage counts', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.aeo.speakable_pages, 12);
    assert.equal(report.aeo.faq_pages, 5);
    assert.equal(report.aeo.answer_blocks, 8);
  });
});

describe('generateSiteReport — GSC section', () => {
  it('includes GSC data with top pages', async () => {
    const report = await generateSiteReport('site-001', makeDeps());
    assert.equal(report.gsc.total_clicks_28d, 15000);
    assert.equal(report.gsc.total_impressions_28d, 450000);
    assert.equal(report.gsc.avg_position, 12.3);
    assert.equal(report.gsc.top_pages.length, 2);
  });

  it('returns zeros when no GSC data', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadGSCData: async () => null,
    }));
    assert.equal(report.gsc.total_clicks_28d, 0);
    assert.equal(report.gsc.top_pages.length, 0);
  });
});

describe('generateSiteReport — resilience', () => {
  it('handles individual dep failures gracefully', async () => {
    const report = await generateSiteReport('site-001', makeDeps({
      loadHealthScore: async () => { throw new Error('health fail'); },
      loadFixes: async () => { throw new Error('fixes fail'); },
      loadLighthouseCurrent: async () => { throw new Error('lh fail'); },
      loadRegressions: async () => { throw new Error('reg fail'); },
      loadAEOCoverage: async () => { throw new Error('aeo fail'); },
      loadGSCData: async () => { throw new Error('gsc fail'); },
    }));
    // Should still return a valid report with defaults
    assert.equal(report.error, undefined);
    assert.equal(report.health.current_score, 0);
    assert.equal(report.fixes.total_applied, 0);
    assert.equal(report.regressions.active, 0);
    assert.equal(report.aeo.speakable_pages, 0);
    assert.equal(report.gsc.total_clicks_28d, 0);
  });
});
