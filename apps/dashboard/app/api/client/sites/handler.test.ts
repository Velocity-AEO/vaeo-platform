/**
 * app/api/client/sites/handler.test.ts
 *
 * Tests for getClientSites — tenant-scoped site listing with health scores.
 * All DB access mocked via injectable ClientSitesDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getClientSites,
  type ClientSitesDeps,
  type SiteRow,
  type IssueRow,
} from './handler.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-001';

let siteCounter = 0;
function makeSite(overrides: Partial<SiteRow> = {}): SiteRow {
  siteCounter++;
  return {
    site_id:        `site-${siteCounter.toString().padStart(3, '0')}`,
    site_url:       `https://store${siteCounter}.myshopify.com`,
    cms_type:       'shopify',
    created_at:     '2025-01-15T00:00:00Z',
    health_score:   null,
    health_grade:   null,
    last_scored_at: null,
    ...overrides,
  };
}

function makeIssue(siteId: string, overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    site_id:          siteId,
    issue_type:       'META_TITLE_MISSING',
    execution_status: 'queued',
    ...overrides,
  };
}

function happyDeps(overrides: Partial<ClientSitesDeps> = {}): ClientSitesDeps {
  return {
    loadSites:     async () => [makeSite()],
    loadAllIssues: async () => [],
    loadLastScans: async () => new Map(),
    ...overrides,
  };
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe('getClientSites — happy path', () => {
  it('returns ok with sites array', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps());
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.sites));
    assert.equal(result.error, undefined);
  });

  it('returns correct site shape', async () => {
    const site = makeSite({ site_url: 'https://myshop.myshopify.com' });
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
    }));
    const s = result.sites![0];
    assert.equal(s.site_id, site.site_id);
    assert.equal(s.site_url, 'https://myshop.myshopify.com');
    assert.equal(s.domain, 'myshop.myshopify.com');
    assert.equal(s.cms_type, 'shopify');
    assert.equal(typeof s.health_score, 'number');
    assert.equal(typeof s.health_grade, 'string');
    assert.equal(typeof s.grade, 'string');
    assert.equal(typeof s.issues_found, 'number');
    assert.equal(typeof s.issues_fixed, 'number');
    assert.equal(s.created_at, site.created_at);
  });

  it('strips https:// from domain', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [makeSite({ site_url: 'https://example.com' })],
    }));
    assert.equal(result.sites![0].domain, 'example.com');
  });

  it('strips http:// from domain', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [makeSite({ site_url: 'http://example.com' })],
    }));
    assert.equal(result.sites![0].domain, 'example.com');
  });

  it('returns multiple sites', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [makeSite(), makeSite(), makeSite()],
    }));
    assert.equal(result.sites!.length, 3);
  });

  it('returns empty array when tenant has no sites', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.sites!.length, 0);
  });
});

// ── Health scoring ────────────────────────────────────────────────────────────

describe('getClientSites — health scoring', () => {
  it('perfect score (100/A) when no open issues', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [],
    }));
    assert.equal(result.sites![0].health_score, 100);
    assert.equal(result.sites![0].grade, 'A');
  });

  it('score decreases with open issues', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [
        makeIssue(site.site_id, { issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }),
        makeIssue(site.site_id, { issue_type: 'META_DESC_MISSING', execution_status: 'pending_approval' }),
        makeIssue(site.site_id, { issue_type: 'H1_MISSING', execution_status: 'failed' }),
      ],
    }));
    assert.ok(result.sites![0].health_score < 100);
  });

  it('fixed issues do not reduce score', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [
        makeIssue(site.site_id, { issue_type: 'META_TITLE_MISSING', execution_status: 'deployed' }),
        makeIssue(site.site_id, { issue_type: 'H1_MISSING', execution_status: 'completed' }),
      ],
    }));
    assert.equal(result.sites![0].health_score, 100);
    assert.equal(result.sites![0].grade, 'A');
  });

  it('scopes issues to correct site', async () => {
    const site1 = makeSite();
    const site2 = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site1, site2],
      loadAllIssues: async () => [
        // Only site1 has issues
        makeIssue(site1.site_id, { issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }),
        makeIssue(site1.site_id, { issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }),
        makeIssue(site1.site_id, { issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }),
      ],
    }));
    const s1 = result.sites!.find((s) => s.site_id === site1.site_id)!;
    const s2 = result.sites!.find((s) => s.site_id === site2.site_id)!;
    assert.ok(s1.health_score < 100);
    assert.equal(s2.health_score, 100);
  });
});

// ── Stored health score (from onboard/audit write) ───────────────────────────

describe('getClientSites — stored health score', () => {
  it('uses stored health_score and health_grade from DB when present', async () => {
    const site = makeSite({ health_score: 72, health_grade: 'B' });
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      // Issues would otherwise compute a different score
      loadAllIssues: async () => [
        makeIssue(site.site_id, { issue_type: 'META_TITLE_MISSING', execution_status: 'queued' }),
        makeIssue(site.site_id, { issue_type: 'H1_MISSING', execution_status: 'queued' }),
      ],
    }));
    assert.equal(result.sites![0].health_score, 72);
    assert.equal(result.sites![0].health_grade, 'B');
    assert.equal(result.sites![0].grade, 'B');
  });

  it('falls back to computed score when stored values are null', async () => {
    const site = makeSite({ health_score: null, health_grade: null });
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [],
    }));
    assert.equal(result.sites![0].health_score, 100);
    assert.equal(result.sites![0].health_grade, 'A');
  });

  it('includes last_scored_at when stored', async () => {
    const ts = '2026-03-10T12:00:00Z';
    const site = makeSite({ last_scored_at: ts });
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
    }));
    assert.equal(result.sites![0].last_scored_at, ts);
  });

  it('last_scored_at is null when not yet scored', async () => {
    const site = makeSite({ last_scored_at: null });
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
    }));
    assert.equal(result.sites![0].last_scored_at, null);
  });

  it('grade is an alias for health_grade', async () => {
    const site = makeSite({ health_grade: 'C' });
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
    }));
    assert.equal(result.sites![0].grade, result.sites![0].health_grade);
  });
});

// ── Issue counts ──────────────────────────────────────────────────────────────

describe('getClientSites — issue counts', () => {
  it('issues_found counts all issues for the site', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [
        makeIssue(site.site_id, { execution_status: 'queued' }),
        makeIssue(site.site_id, { execution_status: 'deployed' }),
        makeIssue(site.site_id, { execution_status: 'failed' }),
        makeIssue(site.site_id, { execution_status: 'completed' }),
      ],
    }));
    assert.equal(result.sites![0].issues_found, 4);
  });

  it('issues_fixed counts deployed + completed + approved', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [
        makeIssue(site.site_id, { execution_status: 'deployed' }),
        makeIssue(site.site_id, { execution_status: 'completed' }),
        makeIssue(site.site_id, { execution_status: 'approved' }),
        makeIssue(site.site_id, { execution_status: 'queued' }),
        makeIssue(site.site_id, { execution_status: 'failed' }),
      ],
    }));
    assert.equal(result.sites![0].issues_fixed, 3);
  });

  it('zero counts when no issues', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadAllIssues: async () => [],
    }));
    assert.equal(result.sites![0].issues_found, 0);
    assert.equal(result.sites![0].issues_fixed, 0);
  });
});

// ── Last scan ─────────────────────────────────────────────────────────────────

describe('getClientSites — last scan', () => {
  it('includes last_scan timestamp when available', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadLastScans: async () => new Map([[site.site_id, '2025-06-01T12:00:00Z']]),
    }));
    assert.equal(result.sites![0].last_scan, '2025-06-01T12:00:00Z');
  });

  it('last_scan is null when no scans', async () => {
    const site = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site],
      loadLastScans: async () => new Map(),
    }));
    assert.equal(result.sites![0].last_scan, null);
  });

  it('matches scan to correct site', async () => {
    const site1 = makeSite();
    const site2 = makeSite();
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => [site1, site2],
      loadLastScans: async () => new Map([[site2.site_id, '2025-07-01T00:00:00Z']]),
    }));
    const s1 = result.sites!.find((s) => s.site_id === site1.site_id)!;
    const s2 = result.sites!.find((s) => s.site_id === site2.site_id)!;
    assert.equal(s1.last_scan, null);
    assert.equal(s2.last_scan, '2025-07-01T00:00:00Z');
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('getClientSites — validation', () => {
  it('returns error when tenant_id is empty', async () => {
    const result = await getClientSites('', happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('tenant_id is required'));
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('getClientSites — error handling', () => {
  it('returns error when loadSites throws', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadSites: async () => { throw new Error('sites query failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('sites query failed'));
  });

  it('returns error when loadAllIssues throws', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadAllIssues: async () => { throw new Error('issues query failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('issues query failed'));
  });

  it('returns error when loadLastScans throws', async () => {
    const result = await getClientSites(TENANT_ID, happyDeps({
      loadLastScans: async () => { throw new Error('scans query failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('scans query failed'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      getClientSites(TENANT_ID, happyDeps({
        loadSites: async () => { throw new Error('crash'); },
      })),
    );
  });
});
