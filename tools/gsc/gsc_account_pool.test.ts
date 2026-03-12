/**
 * tools/gsc/gsc_account_pool.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountPool,
  getAvailableAccount,
  isPoolNearCapacity,
  getPoolWarningMessage,
  loadAccountPool,
  type GSCAccount,
} from './gsc_account_pool.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function account(overrides?: Partial<GSCAccount>): GSCAccount {
  return {
    account_id:     'acct_1',
    google_email:   'gsc@vaeo.io',
    property_count: 50,
    max_properties: 100,
    active:         true,
    created_at:     new Date().toISOString(),
    ...overrides,
  };
}

// ── buildAccountPool ──────────────────────────────────────────────────────────

describe('buildAccountPool', () => {
  it('total_capacity sums max_properties', () => {
    const pool = buildAccountPool([account({ max_properties: 100 }), account({ account_id: 'a2', max_properties: 100 })]);
    assert.equal(pool.total_capacity, 200);
  });

  it('total_used sums property_count', () => {
    const pool = buildAccountPool([account({ property_count: 30 }), account({ account_id: 'a2', property_count: 20 })]);
    assert.equal(pool.total_used, 50);
  });

  it('available_capacity = total_capacity - total_used', () => {
    const pool = buildAccountPool([account({ property_count: 40, max_properties: 100 })]);
    assert.equal(pool.available_capacity, 60);
  });

  it('available_capacity is 0 when all full', () => {
    const pool = buildAccountPool([account({ property_count: 100, max_properties: 100 })]);
    assert.equal(pool.available_capacity, 0);
  });

  it('accounts array preserved', () => {
    const accts = [account(), account({ account_id: 'a2' })];
    const pool = buildAccountPool(accts);
    assert.equal(pool.accounts.length, 2);
  });

  it('handles empty array', () => {
    const pool = buildAccountPool([]);
    assert.equal(pool.total_capacity, 0);
    assert.equal(pool.total_used, 0);
    assert.equal(pool.available_capacity, 0);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => buildAccountPool(null as never));
  });
});

// ── getAvailableAccount ───────────────────────────────────────────────────────

describe('getAvailableAccount', () => {
  it('returns account with space', () => {
    const pool = buildAccountPool([account({ property_count: 50, max_properties: 100 })]);
    assert.ok(getAvailableAccount(pool) !== null);
  });

  it('returns null when all accounts full', () => {
    const pool = buildAccountPool([account({ property_count: 100, max_properties: 100 })]);
    assert.equal(getAvailableAccount(pool), null);
  });

  it('skips inactive accounts', () => {
    const pool = buildAccountPool([
      account({ active: false, property_count: 0, max_properties: 100 }),
    ]);
    assert.equal(getAvailableAccount(pool), null);
  });

  it('returns first active account with space', () => {
    const pool = buildAccountPool([
      account({ account_id: 'full', property_count: 100, max_properties: 100 }),
      account({ account_id: 'open', property_count: 50,  max_properties: 100 }),
    ]);
    assert.equal(getAvailableAccount(pool)?.account_id, 'open');
  });

  it('returns null for empty pool', () => {
    const pool = buildAccountPool([]);
    assert.equal(getAvailableAccount(pool), null);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getAvailableAccount({ accounts: null as never } as never));
  });
});

// ── isPoolNearCapacity ────────────────────────────────────────────────────────

describe('isPoolNearCapacity', () => {
  it('returns true when available <= threshold', () => {
    const pool = buildAccountPool([account({ property_count: 95, max_properties: 100 })]);
    assert.equal(isPoolNearCapacity(pool, 10), true);
  });

  it('returns false when available > threshold', () => {
    const pool = buildAccountPool([account({ property_count: 50, max_properties: 100 })]);
    assert.equal(isPoolNearCapacity(pool, 10), false);
  });

  it('returns true when available == threshold', () => {
    const pool = buildAccountPool([account({ property_count: 90, max_properties: 100 })]);
    assert.equal(isPoolNearCapacity(pool, 10), true);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => isPoolNearCapacity({} as never, 10));
  });
});

// ── getPoolWarningMessage ─────────────────────────────────────────────────────

describe('getPoolWarningMessage', () => {
  it('returns null when all accounts healthy', () => {
    const pool = buildAccountPool([account({ property_count: 50, max_properties: 100 })]);
    assert.equal(getPoolWarningMessage(pool), null);
  });

  it('returns warning message when account at 80%+', () => {
    const pool = buildAccountPool([account({ property_count: 80, max_properties: 100 })]);
    assert.ok(getPoolWarningMessage(pool) !== null);
    assert.ok(getPoolWarningMessage(pool)!.includes('80%'));
  });

  it('includes count of near-full accounts', () => {
    const pool = buildAccountPool([
      account({ account_id: 'a1', property_count: 90, max_properties: 100 }),
      account({ account_id: 'a2', property_count: 85, max_properties: 100 }),
    ]);
    const msg = getPoolWarningMessage(pool);
    assert.ok(msg?.includes('2'));
  });

  it('skips inactive accounts in warning check', () => {
    const pool = buildAccountPool([
      account({ active: false, property_count: 99, max_properties: 100 }),
    ]);
    assert.equal(getPoolWarningMessage(pool), null);
  });

  it('returns null for empty pool', () => {
    const pool = buildAccountPool([]);
    assert.equal(getPoolWarningMessage(pool), null);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getPoolWarningMessage({} as never));
  });
});

// ── loadAccountPool ───────────────────────────────────────────────────────────

describe('loadAccountPool', () => {
  it('returns pool from loadAccountsFn', async () => {
    const pool = await loadAccountPool({
      loadAccountsFn: async () => [account()],
    });
    assert.equal(pool.accounts.length, 1);
  });

  it('returns empty pool on error', async () => {
    const pool = await loadAccountPool({
      loadAccountsFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(pool.accounts.length, 0);
    assert.equal(pool.total_capacity, 0);
  });

  it('never throws when loadAccountsFn throws', async () => {
    await assert.doesNotReject(() =>
      loadAccountPool({ loadAccountsFn: async () => { throw new Error('X'); } }),
    );
  });
});
