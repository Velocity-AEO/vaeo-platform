/**
 * tools/billing/billing_gate.test.ts
 *
 * Tests for billing gate — status checks, feature flags, usage limits.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBillingGate,
  getUpgradeTier,
  type GatedAction,
} from './billing_gate.js';
import type { UsageDb, TenantPlan } from './usage_tracker.js';
import type { PlanTier } from './plan_definitions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(
  plan: Partial<TenantPlan> = {},
  usage: { sites?: number; crawls?: number; fixes?: number } = {},
): UsageDb {
  return {
    countSites:    async () => usage.sites  ?? 0,
    countCrawls:   async () => usage.crawls ?? 0,
    countFixes:    async () => usage.fixes  ?? 0,
    getTenantPlan: async () => ({
      tier:           (plan.tier ?? 'pro') as PlanTier,
      billing_status: (plan.billing_status ?? 'active') as TenantPlan['billing_status'],
    }),
  };
}

// ── Billing status checks ───────────────────────────────────────────────────

describe('checkBillingGate — billing status', () => {
  it('blocks all actions when subscription is canceled', async () => {
    const db = makeDb({ billing_status: 'canceled' });
    const result = await checkBillingGate('t-1', 'add_site', db);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('canceled'));
  });

  it('blocks add_site when past due', async () => {
    const db = makeDb({ billing_status: 'past_due' });
    const result = await checkBillingGate('t-1', 'add_site', db);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('past due'));
  });

  it('blocks start_crawl when past due', async () => {
    const db = makeDb({ billing_status: 'past_due' });
    const result = await checkBillingGate('t-1', 'start_crawl', db);
    assert.equal(result.allowed, false);
  });

  it('allows apply_fix when past due (existing fixes complete)', async () => {
    const db = makeDb({ billing_status: 'past_due' });
    const result = await checkBillingGate('t-1', 'apply_fix', db);
    assert.equal(result.allowed, true);
  });

  it('allows actions when billing is active', async () => {
    const db = makeDb({ billing_status: 'active' });
    const result = await checkBillingGate('t-1', 'add_site', db);
    assert.equal(result.allowed, true);
  });

  it('allows actions when billing is trialing', async () => {
    const db = makeDb({ billing_status: 'trialing' });
    const result = await checkBillingGate('t-1', 'start_crawl', db);
    assert.equal(result.allowed, true);
  });
});

// ── Feature flag checks ─────────────────────────────────────────────────────

describe('checkBillingGate — feature flags', () => {
  it('blocks export on starter', async () => {
    const db = makeDb({ tier: 'starter' });
    const result = await checkBillingGate('t-1', 'export', db);
    assert.equal(result.allowed, false);
    assert.equal(result.upgrade_required, 'pro');
    assert.equal(result.current_tier, 'starter');
  });

  it('allows export on pro', async () => {
    const db = makeDb({ tier: 'pro' });
    const result = await checkBillingGate('t-1', 'export', db);
    assert.equal(result.allowed, true);
  });

  it('blocks multi_site_jobs on pro', async () => {
    const db = makeDb({ tier: 'pro' });
    const result = await checkBillingGate('t-1', 'multi_site_jobs', db);
    assert.equal(result.allowed, false);
    assert.equal(result.upgrade_required, 'agency');
  });

  it('blocks api_access on pro', async () => {
    const db = makeDb({ tier: 'pro' });
    const result = await checkBillingGate('t-1', 'api_access', db);
    assert.equal(result.allowed, false);
    assert.equal(result.upgrade_required, 'agency');
  });

  it('allows api_access on agency', async () => {
    const db = makeDb({ tier: 'agency' });
    const result = await checkBillingGate('t-1', 'api_access', db);
    assert.equal(result.allowed, true);
  });
});

// ── Usage limit checks ──────────────────────────────────────────────────────

describe('checkBillingGate — usage limits', () => {
  it('blocks add_site when at starter limit', async () => {
    const db = makeDb({ tier: 'starter' }, { sites: 1 });
    const result = await checkBillingGate('t-1', 'add_site', db);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('limit'));
    assert.equal(result.upgrade_required, 'pro');
  });

  it('allows add_site when under pro limit', async () => {
    const db = makeDb({ tier: 'pro' }, { sites: 3 });
    const result = await checkBillingGate('t-1', 'add_site', db);
    assert.equal(result.allowed, true);
  });

  it('blocks start_crawl when at limit', async () => {
    const db = makeDb({ tier: 'starter' }, { crawls: 10 });
    const result = await checkBillingGate('t-1', 'start_crawl', db);
    assert.equal(result.allowed, false);
  });
});

// ── Error resilience ────────────────────────────────────────────────────────

describe('checkBillingGate — resilience', () => {
  it('defaults to allowed on db error', async () => {
    const db: UsageDb = {
      countSites:    async () => { throw new Error('fail'); },
      countCrawls:   async () => { throw new Error('fail'); },
      countFixes:    async () => { throw new Error('fail'); },
      getTenantPlan: async () => { throw new Error('fail'); },
    };
    const result = await checkBillingGate('t-1', 'add_site', db);
    assert.equal(result.allowed, true);
  });
});

// ── getUpgradeTier ──────────────────────────────────────────────────────────

describe('getUpgradeTier', () => {
  it('returns pro for starter export', () => {
    assert.equal(getUpgradeTier('starter', 'export'), 'pro');
  });

  it('returns agency for pro multi_site_jobs', () => {
    assert.equal(getUpgradeTier('pro', 'multi_site_jobs'), 'agency');
  });

  it('returns undefined for enterprise (already highest)', () => {
    assert.equal(getUpgradeTier('enterprise', 'add_site'), undefined);
  });

  it('returns pro for starter add_site (next tier with higher limits)', () => {
    assert.equal(getUpgradeTier('starter', 'add_site'), 'pro');
  });
});
