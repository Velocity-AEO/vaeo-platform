/**
 * tools/orphaned/orphaned_page_issue_builder.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrphanedPageIssue,
  buildOrphanedPageIssues,
  prioritizeOrphanedPages,
  type OrphanedPageIssue,
} from './orphaned_page_issue_builder.ts';
import {
  FIX_RISK_MATRIX,
  getAutoApprovalThreshold,
  getMaxAutoApprovalsPerDay,
} from '../learning/fix_risk_matrix.ts';
import { shouldAutoApprove } from '../learning/learning_engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIssue(overrides?: Partial<OrphanedPageIssue>): OrphanedPageIssue {
  return buildOrphanedPageIssue(
    'site_1',
    'https://example.com/about',
    'About Us',
    0,
    ...([] as any),
  );
}

// ── buildOrphanedPageIssue ────────────────────────────────────────────────────

describe('buildOrphanedPageIssue', () => {
  it('sets issue_type to ORPHANED_PAGE', () => {
    const issue = buildOrphanedPageIssue('site_1', 'https://ex.com/a', 'Page A', 0);
    assert.equal(issue.issue_type, 'ORPHANED_PAGE');
  });

  it('sets severity to low', () => {
    const issue = buildOrphanedPageIssue('site_1', 'https://ex.com/a', 'Page A', 0);
    assert.equal(issue.severity, 'low');
  });

  it('sets confidence to 0.95', () => {
    const issue = buildOrphanedPageIssue('site_1', 'https://ex.com/a', 'Page A', 0);
    assert.equal(issue.confidence, 0.95);
  });

  it('sets fix_type to INTERNAL_LINK_SUGGESTION', () => {
    const issue = buildOrphanedPageIssue('site_1', 'https://ex.com/a', 'Page A', 0);
    assert.equal(issue.fix_type, 'INTERNAL_LINK_SUGGESTION');
  });

  it('includes domain in suggested_fix', () => {
    const issue = buildOrphanedPageIssue('site_1', 'https://example.com/about', 'About', 0);
    assert.ok(issue.suggested_fix.includes('example.com'));
  });

  it('handles null page_title gracefully', () => {
    const issue = buildOrphanedPageIssue('site_1', 'https://ex.com/a', null, 0);
    assert.equal(issue.page_title, null);
  });

  it('sets site_id from argument', () => {
    const issue = buildOrphanedPageIssue('my_site', 'https://ex.com/', null, 0);
    assert.equal(issue.site_id, 'my_site');
  });

  it('sets url from argument', () => {
    const issue = buildOrphanedPageIssue('s', 'https://ex.com/page', null, 3);
    assert.equal(issue.url, 'https://ex.com/page');
  });

  it('sets internal_link_count from argument', () => {
    const issue = buildOrphanedPageIssue('s', 'https://ex.com/page', null, 5);
    assert.equal(issue.internal_link_count, 5);
  });

  it('has detected_at as ISO string', () => {
    const issue = buildOrphanedPageIssue('s', 'https://ex.com/', null, 0);
    assert.ok(issue.detected_at.includes('T'));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() =>
      buildOrphanedPageIssue(null as never, null as never, null, 0),
    );
  });
});

// ── buildOrphanedPageIssues ───────────────────────────────────────────────────

describe('buildOrphanedPageIssues', () => {
  it('maps all pages to issues', () => {
    const pages = [
      { url: 'https://ex.com/a', page_title: 'A', internal_link_count: 0 },
      { url: 'https://ex.com/b', page_title: 'B', internal_link_count: 0 },
      { url: 'https://ex.com/c', page_title: null, internal_link_count: 0 },
    ];
    const issues = buildOrphanedPageIssues('site_1', pages);
    assert.equal(issues.length, 3);
  });

  it('returns empty array for empty input', () => {
    const issues = buildOrphanedPageIssues('site_1', []);
    assert.deepEqual(issues, []);
  });

  it('returns empty array for null input', () => {
    const issues = buildOrphanedPageIssues('site_1', null as never);
    assert.deepEqual(issues, []);
  });

  it('every issue has correct issue_type', () => {
    const pages = [
      { url: 'https://ex.com/x', page_title: 'X', internal_link_count: 0 },
    ];
    const [issue] = buildOrphanedPageIssues('site_1', pages);
    assert.equal(issue!.issue_type, 'ORPHANED_PAGE');
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() =>
      buildOrphanedPageIssues(null as never, undefined as never),
    );
  });
});

// ── prioritizeOrphanedPages ───────────────────────────────────────────────────

describe('prioritizeOrphanedPages', () => {
  it('puts titled pages first', () => {
    const issues: OrphanedPageIssue[] = [
      buildOrphanedPageIssue('s', 'https://ex.com/b', null, 0),
      buildOrphanedPageIssue('s', 'https://ex.com/a', 'Titled Page', 0),
    ];
    const sorted = prioritizeOrphanedPages(issues);
    assert.equal(sorted[0]!.page_title, 'Titled Page');
  });

  it('sorts alphabetically within titled group', () => {
    const issues: OrphanedPageIssue[] = [
      buildOrphanedPageIssue('s', 'https://ex.com/z', 'Z Page', 0),
      buildOrphanedPageIssue('s', 'https://ex.com/a', 'A Page', 0),
      buildOrphanedPageIssue('s', 'https://ex.com/m', 'M Page', 0),
    ];
    const sorted = prioritizeOrphanedPages(issues);
    assert.ok(sorted[0]!.url < sorted[1]!.url);
    assert.ok(sorted[1]!.url < sorted[2]!.url);
  });

  it('sorts untitled pages alphabetically after titled', () => {
    const issues: OrphanedPageIssue[] = [
      buildOrphanedPageIssue('s', 'https://ex.com/z', null, 0),
      buildOrphanedPageIssue('s', 'https://ex.com/a', 'A Title', 0),
      buildOrphanedPageIssue('s', 'https://ex.com/b', null, 0),
    ];
    const sorted = prioritizeOrphanedPages(issues);
    // First should be titled
    assert.equal(sorted[0]!.page_title, 'A Title');
    // Untitled should be sorted alphabetically
    assert.ok(sorted[1]!.url < sorted[2]!.url);
  });

  it('handles empty array', () => {
    assert.deepEqual(prioritizeOrphanedPages([]), []);
  });

  it('handles null input', () => {
    assert.deepEqual(prioritizeOrphanedPages(null as never), []);
  });

  it('does not mutate original array', () => {
    const issues: OrphanedPageIssue[] = [
      buildOrphanedPageIssue('s', 'https://ex.com/z', 'Z', 0),
      buildOrphanedPageIssue('s', 'https://ex.com/a', 'A', 0),
    ];
    const original = [...issues];
    prioritizeOrphanedPages(issues);
    assert.deepEqual(issues.map(i => i.url), original.map(i => i.url));
  });
});

// ── fix_risk_matrix: ORPHANED_PAGE ────────────────────────────────────────────

describe('fix_risk_matrix — ORPHANED_PAGE', () => {
  it('has ORPHANED_PAGE entry in FIX_RISK_MATRIX', () => {
    assert.ok('ORPHANED_PAGE' in FIX_RISK_MATRIX);
  });

  it('ORPHANED_PAGE threshold is > 1.0 (never auto-approvable)', () => {
    const threshold = getAutoApprovalThreshold('ORPHANED_PAGE');
    assert.ok(threshold > 1.0, `Expected > 1.0, got ${threshold}`);
  });

  it('ORPHANED_PAGE max_auto_approvals_per_day is 0', () => {
    const max = getMaxAutoApprovalsPerDay('ORPHANED_PAGE');
    assert.equal(max, 0);
  });

  it('ORPHANED_PAGE has reason about human judgment', () => {
    const profile = FIX_RISK_MATRIX['ORPHANED_PAGE']!;
    assert.ok(profile.reason.toLowerCase().includes('human'));
  });
});

// ── learning_engine: never auto-approves ORPHANED_PAGE ────────────────────────

describe('learning_engine — ORPHANED_PAGE never auto-approves', () => {
  it('never auto-approves even with confidence 1.0', async () => {
    const decision = await shouldAutoApprove({
      issue_type:          'ORPHANED_PAGE',
      confidence:          1.0,
      sandbox_passed:      true,
      viewport_qa_passed:  true,
    }, 'site_1', {
      getDailyCount: async () => 0,
    });
    assert.equal(decision.approved, false);
  });

  it('never auto-approves with confidence 0.99', async () => {
    const decision = await shouldAutoApprove({
      issue_type:          'ORPHANED_PAGE',
      confidence:          0.99,
      sandbox_passed:      true,
      viewport_qa_passed:  true,
    }, 'site_1', {
      getDailyCount: async () => 0,
    });
    assert.equal(decision.approved, false);
  });
});
