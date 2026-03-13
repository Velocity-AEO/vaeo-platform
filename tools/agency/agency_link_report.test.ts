/**
 * tools/agency/agency_link_report.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyLinkReport,
  type AgencyLinkHealthSummary,
} from './agency_link_report.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const AGENCY_ID = 'agency_test';

function makeSiteGraph(overrides: {
  site_id?: string;
  orphaned_count?: number;
  dead_end_count?: number;
  broken_external_count?: number;
  canonical_conflict_count?: number;
  opportunity_count?: number;
  velocity_alert_count?: number;
} = {}) {
  return {
    site_id:                  overrides.site_id ?? 'site_1',
    orphaned_count:           overrides.orphaned_count ?? 0,
    dead_end_count:           overrides.dead_end_count ?? 0,
    broken_external_count:    overrides.broken_external_count ?? 0,
    canonical_conflict_count: overrides.canonical_conflict_count ?? 0,
    opportunity_count:        overrides.opportunity_count ?? 0,
    velocity_alert_count:     overrides.velocity_alert_count ?? 0,
  };
}

// ── buildAgencyLinkReport ─────────────────────────────────────────────────────

describe('buildAgencyLinkReport', () => {
  it('aggregates orphaned pages correctly', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }],
      loadGraphsFn: async () => [
        makeSiteGraph({ site_id: 's1', orphaned_count: 5 }),
        makeSiteGraph({ site_id: 's2', orphaned_count: 3 }),
      ],
    });
    assert.equal(summary.total_orphaned_pages, 8);
  });

  it('aggregates broken external links correctly', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }],
      loadGraphsFn: async () => [
        makeSiteGraph({ site_id: 's1', broken_external_count: 10 }),
        makeSiteGraph({ site_id: 's2', broken_external_count: 4 }),
      ],
    });
    assert.equal(summary.total_broken_external, 14);
  });

  it('aggregates dead ends correctly', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }],
      loadGraphsFn: async () => [makeSiteGraph({ site_id: 's1', dead_end_count: 7 })],
    });
    assert.equal(summary.total_dead_ends, 7);
  });

  it('finds worst site by orphans', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }],
      loadGraphsFn: async () => [
        makeSiteGraph({ site_id: 's1', orphaned_count: 2 }),
        makeSiteGraph({ site_id: 's2', orphaned_count: 20 }),
      ],
    });
    assert.equal(summary.worst_site_by_orphans, 's2');
  });

  it('finds worst site by broken external', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }],
      loadGraphsFn: async () => [
        makeSiteGraph({ site_id: 's1', broken_external_count: 1 }),
        makeSiteGraph({ site_id: 's2', broken_external_count: 50 }),
      ],
    });
    assert.equal(summary.worst_site_by_broken_external, 's2');
  });

  it('finds most opportunities site', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }, { site_id: 's3' }],
      loadGraphsFn: async () => [
        makeSiteGraph({ site_id: 's1', opportunity_count: 5 }),
        makeSiteGraph({ site_id: 's2', opportunity_count: 30 }),
        makeSiteGraph({ site_id: 's3', opportunity_count: 12 }),
      ],
    });
    assert.equal(summary.most_opportunities, 's2');
  });

  it('counts sites_with_velocity_alerts correctly', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }],
      loadGraphsFn: async () => [
        makeSiteGraph({ site_id: 's1', velocity_alert_count: 3 }),
        makeSiteGraph({ site_id: 's2', velocity_alert_count: 0 }),
      ],
    });
    assert.equal(summary.sites_with_velocity_alerts, 1);
  });

  it('returns empty summary when no sites', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [],
      loadGraphsFn: async () => [],
    });
    assert.equal(summary.total_orphaned_pages, 0);
    assert.equal(summary.worst_site_by_orphans, null);
  });

  it('returns empty summary on null agency_id', async () => {
    const summary = await buildAgencyLinkReport(null as any, 30);
    assert.equal(summary.total_sites, 0);
  });

  it('returns empty summary on error', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn: async () => { throw new Error('DB error'); },
    });
    assert.equal(summary.total_orphaned_pages, 0);
  });

  it('sets total_sites from loaded sites', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => [{ site_id: 's1' }, { site_id: 's2' }, { site_id: 's3' }],
      loadGraphsFn: async () => [],
    });
    assert.equal(summary.total_sites, 3);
  });

  it('all deps injectable', async () => {
    let sitesCalled  = false;
    let graphsCalled = false;
    await buildAgencyLinkReport(AGENCY_ID, 30, {
      loadSitesFn:  async () => { sitesCalled = true; return [{ site_id: 's1' }]; },
      loadGraphsFn: async () => { graphsCalled = true; return []; },
    });
    assert.equal(sitesCalled,  true);
    assert.equal(graphsCalled, true);
  });

  it('returns generated_at timestamp', async () => {
    const summary = await buildAgencyLinkReport(AGENCY_ID, 30);
    assert.ok(summary.generated_at.includes('T'));
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => buildAgencyLinkReport(null as any, null as any));
  });
});
