/**
 * tools/email/digest.test.ts
 *
 * Tests for generateDigest — weekly SEO digest report generation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateDigest,
  type DigestDeps,
  type ActionRow,
  type HealthSnapshotRow,
} from './digest.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

const SITE_ID   = 'site-001';
const TENANT_ID = 'tenant-001';

function makeDeps(overrides?: Partial<DigestDeps>): DigestDeps {
  return {
    getSiteUrl:           async () => 'https://example.com',
    getRecentActions:     async () => [],
    getOpenIssueCount:    async () => 0,
    getHealthScoreBefore: async () => ({ score: 72, grade: 'C', recorded_at: '2026-03-03T00:00:00Z' }),
    getHealthScoreNow:    async () => ({ score: 85, grade: 'B', recorded_at: '2026-03-10T00:00:00Z' }),
    ...overrides,
  };
}

function makeActions(statuses: string[]): ActionRow[] {
  return statuses.map((s, i) => ({
    id:               `action-${i}`,
    issue_type:       'title_missing',
    url:              `https://example.com/page-${i}`,
    execution_status: s,
    updated_at:       '2026-03-09T12:00:00Z',
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateDigest', () => {
  it('returns a valid DigestReport with all fields', async () => {
    const report = await generateDigest(SITE_ID, TENANT_ID, makeDeps());

    assert.equal(report.site_id, SITE_ID);
    assert.equal(report.tenant_id, TENANT_ID);
    assert.equal(report.site_url, 'https://example.com');
    assert.equal(report.health_before, 72);
    assert.equal(report.health_after, 85);
    assert.equal(report.grade_before, 'C');
    assert.equal(report.grade_after, 'B');
    assert.equal(typeof report.generated_at, 'string');
    assert.equal(report.error, undefined);
  });

  it('counts deployed and verified as fixes_applied', async () => {
    const deps = makeDeps({
      getRecentActions: async () => makeActions([
        'deployed', 'verified', 'queued', 'failed',
      ]),
    });

    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.equal(report.fixes_applied, 2);
  });

  it('counts deployed, verified, and rolled_back as issues_resolved', async () => {
    const deps = makeDeps({
      getRecentActions: async () => makeActions([
        'deployed', 'verified', 'rolled_back', 'queued',
      ]),
    });

    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.equal(report.issues_resolved, 3);
  });

  it('reports open issue count from deps', async () => {
    const deps = makeDeps({ getOpenIssueCount: async () => 7 });
    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.equal(report.issues_remaining, 7);
  });

  it('generates a top_win from the most common deployed issue type', async () => {
    const deps = makeDeps({
      getRecentActions: async () => [
        { id: 'a1', issue_type: 'title_missing',  url: '/p1', execution_status: 'deployed',  updated_at: '' },
        { id: 'a2', issue_type: 'title_missing',  url: '/p2', execution_status: 'deployed',  updated_at: '' },
        { id: 'a3', issue_type: 'meta_missing',   url: '/p3', execution_status: 'verified',  updated_at: '' },
        { id: 'a4', issue_type: 'schema_missing', url: '/p4', execution_status: 'queued',    updated_at: '' },
      ],
    });

    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.match(report.top_win, /title missing/);
    assert.match(report.top_win, /2/);
  });

  it('returns "No fixes deployed" when no actions are deployed', async () => {
    const deps = makeDeps({
      getRecentActions: async () => makeActions(['queued', 'failed']),
    });

    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.match(report.top_win, /No fixes deployed/);
  });

  it('returns error report when site not found', async () => {
    const deps = makeDeps({ getSiteUrl: async () => null });
    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.equal(report.error, 'Site not found');
    assert.equal(report.site_url, '');
  });

  it('never throws — returns error report on deps failure', async () => {
    const deps = makeDeps({
      getSiteUrl: async () => { throw new Error('DB connection failed'); },
    });

    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.equal(report.error, 'DB connection failed');
    assert.equal(report.fixes_applied, 0);
  });

  it('defaults to grade F and score 0 when no health snapshots exist', async () => {
    const deps = makeDeps({
      getHealthScoreBefore: async () => null,
      getHealthScoreNow:    async () => null,
    });

    const report = await generateDigest(SITE_ID, TENANT_ID, deps);
    assert.equal(report.health_before, 0);
    assert.equal(report.health_after, 0);
    assert.equal(report.grade_before, 'F');
    assert.equal(report.grade_after, 'F');
  });

  it('passes the 7-day since threshold to getRecentActions', async () => {
    let capturedSince = '';
    const deps = makeDeps({
      getRecentActions: async (_siteId, _tenantId, since) => {
        capturedSince = since;
        return [];
      },
    });

    await generateDigest(SITE_ID, TENANT_ID, deps);

    // Since should be approximately 7 days ago
    const sinceDate = new Date(capturedSince);
    const diff = Date.now() - sinceDate.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(diff - sevenDaysMs) < 5000, 'since should be ~7 days ago');
  });
});
