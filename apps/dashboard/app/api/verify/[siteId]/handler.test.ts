/**
 * app/api/verify/[siteId]/handler.test.ts
 *
 * Tests for getVerification — public verification endpoint.
 * All DB access mocked via injectable VerifyDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getVerification,
  type VerifyDeps,
  type SiteRow,
  type IssueRow,
} from './handler.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE_ID = 'site-verify-001';

function makeSite(overrides: Partial<SiteRow> = {}): SiteRow {
  return {
    site_id:  SITE_ID,
    site_url: 'https://example.com',
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    issue_type:       'META_TITLE_MISSING',
    execution_status: 'queued',
    ...overrides,
  };
}

function happyDeps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    loadSite:    async () => makeSite(),
    loadIssues:  async () => [],
    loadLastRun: async () => '2025-07-01T12:00:00Z',
    ...overrides,
  };
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe('getVerification — happy path', () => {
  it('returns ok with data', async () => {
    const result = await getVerification(SITE_ID, happyDeps());
    assert.equal(result.ok, true);
    assert.ok(result.data);
    assert.equal(result.error, undefined);
  });

  it('returns correct data shape', async () => {
    const result = await getVerification(SITE_ID, happyDeps());
    const d = result.data!;
    assert.equal(d.site_url, 'https://example.com');
    assert.equal(d.domain, 'example.com');
    assert.equal(typeof d.health_score, 'number');
    assert.equal(typeof d.grade, 'string');
    assert.equal(d.last_verified_at, '2025-07-01T12:00:00Z');
    assert.equal(typeof d.issues_resolved, 'number');
    assert.ok(Array.isArray(d.checks_performed));
    assert.ok(['verified', 'needs_work', 'inactive'].includes(d.badge_state));
  });

  it('strips https:// from domain', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadSite: async () => makeSite({ site_url: 'https://myshop.com' }),
    }));
    assert.equal(result.data!.domain, 'myshop.com');
  });

  it('strips http:// from domain', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadSite: async () => makeSite({ site_url: 'http://myshop.com' }),
    }));
    assert.equal(result.data!.domain, 'myshop.com');
  });
});

// ── Health scoring ────────────────────────────────────────────────────────────

describe('getVerification — health scoring', () => {
  it('perfect score (100/A) when no issues', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [],
    }));
    assert.equal(result.data!.health_score, 100);
    assert.equal(result.data!.grade, 'A');
  });

  it('score decreases with open issues', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [
        makeIssue({ issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }),
        makeIssue({ issue_type: 'META_DESC_MISSING',  execution_status: 'pending_approval' }),
        makeIssue({ issue_type: 'H1_MISSING',         execution_status: 'failed' }),
      ],
    }));
    assert.ok(result.data!.health_score < 100);
  });

  it('fixed issues do not reduce score', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [
        makeIssue({ issue_type: 'META_TITLE_MISSING', execution_status: 'deployed' }),
        makeIssue({ issue_type: 'H1_MISSING',         execution_status: 'completed' }),
      ],
    }));
    assert.equal(result.data!.health_score, 100);
    assert.equal(result.data!.grade, 'A');
  });
});

// ── Issues resolved ──────────────────────────────────────────────────────────

describe('getVerification — issues resolved count', () => {
  it('counts deployed + completed + approved as resolved', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [
        makeIssue({ execution_status: 'deployed' }),
        makeIssue({ execution_status: 'completed' }),
        makeIssue({ execution_status: 'approved' }),
        makeIssue({ execution_status: 'queued' }),
        makeIssue({ execution_status: 'failed' }),
      ],
    }));
    assert.equal(result.data!.issues_resolved, 3);
  });

  it('zero when no fixed issues', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [
        makeIssue({ execution_status: 'queued' }),
      ],
    }));
    assert.equal(result.data!.issues_resolved, 0);
  });
});

// ── Badge state ──────────────────────────────────────────────────────────────

describe('getVerification — badge state', () => {
  it('verified when score >= 70 and recent run', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues:  async () => [],  // score = 100
      loadLastRun: async () => new Date().toISOString(),
    }));
    assert.equal(result.data!.badge_state, 'verified');
  });

  it('needs_work when score < 70 and recent run', async () => {
    // Generate enough open issues to drop below 70
    const issues: IssueRow[] = [];
    for (let i = 0; i < 10; i++) {
      issues.push(makeIssue({ issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }));
    }
    for (let i = 0; i < 10; i++) {
      issues.push(makeIssue({ issue_type: 'H1_MISSING', execution_status: 'queued' }));
    }
    for (let i = 0; i < 10; i++) {
      issues.push(makeIssue({ issue_type: 'SCHEMA_MISSING', execution_status: 'queued' }));
    }
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues:  async () => issues,
      loadLastRun: async () => new Date().toISOString(),
    }));
    assert.equal(result.data!.badge_state, 'needs_work');
  });

  it('inactive when no last run', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadLastRun: async () => null,
    }));
    assert.equal(result.data!.badge_state, 'inactive');
  });

  it('inactive when last run is stale (> 30 days)', async () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const result = await getVerification(SITE_ID, happyDeps({
      loadLastRun: async () => staleDate,
    }));
    assert.equal(result.data!.badge_state, 'inactive');
  });
});

// ── Checks performed ─────────────────────────────────────────────────────────

describe('getVerification — checks performed', () => {
  it('always includes core checks even with no issues', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [],
    }));
    const checks = result.data!.checks_performed;
    assert.ok(checks.includes('Page titles'));
    assert.ok(checks.includes('Meta descriptions'));
    assert.ok(checks.includes('Heading structure'));
    assert.ok(checks.includes('Canonical links'));
    assert.ok(checks.includes('Structured data'));
  });

  it('includes additional check categories from issues', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => [
        makeIssue({ issue_type: 'ERR_404', execution_status: 'deployed' }),
      ],
    }));
    assert.ok(result.data!.checks_performed.includes('Broken links (404)'));
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('getVerification — validation', () => {
  it('returns error when site_id is empty', async () => {
    const result = await getVerification('', happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('site_id is required'));
  });

  it('returns error when site not found', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadSite: async () => null,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Site not found');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('getVerification — error handling', () => {
  it('returns error when loadSite throws', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadSite: async () => { throw new Error('db connection failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('db connection failed'));
  });

  it('returns error when loadIssues throws', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadIssues: async () => { throw new Error('issues query failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('issues query failed'));
  });

  it('returns error when loadLastRun throws', async () => {
    const result = await getVerification(SITE_ID, happyDeps({
      loadLastRun: async () => { throw new Error('log query failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('log query failed'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      getVerification(SITE_ID, happyDeps({
        loadSite: async () => { throw new Error('crash'); },
      })),
    );
  });
});
