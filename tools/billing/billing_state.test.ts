import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBillingState, PLAN_PRICES } from './billing_state.js';

describe('computeBillingState', () => {
  const base = {
    tenant_id: 't1',
    plan: 'pro',
    status: 'active',
    usage: { sites: 2, crawls: 50, fixes: 100 },
    limits: { sites: 5, crawls: 100, fixes: 500 },
  };

  it('returns correct plan and status', () => {
    const s = computeBillingState(base.tenant_id, base.plan, base.status, base.usage, base.limits);
    assert.equal(s.plan, 'pro');
    assert.equal(s.billing_status, 'active');
    assert.equal(s.tenant_id, 't1');
  });

  it('computes sites_pct correctly', () => {
    const s = computeBillingState(base.tenant_id, base.plan, base.status, base.usage, base.limits);
    assert.equal(s.sites_pct, 40); // 2/5 * 100
  });

  it('computes crawls_pct correctly', () => {
    const s = computeBillingState(base.tenant_id, base.plan, base.status, base.usage, base.limits);
    assert.equal(s.crawls_pct, 50); // 50/100 * 100
  });

  it('computes fixes_pct correctly', () => {
    const s = computeBillingState(base.tenant_id, base.plan, base.status, base.usage, base.limits);
    assert.equal(s.fixes_pct, 20); // 100/500 * 100
  });

  it('caps pct at 100 when over limit', () => {
    const s = computeBillingState('t1', 'pro', 'active',
      { sites: 10, crawls: 200, fixes: 1000 },
      { sites: 5, crawls: 100, fixes: 500 });
    assert.equal(s.sites_pct, 100);
    assert.equal(s.crawls_pct, 100);
    assert.equal(s.fixes_pct, 100);
  });

  it('returns 0 pct for unlimited (9999) limits', () => {
    const s = computeBillingState('t1', 'enterprise', 'active',
      { sites: 50, crawls: 5000, fixes: 50000 },
      { sites: 9999, crawls: 9999, fixes: 9999 });
    assert.equal(s.sites_pct, 0);
    assert.equal(s.crawls_pct, 0);
    assert.equal(s.fixes_pct, 0);
  });

  it('is_over_limit true when any pct >= 100', () => {
    const s = computeBillingState('t1', 'starter', 'active',
      { sites: 1, crawls: 10, fixes: 25 },
      { sites: 1, crawls: 10, fixes: 25 });
    assert.equal(s.is_over_limit, true);
  });

  it('is_over_limit false when all under limit', () => {
    const s = computeBillingState(base.tenant_id, base.plan, base.status, base.usage, base.limits);
    assert.equal(s.is_over_limit, false);
  });

  it('is_over_limit true when canceled', () => {
    const s = computeBillingState('t1', 'pro', 'canceled',
      { sites: 0, crawls: 0, fixes: 0 },
      { sites: 5, crawls: 100, fixes: 500 });
    assert.equal(s.is_over_limit, true);
  });

  it('computes days_until_renewal', () => {
    const future = new Date();
    future.setDate(future.getDate() + 15);
    const s = computeBillingState('t1', 'pro', 'active', base.usage, base.limits, future.toISOString());
    assert.ok(s.days_until_renewal !== undefined);
    assert.ok(s.days_until_renewal >= 14 && s.days_until_renewal <= 16);
  });

  it('days_until_renewal is 0 for past dates', () => {
    const past = new Date('2020-01-01');
    const s = computeBillingState('t1', 'pro', 'active', base.usage, base.limits, past.toISOString());
    assert.equal(s.days_until_renewal, 0);
  });

  it('days_until_renewal is undefined when no period end', () => {
    const s = computeBillingState('t1', 'pro', 'active', base.usage, base.limits);
    assert.equal(s.days_until_renewal, undefined);
  });

  it('defaults invalid plan to starter', () => {
    const s = computeBillingState('t1', 'gold', 'active', base.usage, base.limits);
    assert.equal(s.plan, 'starter');
  });

  it('defaults invalid status to active', () => {
    const s = computeBillingState('t1', 'pro', 'unknown', base.usage, base.limits);
    assert.equal(s.billing_status, 'active');
  });

  it('populates used and limit fields', () => {
    const s = computeBillingState(base.tenant_id, base.plan, base.status, base.usage, base.limits);
    assert.equal(s.sites_used, 2);
    assert.equal(s.sites_limit, 5);
    assert.equal(s.crawls_used, 50);
    assert.equal(s.crawls_limit, 100);
    assert.equal(s.fixes_used, 100);
    assert.equal(s.fixes_limit, 500);
  });

  it('never throws on edge cases', () => {
    const s = computeBillingState('', '', '',
      { sites: 0, crawls: 0, fixes: 0 },
      { sites: 0, crawls: 0, fixes: 0 });
    assert.equal(s.plan, 'starter');
    assert.equal(s.billing_status, 'active');
  });
});

describe('PLAN_PRICES', () => {
  it('has all four plans', () => {
    assert.deepEqual(Object.keys(PLAN_PRICES).sort(), ['agency', 'enterprise', 'pro', 'starter']);
  });

  it('each plan has required fields', () => {
    for (const [, plan] of Object.entries(PLAN_PRICES)) {
      assert.equal(typeof plan.monthly_usd, 'number');
      assert.equal(typeof plan.annual_usd, 'number');
      assert.equal(typeof plan.label, 'string');
      assert.ok(Array.isArray(plan.features));
      assert.ok(plan.features.length >= 3);
    }
  });

  it('enterprise has 0 pricing (sales-only)', () => {
    assert.equal(PLAN_PRICES.enterprise.monthly_usd, 0);
    assert.equal(PLAN_PRICES.enterprise.annual_usd, 0);
  });
});
