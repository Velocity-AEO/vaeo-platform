/**
 * app/api/sites/[siteId]/health/handler.test.ts
 *
 * Unit tests for getHealthData() and classifyIssueSeverity().
 * Uses injectable SiteHealthDeps — no real Supabase calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHealthData,
  classifyIssueSeverity,
  type SiteHealthDeps,
  type IssueRow,
} from './handler.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE_ID = 'site-uuid-0001';
const LAST_UPDATED = '2026-03-10T12:00:00.000Z';

const BASE_SITE = {
  site_id:  SITE_ID,
  site_url: 'https://example.com',
  cms_type: 'shopify',
};

function makeIssue(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    id:               'issue-1',
    issue_type:       'ERR_404',
    url:              'https://example.com/missing',
    risk_score:       8,
    priority:         3,
    execution_status: 'queued',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SiteHealthDeps> = {}): SiteHealthDeps {
  return {
    getSite:        async () => BASE_SITE,
    getOpenIssues:  async () => [],
    getLastUpdated: async () => LAST_UPDATED,
    ...overrides,
  };
}

// ── classifyIssueSeverity ─────────────────────────────────────────────────────

describe('classifyIssueSeverity', () => {
  it('ERR_404 → critical', () => assert.equal(classifyIssueSeverity('ERR_404'), 'critical'));
  it('ERR_500 → critical', () => assert.equal(classifyIssueSeverity('ERR_500'), 'critical'));
  it('ERR_REDIRECT_CHAIN → critical (starts with ERR_)', () =>
    assert.equal(classifyIssueSeverity('ERR_REDIRECT_CHAIN'), 'critical'));
  it('H1_MISSING → critical', () => assert.equal(classifyIssueSeverity('H1_MISSING'), 'critical'));
  it('CANONICAL_MISSING → critical', () =>
    assert.equal(classifyIssueSeverity('CANONICAL_MISSING'), 'critical'));

  it('META_TITLE_MISSING → major', () =>
    assert.equal(classifyIssueSeverity('META_TITLE_MISSING'), 'major'));
  it('META_DESC_MISSING → major', () =>
    assert.equal(classifyIssueSeverity('META_DESC_MISSING'), 'major'));
  it('META_TITLE_DUPLICATE → major', () =>
    assert.equal(classifyIssueSeverity('META_TITLE_DUPLICATE'), 'major'));
  it('SCHEMA_MISSING → major', () =>
    assert.equal(classifyIssueSeverity('SCHEMA_MISSING'), 'major'));
  it('SCHEMA_DUPLICATE → major', () =>
    assert.equal(classifyIssueSeverity('SCHEMA_DUPLICATE'), 'major'));
  it('H1_DUPLICATE → major', () =>
    assert.equal(classifyIssueSeverity('H1_DUPLICATE'), 'major'));
  it('CANONICAL_MISMATCH → minor (contains neither MISSING nor DUPLICATE)', () => {
    assert.equal(classifyIssueSeverity('CANONICAL_MISMATCH'), 'minor');
  });
  it('SCHEMA_INVALID_JSON → minor (no MISSING or DUPLICATE)', () =>
    assert.equal(classifyIssueSeverity('SCHEMA_INVALID_JSON'), 'minor'));
  it('CUSTOM_UNKNOWN_ISSUE → minor', () =>
    assert.equal(classifyIssueSeverity('CUSTOM_UNKNOWN_ISSUE'), 'minor'));
});

// ── getHealthData ─────────────────────────────────────────────────────────────

describe('getHealthData', () => {
  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('no open issues → score.total=100, score.grade=A, empty top_issues, all severity counts=0', async () => {
    const result = await getHealthData(SITE_ID, makeDeps());
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    const d = result.data!;
    assert.equal(d.score.total, 100);
    assert.equal(d.score.grade, 'A');
    assert.deepEqual(d.top_issues, []);
    assert.deepEqual(d.issues_by_severity, { critical: 0, major: 0, minor: 0 });
  });

  it('site_url = site.site_url', async () => {
    const result = await getHealthData(SITE_ID, makeDeps());
    assert.equal(result.data!.site_url, 'https://example.com');
  });

  it('cms_type = site.cms_type', async () => {
    const result = await getHealthData(SITE_ID, makeDeps());
    assert.equal(result.data!.cms_type, 'shopify');
  });

  it('total_issues = number of open issues', async () => {
    const issues = [makeIssue({ id: '1' }), makeIssue({ id: '2' })];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    assert.equal(result.data!.total_issues, 2);
  });

  it('score includes technical, content, schema sub-scores', async () => {
    const result = await getHealthData(SITE_ID, makeDeps());
    const s = result.data!.score;
    assert.equal(typeof s.technical, 'number');
    assert.equal(typeof s.content, 'number');
    assert.equal(typeof s.schema, 'number');
    assert.equal(s.total, s.technical + s.content + s.schema);
  });

  it('site_id echoed in response', async () => {
    const result = await getHealthData(SITE_ID, makeDeps());
    assert.equal(result.data!.site_id, SITE_ID);
  });

  it('last_updated = value from getLastUpdated', async () => {
    const result = await getHealthData(SITE_ID, makeDeps());
    assert.equal(result.data!.last_updated, LAST_UPDATED);
  });

  it('last_updated = null when getLastUpdated returns null', async () => {
    const result = await getHealthData(SITE_ID, makeDeps({ getLastUpdated: async () => null }));
    assert.equal(result.data!.last_updated, null);
  });

  it('score.total decreases when ERR_404 issues present', async () => {
    const issues = [
      makeIssue({ id: '1', issue_type: 'ERR_404' }),
      makeIssue({ id: '2', issue_type: 'ERR_404' }),
    ];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    assert.ok(result.data!.score.total < 100, `expected score < 100, got ${result.data!.score.total}`);
  });

  it('score.grade is F when enough critical issues present', async () => {
    // 3 ERR_404 (8pts each capped at 24) + 3 ERR_500 (8 each capped at 24)
    // technical = 40 - 24 - 24 = max(0) = 0; content+schema = 35+25 = 60? No wait...
    // Actually: technical = max(0, 40 - 24 - 24) = 0; content = 35; schema = 25; total = 60 → C
    // We need enough to get to F (<30): add content issues too
    const issues = [
      ...Array.from({ length: 6 }, (_, i) => makeIssue({ id: `e${i}`, issue_type: 'ERR_404' })),
      ...Array.from({ length: 6 }, (_, i) => makeIssue({ id: `t${i}`, issue_type: 'META_TITLE_MISSING' })),
      ...Array.from({ length: 5 }, (_, i) => makeIssue({ id: `d${i}`, issue_type: 'META_DESC_MISSING' })),
      ...Array.from({ length: 4 }, (_, i) => makeIssue({ id: `s${i}`, issue_type: 'SCHEMA_MISSING' })),
    ];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    // technical = max(0, 40-24) = 16, content = max(0, 35-20-15) = 0, schema = max(0, 25-12) = 13 → total = 29 → F
    assert.ok(result.data!.score.total < 30, `Expected grade F score, got ${result.data!.score.total}`);
    assert.equal(result.data!.score.grade, 'F');
  });

  // ── issues_by_severity ────────────────────────────────────────────────────

  it('issues_by_severity counts are correct', async () => {
    const issues: IssueRow[] = [
      makeIssue({ id: '1', issue_type: 'ERR_404' }),           // critical
      makeIssue({ id: '2', issue_type: 'H1_MISSING' }),         // critical
      makeIssue({ id: '3', issue_type: 'META_TITLE_MISSING' }), // major
      makeIssue({ id: '4', issue_type: 'SCHEMA_DUPLICATE' }),   // major
      makeIssue({ id: '5', issue_type: 'SCHEMA_INVALID_JSON' }), // minor
    ];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    assert.deepEqual(result.data!.issues_by_severity, { critical: 2, major: 2, minor: 1 });
  });

  it('CANONICAL_MISSING counted as critical, not major', async () => {
    const issues = [makeIssue({ id: '1', issue_type: 'CANONICAL_MISSING' })];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    assert.deepEqual(result.data!.issues_by_severity, { critical: 1, major: 0, minor: 0 });
  });

  // ── top_issues ────────────────────────────────────────────────────────────

  it('top_issues limited to 5', async () => {
    const issues = Array.from({ length: 10 }, (_, i) =>
      makeIssue({ id: `i${i}`, risk_score: 10 - i, priority: i }),
    );
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    assert.equal(result.data!.top_issues.length, 5);
  });

  it('top_issues ordered by risk_score descending', async () => {
    const issues = [
      makeIssue({ id: 'low',  risk_score: 2, priority: 1 }),
      makeIssue({ id: 'high', risk_score: 9, priority: 1 }),
      makeIssue({ id: 'mid',  risk_score: 5, priority: 1 }),
    ];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    const ids = result.data!.top_issues.map((t) => t.id);
    assert.deepEqual(ids, ['high', 'mid', 'low']);
  });

  it('top_issues tie-break by priority descending when risk_score equal', async () => {
    const issues = [
      makeIssue({ id: 'p1', risk_score: 5, priority: 1 }),
      makeIssue({ id: 'p3', risk_score: 5, priority: 3 }),
      makeIssue({ id: 'p2', risk_score: 5, priority: 2 }),
    ];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    const ids = result.data!.top_issues.map((t) => t.id);
    assert.deepEqual(ids, ['p3', 'p2', 'p1']);
  });

  it('top_issues include severity field', async () => {
    const issues = [
      makeIssue({ id: '1', issue_type: 'ERR_404' }),
      makeIssue({ id: '2', issue_type: 'META_TITLE_MISSING' }),
      makeIssue({ id: '3', issue_type: 'SCHEMA_INVALID_JSON' }),
    ];
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    const severities = result.data!.top_issues.map((t) => t.severity);
    assert.deepEqual(severities, ['critical', 'major', 'minor']);
  });

  it('top_issues include all required fields', async () => {
    const issue = makeIssue({
      id: 'test-id',
      issue_type: 'ERR_404',
      url: 'https://example.com/broken',
      risk_score: 8,
      priority: 3,
      execution_status: 'queued',
    });
    const result = await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => [issue] }));
    const top = result.data!.top_issues[0];
    assert.equal(top.id, 'test-id');
    assert.equal(top.issue_type, 'ERR_404');
    assert.equal(top.url, 'https://example.com/broken');
    assert.equal(top.risk_score, 8);
    assert.equal(top.priority, 3);
    assert.equal(top.execution_status, 'queued');
    assert.equal(top.severity, 'critical');
  });

  it('original issues array not mutated by top_issues sort', async () => {
    const issues = [
      makeIssue({ id: 'a', risk_score: 3 }),
      makeIssue({ id: 'b', risk_score: 9 }),
      makeIssue({ id: 'c', risk_score: 1 }),
    ];
    const originalOrder = issues.map((i) => i.id);
    await getHealthData(SITE_ID, makeDeps({ getOpenIssues: async () => issues }));
    assert.deepEqual(issues.map((i) => i.id), originalOrder);
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it('site not found → status=404, ok=false', async () => {
    const result = await getHealthData(SITE_ID, makeDeps({ getSite: async () => null }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.ok(result.error?.includes('not found'));
    assert.equal(result.data, undefined);
  });

  it('getSite throws → status=500, error propagated', async () => {
    const result = await getHealthData(
      SITE_ID,
      makeDeps({ getSite: async () => { throw new Error('DB connection refused'); } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.ok(result.error?.includes('DB connection refused'));
  });

  it('getOpenIssues throws → status=500', async () => {
    const result = await getHealthData(
      SITE_ID,
      makeDeps({ getOpenIssues: async () => { throw new Error('query timeout'); } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.ok(result.error?.includes('query timeout'));
  });

  it('getLastUpdated throws → status=500 (Promise.all rejects)', async () => {
    const result = await getHealthData(
      SITE_ID,
      makeDeps({ getLastUpdated: async () => { throw new Error('timestamp error'); } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
  });

  // ── Concurrency: all three deps called ────────────────────────────────────

  it('getSite, getOpenIssues, and getLastUpdated are all called', async () => {
    const called: string[] = [];
    const deps = makeDeps({
      getSite:        async () => { called.push('getSite');        return BASE_SITE; },
      getOpenIssues:  async () => { called.push('getOpenIssues');  return []; },
      getLastUpdated: async () => { called.push('getLastUpdated'); return null; },
    });
    await getHealthData(SITE_ID, deps);
    assert.ok(called.includes('getSite'));
    assert.ok(called.includes('getOpenIssues'));
    assert.ok(called.includes('getLastUpdated'));
  });
});
