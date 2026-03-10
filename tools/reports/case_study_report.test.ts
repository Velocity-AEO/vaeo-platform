/**
 * tools/reports/case_study_report.test.ts
 *
 * Tests for generateCaseStudyReport, generateMarkdownReport, generateJsonReport.
 * All database access mocked via injectable deps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateCaseStudyReport,
  generateMarkdownReport,
  generateJsonReport,
  type CaseStudyDeps,
  type CaseStudyReport,
  type SnapshotRow,
  type ActionRow,
  type SiteRow,
} from './case_study_report.js';
import type { Grade } from '../scoring/health_score.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE_ID = 'site-uuid-001';
const RUN_ID  = 'run-uuid-001';

const SITE_ROW: SiteRow = { site_url: 'https://cococabanalife.com', cms_type: 'shopify' };

function makeSnapshot(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    url:            'https://cococabanalife.com/products/sunset-hat',
    field_type:     'title',
    current_value:  'Sunset Hat',
    proposed_value: 'Beach Sun Hat for Summer | Cococabana Life',
    issue_flag:     false,
    issue_type:     null,
    char_count:     10,
    ...overrides,
  };
}

function makeAction(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id:               'action-001',
    url:              'https://cococabanalife.com/products/sunset-hat',
    issue_type:       'title_missing',
    risk_score:       3,
    execution_status: 'deployed',
    proposed_fix:     { new_title: 'Beach Sun Hat | Cococabana Life', confidence_score: 0.88 },
    ...overrides,
  };
}

function happyDeps(overrides: Partial<CaseStudyDeps> = {}): CaseStudyDeps {
  return {
    loadSite:               async () => SITE_ROW,
    loadSnapshots:          async () => [
      makeSnapshot({ issue_flag: true, issue_type: 'title_missing', current_value: null }),
      makeSnapshot({ field_type: 'meta_description', issue_flag: true, issue_type: 'meta_missing', current_value: null }),
      makeSnapshot({ field_type: 'h1', issue_flag: true, issue_type: 'h1_missing', current_value: null }),
      makeSnapshot({ field_type: 'canonical', issue_flag: false }),
      makeSnapshot({ field_type: 'schema', issue_flag: true, issue_type: 'schema_missing', current_value: null }),
      makeSnapshot({ url: 'https://cococabanalife.com/', field_type: 'title', issue_flag: false, current_value: 'Home' }),
    ],
    loadActions:            async () => [
      makeAction(),
      makeAction({ id: 'action-002', issue_type: 'meta_missing', execution_status: 'approved', proposed_fix: { new_description: 'Shop beach hats', confidence_score: 0.82 } }),
      makeAction({ id: 'action-003', issue_type: 'h1_missing', execution_status: 'completed', proposed_fix: { new_h1: 'Sunset Hat', confidence: 0.9 } }),
      makeAction({ id: 'action-004', issue_type: 'schema_missing', execution_status: 'queued', proposed_fix: {} }),
    ],
    loadUrlCount:           async () => 25,
    loadHealthScoreBefore:  async () => ({ score: 42, grade: 'D' as Grade }),
    loadHealthScoreAfter:   async () => ({ score: 78, grade: 'B' as Grade }),
    ...overrides,
  };
}

// ── generateCaseStudyReport — happy path ────────────────────────────────────

describe('generateCaseStudyReport — happy path', () => {
  it('returns a complete report with site info', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.site.domain, 'cococabanalife.com');
    assert.equal(report.site.cms, 'shopify');
    assert.equal(report.site.health_score_before, 42);
    assert.equal(report.site.health_score_after, 78);
    assert.equal(report.site.score_delta, 36);
    assert.equal(report.site.grade_before, 'D');
    assert.equal(report.site.grade_after, 'B');
  });

  it('returns correct summary counts', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.summary.total_urls, 25);
    assert.equal(report.summary.total_issues_found, 4); // 4 snapshots with issue_flag=true
    assert.equal(report.summary.total_fixes_applied, 3); // deployed + approved + completed (not queued)
  });

  it('counts severity correctly', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.summary.critical_count, 2); // title_missing + h1_missing
    assert.equal(report.summary.major_count, 2);    // meta_missing + schema_missing
    assert.equal(report.summary.minor_count, 0);
  });

  it('only includes deployed/approved/completed actions as fixes_applied', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.fixes_applied.length, 3);
    const issueTypes = report.fixes_applied.map((f) => f.issue_type);
    assert.ok(issueTypes.includes('title_missing'));
    assert.ok(issueTypes.includes('meta_missing'));
    assert.ok(issueTypes.includes('h1_missing'));
    assert.ok(!issueTypes.includes('schema_missing')); // queued, not applied
  });

  it('populates before_value and after_value from snapshots and actions', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    const titleFix = report.fixes_applied.find((f) => f.issue_type === 'title_missing');
    assert.ok(titleFix);
    assert.equal(titleFix.before_value, null); // was missing
    assert.equal(titleFix.after_value, 'Beach Sun Hat | Cococabana Life');
    assert.equal(titleFix.confidence, 0.88);
  });

  it('extracts confidence from proposed_fix.confidence fallback', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    const h1Fix = report.fixes_applied.find((f) => f.issue_type === 'h1_missing');
    assert.ok(h1Fix);
    assert.equal(h1Fix.confidence, 0.9);
  });

  it('run_id and generated_at are populated', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.run_id, RUN_ID);
    assert.ok(!isNaN(Date.parse(report.generated_at)));
  });

  it('has no error field on success', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.error, undefined);
  });
});

// ── top_wins ────────────────────────────────────────────────────────────────

describe('generateCaseStudyReport — top_wins', () => {
  it('returns at most 3 top wins', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.ok(report.top_wins.length <= 3);
    assert.ok(report.top_wins.length > 0);
  });

  it('top wins are sorted by estimated_impact descending', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    for (let i = 1; i < report.top_wins.length; i++) {
      assert.ok(
        report.top_wins[i - 1].estimated_impact >= report.top_wins[i].estimated_impact,
        `top_wins[${i - 1}].impact (${report.top_wins[i - 1].estimated_impact}) should be >= top_wins[${i}].impact (${report.top_wins[i].estimated_impact})`,
      );
    }
  });

  it('each top win has a reason string', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    for (const win of report.top_wins) {
      assert.ok(win.reason.length > 10, `reason should be descriptive: "${win.reason}"`);
    }
  });

  it('estimated_impact is between 1 and 10', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    for (const win of report.top_wins) {
      assert.ok(win.estimated_impact >= 1 && win.estimated_impact <= 10);
    }
  });
});

// ── Error handling ──────────────────────────────────────────────────────────

describe('generateCaseStudyReport — error handling', () => {
  it('returns error when site not found', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadSite: async () => null,
    }));
    assert.ok(report.error?.includes('Site not found'));
  });

  it('returns error when loadSite throws', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadSite: async () => { throw new Error('DB timeout'); },
    }));
    assert.ok(report.error?.includes('DB timeout'));
  });

  it('returns error when loadSnapshots throws', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadSnapshots: async () => { throw new Error('query failed'); },
    }));
    assert.ok(report.error?.includes('query failed'));
  });

  it('returns error when loadActions throws', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadActions: async () => { throw new Error('action load failed'); },
    }));
    assert.ok(report.error?.includes('action load failed'));
  });

  it('error report still has run_id and generated_at', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadSite: async () => null,
    }));
    assert.equal(report.run_id, RUN_ID);
    assert.ok(!isNaN(Date.parse(report.generated_at)));
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('generateCaseStudyReport — edge cases', () => {
  it('handles zero issues gracefully', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadSnapshots: async () => [makeSnapshot()], // no issues
      loadActions:   async () => [],
    }));
    assert.equal(report.summary.total_issues_found, 0);
    assert.equal(report.summary.total_fixes_applied, 0);
    assert.equal(report.fixes_applied.length, 0);
    assert.equal(report.top_wins.length, 0);
  });

  it('handles null health scores', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadHealthScoreBefore: async () => null,
      loadHealthScoreAfter:  async () => null,
    }));
    assert.equal(report.site.health_score_before, 0);
    assert.equal(report.site.health_score_after, 0);
    assert.equal(report.site.score_delta, 0);
    assert.equal(report.site.grade_before, 'F');
    assert.equal(report.site.grade_after, 'F');
  });

  it('strips https:// from domain', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.equal(report.site.domain, 'cococabanalife.com');
    assert.ok(!report.site.domain.includes('https://'));
  });

  it('handles negative score_delta', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadHealthScoreBefore: async () => ({ score: 80, grade: 'B' as Grade }),
      loadHealthScoreAfter:  async () => ({ score: 65, grade: 'C' as Grade }),
    }));
    assert.equal(report.site.score_delta, -15);
  });

  it('default confidence is 0.8 when not in proposed_fix', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps({
      loadActions: async () => [
        makeAction({ proposed_fix: { new_title: 'Test' } }), // no confidence_score key
      ],
    }));
    assert.equal(report.fixes_applied[0].confidence, 0.8);
  });
});

// ── generateMarkdownReport ──────────────────────────────────────────────────

describe('generateMarkdownReport', () => {
  let report: CaseStudyReport;

  it('setup: generate report for markdown tests', async () => {
    report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    assert.ok(report);
  });

  it('contains the site domain as heading', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('# SEO Case Study: cococabanalife.com'));
  });

  it('contains health score table', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('## Health Score'));
    assert.ok(md.includes('| Score  | 42 | 78 | +36 |'));
    assert.ok(md.includes('| Grade  | D | B |'));
  });

  it('contains summary section with counts', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('**Total URLs scanned:** 25'));
    assert.ok(md.includes('**Issues found:** 4'));
    assert.ok(md.includes('**Fixes applied:** 3'));
  });

  it('contains top wins section', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('## Top Wins'));
    assert.ok(md.includes('**Impact:**'));
    assert.ok(md.includes('**Why:**'));
  });

  it('contains fixes table', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('## All Fixes Applied'));
    assert.ok(md.includes('| URL | Field | Issue |'));
  });

  it('contains footer', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('VAEO Tracer'));
  });

  it('shows CMS type', () => {
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('**CMS:** shopify'));
  });
});

// ── generateJsonReport ──────────────────────────────────────────────────────

describe('generateJsonReport', () => {
  it('returns valid JSON', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    const json = generateJsonReport(report);
    const parsed = JSON.parse(json);
    assert.ok(parsed);
    assert.equal(typeof parsed, 'object');
  });

  it('round-trips the report structure', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    const json = generateJsonReport(report);
    const parsed = JSON.parse(json) as CaseStudyReport;
    assert.equal(parsed.site.domain, report.site.domain);
    assert.equal(parsed.summary.total_urls, report.summary.total_urls);
    assert.equal(parsed.fixes_applied.length, report.fixes_applied.length);
    assert.equal(parsed.top_wins.length, report.top_wins.length);
    assert.equal(parsed.run_id, report.run_id);
  });

  it('is pretty-printed with 2-space indent', async () => {
    const report = await generateCaseStudyReport(SITE_ID, RUN_ID, happyDeps());
    const json = generateJsonReport(report);
    // Pretty-printed JSON has newlines and indentation
    assert.ok(json.includes('\n'));
    assert.ok(json.includes('  "site"'));
  });
});
