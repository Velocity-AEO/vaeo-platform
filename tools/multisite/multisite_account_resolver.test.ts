/**
 * tools/multisite/multisite_account_resolver.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAccountType,
  resolveAccountSites,
  hasMultipleSites,
  shouldShowMultisiteDashboard,
  type AccountSites,
} from './multisite_account_resolver.ts';

// ── detectAccountType ─────────────────────────────────────────────────────────

describe('detectAccountType', () => {
  it('returns agency when isAgencyFn returns true', async () => {
    const t = await detectAccountType('acc_1', { isAgencyFn: async () => true });
    assert.equal(t, 'agency');
  });

  it('returns direct when isAgencyFn returns false', async () => {
    const t = await detectAccountType('acc_1', { isAgencyFn: async () => false });
    assert.equal(t, 'direct');
  });

  it('returns direct when isAgencyFn throws', async () => {
    const t = await detectAccountType('acc_1', { isAgencyFn: async () => { throw new Error('db'); } });
    assert.equal(t, 'direct');
  });

  it('defaults to direct with no deps', async () => {
    const t = await detectAccountType('acc_x');
    assert.equal(t, 'direct');
  });

  it('never throws on null account_id', async () => {
    await assert.doesNotReject(() => detectAccountType(null as never));
  });
});

// ── resolveAccountSites ───────────────────────────────────────────────────────

describe('resolveAccountSites', () => {
  it('returns direct sites when account_type is direct', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn:  async () => 'direct',
      loadDirectSitesFn:    async () => ['s1', 's2'],
    });
    assert.equal(result.account_type, 'direct');
    assert.deepEqual(result.site_ids, ['s1', 's2']);
  });

  it('returns agency sites when account_type is agency', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn:  async () => 'agency',
      loadAgencySitesFn:    async () => ['s1', 's2', 's3'],
    });
    assert.equal(result.account_type, 'agency');
    assert.equal(result.site_ids.length, 3);
  });

  it('site_count equals site_ids.length', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn:  async () => 'direct',
      loadDirectSitesFn:    async () => ['s1', 's2', 's3'],
    });
    assert.equal(result.site_count, 3);
  });

  it('account_id is preserved', async () => {
    const result = await resolveAccountSites('my_account', {
      detectAccountTypeFn: async () => 'direct',
      loadDirectSitesFn:   async () => [],
    });
    assert.equal(result.account_id, 'my_account');
  });

  it('returns empty site_ids when loadDirectSitesFn throws', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn: async () => 'direct',
      loadDirectSitesFn:   async () => { throw new Error('db'); },
    });
    assert.deepEqual(result.site_ids, []);
    assert.equal(result.site_count, 0);
  });

  it('returns empty site_ids when loadAgencySitesFn throws', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn: async () => 'agency',
      loadAgencySitesFn:   async () => { throw new Error('db'); },
    });
    assert.deepEqual(result.site_ids, []);
  });

  it('falls back to direct when detectAccountTypeFn throws', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn: async () => { throw new Error('x'); },
      loadDirectSitesFn:   async () => ['s1'],
    });
    assert.equal(result.account_type, 'direct');
  });

  it('never throws on null account_id', async () => {
    await assert.doesNotReject(() => resolveAccountSites(null as never));
  });

  it('returns fallback object on catastrophic failure', async () => {
    const result = await resolveAccountSites('acc_1', {
      detectAccountTypeFn: async () => { throw new Error('x'); },
      loadDirectSitesFn:   async () => { throw new Error('y'); },
    });
    assert.equal(result.site_count, 0);
    assert.equal(result.account_type, 'direct');
  });
});

// ── hasMultipleSites ──────────────────────────────────────────────────────────

describe('hasMultipleSites', () => {
  function acct(site_count: number): AccountSites {
    return { account_id: 'a', account_type: 'direct', site_ids: [], site_count };
  }

  it('returns false for 0 sites', () => {
    assert.equal(hasMultipleSites(acct(0)), false);
  });

  it('returns false for 1 site', () => {
    assert.equal(hasMultipleSites(acct(1)), false);
  });

  it('returns true for 2 sites', () => {
    assert.equal(hasMultipleSites(acct(2)), true);
  });

  it('returns true for many sites', () => {
    assert.equal(hasMultipleSites(acct(100)), true);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => hasMultipleSites(null as never));
  });
});

// ── shouldShowMultisiteDashboard ──────────────────────────────────────────────

describe('shouldShowMultisiteDashboard', () => {
  it('returns true for agency with 1 site', () => {
    const a: AccountSites = { account_id: 'a', account_type: 'agency', site_ids: ['s1'], site_count: 1 };
    assert.equal(shouldShowMultisiteDashboard(a), true);
  });

  it('returns false for direct with 1 site', () => {
    const a: AccountSites = { account_id: 'a', account_type: 'direct', site_ids: ['s1'], site_count: 1 };
    assert.equal(shouldShowMultisiteDashboard(a), false);
  });

  it('returns true for direct with 2 sites', () => {
    const a: AccountSites = { account_id: 'a', account_type: 'direct', site_ids: ['s1', 's2'], site_count: 2 };
    assert.equal(shouldShowMultisiteDashboard(a), true);
  });

  it('returns false for null input', () => {
    assert.equal(shouldShowMultisiteDashboard(null as never), false);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => shouldShowMultisiteDashboard(null as never));
  });
});
