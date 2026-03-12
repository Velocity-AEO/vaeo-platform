/**
 * tools/agency/agency_account.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyAccount,
  canAddClientSite,
  isAgencyAtCapacity,
  getAgencyCapacityMessage,
  upgradeAgencyPlan,
  AGENCY_PLAN_LIMITS,
  type AgencyAccount,
  type AgencyPlan,
} from './agency_account.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function agency(overrides?: Partial<AgencyAccount>): AgencyAccount {
  return {
    agency_id:           'ag_1',
    agency_name:         'Acme Agency',
    owner_user_id:       'user_1',
    plan:                'growth',
    max_client_sites:    50,
    active_client_sites: 10,
    whitelabel_enabled:  true,
    created_at:          new Date().toISOString(),
    active:              true,
    ...overrides,
  };
}

// ── AGENCY_PLAN_LIMITS ────────────────────────────────────────────────────────

describe('AGENCY_PLAN_LIMITS', () => {
  it('starter = 10', () => { assert.equal(AGENCY_PLAN_LIMITS.starter, 10); });
  it('growth = 50',  () => { assert.equal(AGENCY_PLAN_LIMITS.growth,  50); });
  it('enterprise = 200', () => { assert.equal(AGENCY_PLAN_LIMITS.enterprise, 200); });
});

// ── buildAgencyAccount ────────────────────────────────────────────────────────

describe('buildAgencyAccount', () => {
  it('sets agency_name', () => {
    const a = buildAgencyAccount('My Agency', 'u1', 'starter');
    assert.equal(a.agency_name, 'My Agency');
  });

  it('sets owner_user_id', () => {
    const a = buildAgencyAccount('N', 'user_99', 'starter');
    assert.equal(a.owner_user_id, 'user_99');
  });

  it('sets plan', () => {
    const a = buildAgencyAccount('N', 'u', 'growth');
    assert.equal(a.plan, 'growth');
  });

  it('sets max_client_sites from AGENCY_PLAN_LIMITS for starter', () => {
    const a = buildAgencyAccount('N', 'u', 'starter');
    assert.equal(a.max_client_sites, 10);
  });

  it('sets max_client_sites for growth', () => {
    const a = buildAgencyAccount('N', 'u', 'growth');
    assert.equal(a.max_client_sites, 50);
  });

  it('sets max_client_sites for enterprise', () => {
    const a = buildAgencyAccount('N', 'u', 'enterprise');
    assert.equal(a.max_client_sites, 200);
  });

  it('sets active_client_sites to 0', () => {
    const a = buildAgencyAccount('N', 'u', 'growth');
    assert.equal(a.active_client_sites, 0);
  });

  it('whitelabel_enabled=false for starter', () => {
    const a = buildAgencyAccount('N', 'u', 'starter');
    assert.equal(a.whitelabel_enabled, false);
  });

  it('whitelabel_enabled=true for growth', () => {
    const a = buildAgencyAccount('N', 'u', 'growth');
    assert.equal(a.whitelabel_enabled, true);
  });

  it('whitelabel_enabled=true for enterprise', () => {
    const a = buildAgencyAccount('N', 'u', 'enterprise');
    assert.equal(a.whitelabel_enabled, true);
  });

  it('sets active=true', () => {
    const a = buildAgencyAccount('N', 'u', 'starter');
    assert.equal(a.active, true);
  });

  it('agency_id starts with agency_', () => {
    const a = buildAgencyAccount('N', 'u', 'starter');
    assert.ok(a.agency_id.startsWith('agency_'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => buildAgencyAccount(null as never, null as never, null as never));
  });
});

// ── canAddClientSite ──────────────────────────────────────────────────────────

describe('canAddClientSite', () => {
  it('returns true when under limit', () => {
    assert.equal(canAddClientSite(agency({ active_client_sites: 49, max_client_sites: 50 })), true);
  });

  it('returns false when at limit', () => {
    assert.equal(canAddClientSite(agency({ active_client_sites: 50, max_client_sites: 50 })), false);
  });

  it('returns false when over limit', () => {
    assert.equal(canAddClientSite(agency({ active_client_sites: 51, max_client_sites: 50 })), false);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => canAddClientSite({} as AgencyAccount));
  });
});

// ── isAgencyAtCapacity ────────────────────────────────────────────────────────

describe('isAgencyAtCapacity', () => {
  it('returns false when under limit', () => {
    assert.equal(isAgencyAtCapacity(agency({ active_client_sites: 49, max_client_sites: 50 })), false);
  });

  it('returns true when at limit', () => {
    assert.equal(isAgencyAtCapacity(agency({ active_client_sites: 50, max_client_sites: 50 })), true);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => isAgencyAtCapacity({} as AgencyAccount));
  });
});

// ── getAgencyCapacityMessage ──────────────────────────────────────────────────

describe('getAgencyCapacityMessage', () => {
  it('formats correctly', () => {
    const msg = getAgencyCapacityMessage(agency({ active_client_sites: 10, max_client_sites: 50 }));
    assert.equal(msg, '10 of 50 client sites used');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getAgencyCapacityMessage({} as AgencyAccount));
  });
});

// ── upgradeAgencyPlan ─────────────────────────────────────────────────────────

describe('upgradeAgencyPlan', () => {
  it('updates plan', () => {
    const upgraded = upgradeAgencyPlan(agency({ plan: 'starter' }), 'growth');
    assert.equal(upgraded.plan, 'growth');
  });

  it('updates max_client_sites', () => {
    const upgraded = upgradeAgencyPlan(agency({ plan: 'growth', max_client_sites: 50 }), 'enterprise');
    assert.equal(upgraded.max_client_sites, 200);
  });

  it('enables whitelabel when upgrading from starter', () => {
    const base = buildAgencyAccount('N', 'u', 'starter');
    const upgraded = upgradeAgencyPlan(base, 'growth');
    assert.equal(upgraded.whitelabel_enabled, true);
  });

  it('disables whitelabel when downgrading to starter', () => {
    const upgraded = upgradeAgencyPlan(agency({ plan: 'growth' }), 'starter');
    assert.equal(upgraded.whitelabel_enabled, false);
  });

  it('preserves other fields', () => {
    const base = agency({ agency_name: 'Acme', active_client_sites: 5 });
    const upgraded = upgradeAgencyPlan(base, 'enterprise');
    assert.equal(upgraded.agency_name, 'Acme');
    assert.equal(upgraded.active_client_sites, 5);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => upgradeAgencyPlan({} as AgencyAccount, 'enterprise'));
  });
});
