import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAccountStatusColor,
  getUtilizationPercent,
  getPoolHealthSummary,
  type GSCAccountPool,
} from './pool_display_logic.js';

// ── getAccountStatusColor ─────────────────────────────────────────────────────

describe('getAccountStatusColor', () => {
  it('returns green under 70%', () => {
    assert.equal(getAccountStatusColor({ property_count: 5, max_properties: 10 }), 'green');
  });

  it('returns yellow at 70%', () => {
    assert.equal(getAccountStatusColor({ property_count: 7, max_properties: 10 }), 'yellow');
  });

  it('returns yellow at 89%', () => {
    assert.equal(getAccountStatusColor({ property_count: 89, max_properties: 100 }), 'yellow');
  });

  it('returns red at 90%', () => {
    assert.equal(getAccountStatusColor({ property_count: 9, max_properties: 10 }), 'red');
  });

  it('returns red at 100%', () => {
    assert.equal(getAccountStatusColor({ property_count: 10, max_properties: 10 }), 'red');
  });

  it('returns green for zero capacity', () => {
    assert.equal(getAccountStatusColor({ property_count: 0, max_properties: 0 }), 'green');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getAccountStatusColor(null as any));
  });
});

// ── getUtilizationPercent ─────────────────────────────────────────────────────

describe('getUtilizationPercent', () => {
  it('calculates correctly', () => {
    assert.equal(getUtilizationPercent(50, 100), 50);
  });

  it('returns 0 for zero capacity', () => {
    assert.equal(getUtilizationPercent(5, 0), 0);
  });

  it('rounds to integer', () => {
    assert.equal(getUtilizationPercent(1, 3), 33);
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => getUtilizationPercent(NaN, NaN));
  });
});

// ── getPoolHealthSummary ──────────────────────────────────────────────────────

describe('getPoolHealthSummary', () => {
  it('returns correct string', () => {
    const pool: GSCAccountPool = {
      accounts: [
        { account_id: 'a1', email: 'a@b.com', property_count: 5, max_properties: 10 },
        { account_id: 'a2', email: 'c@d.com', property_count: 3, max_properties: 10 },
      ],
      total_used: 8,
      total_capacity: 20,
    };
    const result = getPoolHealthSummary(pool);
    assert.ok(result.includes('8'));
    assert.ok(result.includes('20'));
    assert.ok(result.includes('2 accounts'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getPoolHealthSummary(null as any));
  });
});
