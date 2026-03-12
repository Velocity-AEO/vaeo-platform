import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBillingGate,
  getBillingBlockMessage,
  calculateOverage,
} from './billing_enforcement.js';

// ── calculateOverage ────────────────────────────────────────────────────────

describe('calculateOverage', () => {
  it('returns 0 when within limit', () => {
    assert.equal(calculateOverage(5, 10, 3), 0);
  });

  it('returns 0 when exactly at limit', () => {
    assert.equal(calculateOverage(7, 10, 3), 0);
  });

  it('returns correct overage when exceeding', () => {
    assert.equal(calculateOverage(8, 10, 5), 3);
  });

  it('returns overage for zero limit', () => {
    assert.equal(calculateOverage(0, 0, 1), 1);
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => calculateOverage(NaN, NaN, NaN));
  });
});

// ── checkBillingGate ────────────────────────────────────────────────────────

describe('checkBillingGate', () => {
  it('returns allowed when under limit', async () => {
    const result = await checkBillingGate('site_1', 5, {
      loadUsageFn: async () => 3,
      loadPlanFn: async () => 20,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.overage, 0);
  });

  it('returns not allowed when over limit', async () => {
    const result = await checkBillingGate('site_1', 10, {
      loadUsageFn: async () => 95,
      loadPlanFn: async () => 100,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.overage, 5);
  });

  it('returns allowed when exactly at limit', async () => {
    const result = await checkBillingGate('site_1', 5, {
      loadUsageFn: async () => 5,
      loadPlanFn: async () => 10,
    });
    assert.equal(result.allowed, true);
  });

  it('returns allowed on load error (fail open)', async () => {
    const result = await checkBillingGate('site_1', 5, {
      loadUsageFn: async () => { throw new Error('DB error'); },
      loadPlanFn: async () => 100,
    });
    assert.equal(result.allowed, true);
  });

  it('includes current_usage in result', async () => {
    const result = await checkBillingGate('site_1', 1, {
      loadUsageFn: async () => 42,
      loadPlanFn: async () => 100,
    });
    assert.equal(result.current_usage, 42);
  });

  it('includes plan_limit in result', async () => {
    const result = await checkBillingGate('site_1', 1, {
      loadUsageFn: async () => 0,
      loadPlanFn: async () => 50,
    });
    assert.equal(result.plan_limit, 50);
  });

  it('includes reason when not allowed', async () => {
    const result = await checkBillingGate('site_1', 10, {
      loadUsageFn: async () => 95,
      loadPlanFn: async () => 100,
    });
    assert.ok(result.reason);
    assert.ok(result.reason!.includes('exceeded'));
  });

  it('returns allowed with default deps', async () => {
    const result = await checkBillingGate('site_1', 5);
    assert.equal(result.allowed, true);
  });

  it('never throws', async () => {
    await assert.doesNotReject(async () => {
      await checkBillingGate(null as any, NaN);
    });
  });
});

// ── getBillingBlockMessage ───────────────────────────────────────────────────

describe('getBillingBlockMessage', () => {
  it('includes usage and limit', () => {
    const msg = getBillingBlockMessage({
      allowed: false,
      current_usage: 95,
      plan_limit: 100,
      overage: 5,
    });
    assert.ok(msg.includes('95'));
    assert.ok(msg.includes('100'));
  });

  it('returns empty string when allowed', () => {
    assert.equal(getBillingBlockMessage({
      allowed: true,
      current_usage: 5,
      plan_limit: 100,
      overage: 0,
    }), '');
  });

  it('includes "Upgrade" guidance', () => {
    const msg = getBillingBlockMessage({
      allowed: false,
      current_usage: 100,
      plan_limit: 100,
      overage: 1,
    });
    assert.ok(msg.includes('Upgrade'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getBillingBlockMessage(null as any));
  });
});
