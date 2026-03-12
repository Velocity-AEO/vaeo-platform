/**
 * tools/billing/usage_tracker.test.ts
 *
 * Tests for usage tracking, limit checks, and tenant plan lookups.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentUsage,
  checkUsageLimit,
  getTenantPlan,
  type UsageDb,
  type TenantPlan,
} from './usage_tracker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(overrides: Partial<UsageDb> = {}): UsageDb {
  return {
    countSites:    async () => 1,
    countCrawls:   async () => 5,
    countFixes:    async () => 10,
    getTenantPlan: async () => ({ tier: 'pro' as const, billing_status: 'active' as const }),
    ...overrides,
  };
}

function failDb(): UsageDb {
  return {
    countSites:    async () => { throw new Error('db down'); },
    countCrawls:   async () => { throw new Error('db down'); },
    countFixes:    async () => { throw new Error('db down'); },
    getTenantPlan: async () => { throw new Error('db down'); },
  };
}

// ── getCurrentUsage ─────────────────────────────────────────────────────────

describe('getCurrentUsage', () => {
  it('returns correct counts from db', async () => {
    const db = makeDb({ countSites: async () => 3, countCrawls: async () => 20, countFixes: async () => 50 });
    const usage = await getCurrentUsage('t-1', db);
    assert.equal(usage.tenant_id, 't-1');
    assert.equal(usage.sites_count, 3);
    assert.equal(usage.crawls_this_month, 20);
    assert.equal(usage.fixes_this_month, 50);
  });

  it('returns YYYY-MM period', async () => {
    const usage = await getCurrentUsage('t-1', makeDb());
    assert.match(usage.period, /^\d{4}-\d{2}$/);
  });

  it('returns ISO timestamp for last_updated', async () => {
    const usage = await getCurrentUsage('t-1', makeDb());
    assert.ok(new Date(usage.last_updated).getTime() > 0);
  });

  it('returns zeros when db throws', async () => {
    const usage = await getCurrentUsage('t-1', failDb());
    assert.equal(usage.sites_count, 0);
    assert.equal(usage.crawls_this_month, 0);
    assert.equal(usage.fixes_this_month, 0);
  });

  it('handles partial db failure gracefully', async () => {
    const db = makeDb({
      countSites: async () => 2,
      countCrawls: async () => { throw new Error('fail'); },
    });
    const usage = await getCurrentUsage('t-1', db);
    assert.equal(usage.sites_count, 2);
    assert.equal(usage.crawls_this_month, 0);
  });
});

// ── checkUsageLimit ─────────────────────────────────────────────────────────

describe('checkUsageLimit', () => {
  it('allows add_site when under limit', async () => {
    const db = makeDb({ countSites: async () => 0 });
    const result = await checkUsageLimit('t-1', 'starter', 'add_site', db);
    assert.equal(result.allowed, true);
  });

  it('blocks add_site at starter limit of 1', async () => {
    const db = makeDb({ countSites: async () => 1 });
    const result = await checkUsageLimit('t-1', 'starter', 'add_site', db);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('limit reached'));
  });

  it('allows crawl under pro limit', async () => {
    const db = makeDb({ countCrawls: async () => 50 });
    const result = await checkUsageLimit('t-1', 'pro', 'start_crawl', db);
    assert.equal(result.allowed, true);
    assert.equal(result.limit, 100);
  });

  it('blocks crawl at starter limit', async () => {
    const db = makeDb({ countCrawls: async () => 10 });
    const result = await checkUsageLimit('t-1', 'starter', 'start_crawl', db);
    assert.equal(result.allowed, false);
  });

  it('blocks export on starter plan (feature flag)', async () => {
    const result = await checkUsageLimit('t-1', 'starter', 'export', makeDb());
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('not available'));
  });

  it('allows export on pro plan', async () => {
    const result = await checkUsageLimit('t-1', 'pro', 'export', makeDb());
    assert.equal(result.allowed, true);
  });

  it('blocks aeo on starter plan', async () => {
    const result = await checkUsageLimit('t-1', 'starter', 'aeo', makeDb());
    assert.equal(result.allowed, false);
  });

  it('blocks vehicle_schema on starter plan', async () => {
    const result = await checkUsageLimit('t-1', 'starter', 'vehicle_schema', makeDb());
    assert.equal(result.allowed, false);
  });

  it('allows vehicle_schema on pro plan', async () => {
    const result = await checkUsageLimit('t-1', 'pro', 'vehicle_schema', makeDb());
    assert.equal(result.allowed, true);
  });

  it('defaults to allowed on db error', async () => {
    const result = await checkUsageLimit('t-1', 'pro', 'add_site', failDb());
    assert.equal(result.allowed, true);
  });
});

// ── getTenantPlan ───────────────────────────────────────────────────────────

describe('getTenantPlan', () => {
  it('returns plan from db', async () => {
    const plan = await getTenantPlan('t-1', makeDb());
    assert.equal(plan.tier, 'pro');
    assert.equal(plan.billing_status, 'active');
  });

  it('defaults to starter when db returns null', async () => {
    const db = makeDb({ getTenantPlan: async () => null });
    const plan = await getTenantPlan('t-1', db);
    assert.equal(plan.tier, 'starter');
    assert.equal(plan.billing_status, 'active');
  });

  it('defaults to starter when db throws', async () => {
    const plan = await getTenantPlan('t-1', failDb());
    assert.equal(plan.tier, 'starter');
    assert.equal(plan.billing_status, 'active');
  });
});
