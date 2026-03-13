/**
 * tools/scoring/health_score.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHealthScore,
  updateSiteHealthScore,
  calculateWeightedHealthScore,
  buildScoreBreakdown,
  getMostImpactfulIssue,
  type HealthScore,
  type HealthScoreDeps,
  type ScoreBreakdownEntry,
} from './health_score.js';
import type { IssueReport, Severity } from './issue_classifier.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    url:             'https://example.com/page',
    field:           'title',
    issue_type:      'title_missing',
    severity:        'critical',
    current_value:   null,
    char_count:      0,
    points_deducted: 3,
    ...overrides,
  };
}

function makeIssues(specs: Array<{ severity: Severity; points: number }>): IssueReport[] {
  return specs.map((s, i) =>
    makeIssue({
      url: `https://example.com/page-${i}`,
      severity: s.severity,
      points_deducted: s.points,
      issue_type: `test_issue_${i}`,
    }),
  );
}

// ── Score calculation ────────────────────────────────────────────────────────

describe('calculateHealthScore', () => {
  it('returns 100 for zero issues', () => {
    const hs = calculateHealthScore([], 10);
    assert.equal(hs.score, 100);
    assert.equal(hs.grade, 'A');
    assert.equal(hs.total_issues, 0);
  });

  it('score formula: 100 - (points / urls) * 10', () => {
    // 5 points across 10 URLs → 100 - (5/10)*10 = 95
    const issues = makeIssues([{ severity: 'critical', points: 3 }, { severity: 'major', points: 2 }]);
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 95);
  });

  it('score floors at 0', () => {
    // 100 points across 1 URL → 100 - (100/1)*10 = -900 → 0
    const issues: IssueReport[] = [];
    for (let i = 0; i < 100; i++) {
      issues.push(makeIssue({ points_deducted: 1, issue_type: `issue_${i}`, url: `https://example.com/${i}` }));
    }
    const hs = calculateHealthScore(issues, 1);
    assert.equal(hs.score, 0);
  });

  it('score caps at 100', () => {
    const hs = calculateHealthScore([], 100);
    assert.equal(hs.score, 100);
  });

  it('handles total_urls = 0 without division by zero', () => {
    const hs = calculateHealthScore([], 0);
    assert.equal(hs.score, 100);
  });

  it('handles total_urls = 0 with issues', () => {
    const issues = [makeIssue({ points_deducted: 3 })];
    const hs = calculateHealthScore(issues, 0);
    // 100 - (3/1)*10 = 70 (uses max(0,1) guard)
    assert.equal(hs.score, 70);
  });

  it('counts issues_by_severity correctly', () => {
    const issues = [
      makeIssue({ severity: 'critical', points_deducted: 3 }),
      makeIssue({ severity: 'critical', points_deducted: 3 }),
      makeIssue({ severity: 'major', points_deducted: 2 }),
      makeIssue({ severity: 'minor', points_deducted: 1 }),
      makeIssue({ severity: 'minor', points_deducted: 1 }),
      makeIssue({ severity: 'minor', points_deducted: 1 }),
    ];
    const hs = calculateHealthScore(issues, 100);
    assert.equal(hs.issues_by_severity.critical, 2);
    assert.equal(hs.issues_by_severity.major, 1);
    assert.equal(hs.issues_by_severity.minor, 3);
  });

  it('total_issues equals input length', () => {
    const issues = [makeIssue(), makeIssue(), makeIssue()];
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.total_issues, 3);
  });

  it('breakdown lists issue types with counts', () => {
    const issues = [
      makeIssue({ issue_type: 'title_missing' }),
      makeIssue({ issue_type: 'title_missing' }),
      makeIssue({ issue_type: 'h1_missing' }),
    ];
    const hs = calculateHealthScore(issues, 10);
    assert.ok(hs.breakdown.some((b) => b.includes('title_missing') && b.includes('2')));
    assert.ok(hs.breakdown.some((b) => b.includes('h1_missing') && b.includes('1')));
  });

  it('breakdown is empty for zero issues', () => {
    const hs = calculateHealthScore([], 10);
    assert.equal(hs.breakdown.length, 0);
  });
});

// ── Grade thresholds ─────────────────────────────────────────────────────────

describe('grade thresholds', () => {
  it('A grade: score >= 90', () => {
    // 3 pts / 10 URLs → 100 - 3 = 97
    const hs = calculateHealthScore([makeIssue({ points_deducted: 3 })], 10);
    assert.equal(hs.score, 97);
    assert.equal(hs.grade, 'A');
  });

  it('A grade: exactly 90', () => {
    // 10 pts / 10 URLs → 100 - 10 = 90
    const issues = makeIssues([
      { severity: 'critical', points: 3 },
      { severity: 'critical', points: 3 },
      { severity: 'major', points: 2 },
      { severity: 'major', points: 2 },
    ]);
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 90);
    assert.equal(hs.grade, 'A');
  });

  it('B grade: score 75-89', () => {
    // 15 pts / 10 URLs → 100 - 15 = 85
    const issues = makeIssues([
      { severity: 'critical', points: 3 },
      { severity: 'critical', points: 3 },
      { severity: 'critical', points: 3 },
      { severity: 'critical', points: 3 },
      { severity: 'critical', points: 3 },
    ]);
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 85);
    assert.equal(hs.grade, 'B');
  });

  it('B grade: exactly 75', () => {
    // 25 pts / 10 URLs → 100 - 25 = 75
    const issues: IssueReport[] = [];
    for (let i = 0; i < 25; i++) {
      issues.push(makeIssue({ points_deducted: 1, severity: 'minor', issue_type: `m${i}` }));
    }
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 75);
    assert.equal(hs.grade, 'B');
  });

  it('C grade: score 55-74', () => {
    // 40 pts / 10 URLs → 100 - 40 = 60
    const issues: IssueReport[] = [];
    for (let i = 0; i < 40; i++) {
      issues.push(makeIssue({ points_deducted: 1, severity: 'minor' }));
    }
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 60);
    assert.equal(hs.grade, 'C');
  });

  it('C grade: exactly 55', () => {
    // 45 pts / 10 URLs → 100 - 45 = 55
    const issues: IssueReport[] = [];
    for (let i = 0; i < 45; i++) {
      issues.push(makeIssue({ points_deducted: 1, severity: 'minor' }));
    }
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 55);
    assert.equal(hs.grade, 'C');
  });

  it('D grade: score 35-54', () => {
    // 60 pts / 10 URLs → 100 - 60 = 40
    const issues: IssueReport[] = [];
    for (let i = 0; i < 60; i++) {
      issues.push(makeIssue({ points_deducted: 1, severity: 'minor' }));
    }
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 40);
    assert.equal(hs.grade, 'D');
  });

  it('D grade: exactly 35', () => {
    // 65 pts / 10 URLs → 100 - 65 = 35
    const issues: IssueReport[] = [];
    for (let i = 0; i < 65; i++) {
      issues.push(makeIssue({ points_deducted: 1, severity: 'minor' }));
    }
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 35);
    assert.equal(hs.grade, 'D');
  });

  it('F grade: score < 35', () => {
    // 70 pts / 10 URLs → 100 - 70 = 30
    const issues: IssueReport[] = [];
    for (let i = 0; i < 70; i++) {
      issues.push(makeIssue({ points_deducted: 1, severity: 'minor' }));
    }
    const hs = calculateHealthScore(issues, 10);
    assert.equal(hs.score, 30);
    assert.equal(hs.grade, 'F');
  });

  it('F grade: score 0', () => {
    const issues: IssueReport[] = [];
    for (let i = 0; i < 200; i++) {
      issues.push(makeIssue({ points_deducted: 3, severity: 'critical' }));
    }
    const hs = calculateHealthScore(issues, 1);
    assert.equal(hs.score, 0);
    assert.equal(hs.grade, 'F');
  });
});

// ── updateSiteHealthScore ────────────────────────────────────────────────────

describe('updateSiteHealthScore', () => {
  it('calls deps.updateSiteScore with site_id and score', async () => {
    let calledWith: { siteId: string; score: HealthScore } | null = null;
    const deps: HealthScoreDeps = {
      updateSiteScore: async (siteId, score) => {
        calledWith = { siteId, score };
      },
    };

    const score = calculateHealthScore([], 10);
    await updateSiteHealthScore('site-123', score, deps);

    assert.ok(calledWith !== null, 'updateSiteScore was called');
    assert.equal(calledWith!.siteId, 'site-123');
    assert.deepStrictEqual(calledWith!.score, score);
  });

  it('propagates errors from deps', async () => {
    const deps: HealthScoreDeps = {
      updateSiteScore: async () => {
        throw new Error('DB write failed');
      },
    };

    const score = calculateHealthScore([], 10);
    await assert.rejects(
      () => updateSiteHealthScore('site-123', score, deps),
      { message: 'DB write failed' },
    );
  });
});

// ── calculateWeightedHealthScore ─────────────────────────────────────────────

describe('calculateWeightedHealthScore', () => {
  it('starts at 100 with no issues', () => {
    assert.equal(calculateWeightedHealthScore([]), 100);
  });

  it('subtracts critical impact correctly', () => {
    // TITLE_MISSING = 15 pts
    const score = calculateWeightedHealthScore([
      { issue_type: 'TITLE_MISSING', status: 'open' },
    ]);
    assert.equal(score, 85);
  });

  it('subtracts multiple issues correctly', () => {
    // TITLE_MISSING (15) + ALT_MISSING (2) = 17
    const score = calculateWeightedHealthScore([
      { issue_type: 'TITLE_MISSING', status: 'open' },
      { issue_type: 'ALT_MISSING', status: 'open' },
    ]);
    assert.equal(score, 83);
  });

  it('floors at 0', () => {
    const issues = Array.from({ length: 20 }, () => ({
      issue_type: 'TITLE_MISSING', status: 'open',
    }));
    assert.equal(calculateWeightedHealthScore(issues), 0);
  });

  it('only counts open issues', () => {
    const score = calculateWeightedHealthScore([
      { issue_type: 'TITLE_MISSING', status: 'open' },
      { issue_type: 'ROBOTS_NOINDEX', status: 'applied' },
    ]);
    assert.equal(score, 85);
  });

  it('ignores applied fixes', () => {
    const score = calculateWeightedHealthScore([
      { issue_type: 'TITLE_MISSING', status: 'applied' },
    ]);
    assert.equal(score, 100);
  });

  it('uses default weight for unknown issue type', () => {
    // Default score_impact = 8
    const score = calculateWeightedHealthScore([
      { issue_type: 'SOMETHING_UNKNOWN', status: 'open' },
    ]);
    assert.equal(score, 92);
  });

  it('never throws on empty array', () => {
    assert.doesNotThrow(() => calculateWeightedHealthScore([]));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateWeightedHealthScore(null as any));
  });
});

// ── buildScoreBreakdown ──────────────────────────────────────────────────────

describe('buildScoreBreakdown', () => {
  it('groups by issue_type', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'TITLE_MISSING', status: 'open' },
      { issue_type: 'TITLE_MISSING', status: 'open' },
      { issue_type: 'ALT_MISSING', status: 'open' },
    ]);
    assert.equal(bd.length, 2);
    const title = bd.find(e => e.issue_type === 'TITLE_MISSING');
    assert.equal(title?.count, 2);
  });

  it('sorts by total_impact descending', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'ALT_MISSING', status: 'open' },
      { issue_type: 'TITLE_MISSING', status: 'open' },
    ]);
    assert.equal(bd[0].issue_type, 'TITLE_MISSING');
  });

  it('calculates count correctly', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'OG_MISSING', status: 'open' },
      { issue_type: 'OG_MISSING', status: 'open' },
      { issue_type: 'OG_MISSING', status: 'open' },
    ]);
    assert.equal(bd[0].count, 3);
    assert.equal(bd[0].total_impact, 15);
  });

  it('excludes applied issues', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'TITLE_MISSING', status: 'applied' },
    ]);
    assert.equal(bd.length, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildScoreBreakdown(null as any));
  });
});

// ── getMostImpactfulIssue ────────────────────────────────────────────────────

describe('getMostImpactfulIssue', () => {
  it('returns highest impact issue', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'ALT_MISSING', status: 'open' },
      { issue_type: 'TITLE_MISSING', status: 'open' },
    ]);
    assert.equal(getMostImpactfulIssue(bd), 'TITLE_MISSING');
  });

  it('returns null for empty', () => {
    assert.equal(getMostImpactfulIssue([]), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getMostImpactfulIssue(null as any));
  });
});

// ── severity count checks ────────────────────────────────────────────────────

describe('severity counts in breakdown', () => {
  it('critical_issue_count correct', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'TITLE_MISSING', status: 'open' },
      { issue_type: 'ROBOTS_NOINDEX', status: 'open' },
      { issue_type: 'ALT_MISSING', status: 'open' },
    ]);
    const critCount = bd.filter(e => e.severity === 'critical').reduce((s, e) => s + e.count, 0);
    assert.equal(critCount, 2);
  });

  it('high_issue_count correct', () => {
    const bd = buildScoreBreakdown([
      { issue_type: 'META_DESC_MISSING', status: 'open' },
      { issue_type: 'SCHEMA_MISSING', status: 'open' },
    ]);
    const highCount = bd.filter(e => e.severity === 'high').reduce((s, e) => s + e.count, 0);
    assert.equal(highCount, 2);
  });
});
