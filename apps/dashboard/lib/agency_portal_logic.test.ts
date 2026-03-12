/**
 * apps/dashboard/lib/agency_portal_logic.test.ts
 *
 * Tests for agency portal logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAgencyPlanBadgeColor,
  getCapacityBarWidth,
  getCapacityBarColor,
  sortRosterByDomain,
  getRosterTableRows,
  type AgencyClientSite,
} from './agency_portal_logic.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function site(domain: string, active = true): AgencyClientSite {
  return { site_id: `s_${domain}`, domain, platform: 'shopify', client_name: domain, active };
}

// ── getAgencyPlanBadgeColor ──────────────────────────────────────────────────

describe('getAgencyPlanBadgeColor', () => {
  it('returns gray for starter', () => {
    assert.ok(getAgencyPlanBadgeColor('starter').includes('gray'));
  });

  it('returns blue for growth', () => {
    assert.ok(getAgencyPlanBadgeColor('growth').includes('blue'));
  });

  it('returns purple for enterprise', () => {
    assert.ok(getAgencyPlanBadgeColor('enterprise').includes('purple'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getAgencyPlanBadgeColor(null as any));
  });
});

// ── getCapacityBarWidth ──────────────────────────────────────────────────────

describe('getCapacityBarWidth', () => {
  it('calculates percentage correctly', () => {
    assert.equal(getCapacityBarWidth(5, 10), 50);
  });

  it('returns 0 for zero max', () => {
    assert.equal(getCapacityBarWidth(5, 0), 0);
  });

  it('caps at 100', () => {
    assert.equal(getCapacityBarWidth(15, 10), 100);
  });

  it('returns 0 for zero active', () => {
    assert.equal(getCapacityBarWidth(0, 50), 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => getCapacityBarWidth(null as any, null as any));
  });
});

// ── getCapacityBarColor ──────────────────────────────────────────────────────

describe('getCapacityBarColor', () => {
  it('returns green under 70%', () => {
    assert.equal(getCapacityBarColor(50), 'bg-green-500');
  });

  it('returns yellow at 70-89%', () => {
    assert.equal(getCapacityBarColor(75), 'bg-yellow-500');
  });

  it('returns red at 90%+', () => {
    assert.equal(getCapacityBarColor(95), 'bg-red-500');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getCapacityBarColor(null as any));
  });
});

// ── sortRosterByDomain ───────────────────────────────────────────────────────

describe('sortRosterByDomain', () => {
  it('sorts alphabetically by domain', () => {
    const roster = [site('z.com'), site('a.com'), site('m.com')];
    const sorted = sortRosterByDomain(roster);
    assert.equal(sorted[0].domain, 'a.com');
    assert.equal(sorted[2].domain, 'z.com');
  });

  it('returns empty for null input', () => {
    assert.deepEqual(sortRosterByDomain(null as any), []);
  });
});

// ── getRosterTableRows ───────────────────────────────────────────────────────

describe('getRosterTableRows', () => {
  it('maps roster to table rows', () => {
    const rows = getRosterTableRows([site('x.com')]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].domain, 'x.com');
    assert.equal(rows[0].platform, 'shopify');
  });

  it('returns empty for null input', () => {
    assert.deepEqual(getRosterTableRows(null as any), []);
  });

  it('never throws on malformed data', () => {
    assert.doesNotThrow(() => getRosterTableRows([{} as any]));
  });
});
