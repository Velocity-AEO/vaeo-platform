/**
 * tools/gsc/gsc_managed_token_store.test.ts
 *
 * Tests for managed GSC token store.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTokenExpired,
  loadManagedToken,
  saveManagedToken,
  refreshManagedToken,
  getValidToken,
  type ManagedGSCToken,
} from './gsc_managed_token_store.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function futureToken(minutes = 60): ManagedGSCToken {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return {
    account_id:    'acct_1',
    google_email:  'vaeo@vaeo.io',
    access_token:  'at_valid',
    refresh_token: 'rt_valid',
    expires_at:    d.toISOString(),
    scopes:        ['webmasters.readonly'],
  };
}

function expiredToken(): ManagedGSCToken {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 10);
  return {
    account_id:    'acct_1',
    google_email:  'vaeo@vaeo.io',
    access_token:  'at_expired',
    refresh_token: 'rt_valid',
    expires_at:    d.toISOString(),
    scopes:        ['webmasters.readonly'],
  };
}

function soonToken(): ManagedGSCToken {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 3); // within 5-minute buffer
  return {
    account_id:    'acct_1',
    google_email:  'vaeo@vaeo.io',
    access_token:  'at_soon',
    refresh_token: 'rt_valid',
    expires_at:    d.toISOString(),
    scopes:        ['webmasters.readonly'],
  };
}

// ── isTokenExpired ───────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns false for future expiry', () => {
    assert.equal(isTokenExpired(futureToken()), false);
  });

  it('returns true for past expiry', () => {
    assert.equal(isTokenExpired(expiredToken()), true);
  });

  it('returns true within 5 minute window', () => {
    assert.equal(isTokenExpired(soonToken()), true);
  });

  it('returns true for null token', () => {
    assert.equal(isTokenExpired(null as any), true);
  });

  it('returns true for empty expires_at', () => {
    const t = { ...futureToken(), expires_at: '' };
    assert.equal(isTokenExpired(t), true);
  });

  it('never throws on malformed input', () => {
    assert.doesNotThrow(() => isTokenExpired({} as any));
  });
});

// ── loadManagedToken ─────────────────────────────────────────────────────────

describe('loadManagedToken', () => {
  it('returns token from loadFn', async () => {
    const tok = futureToken();
    const result = await loadManagedToken('acct_1', {
      loadFn: async () => tok,
    });
    assert.equal(result?.access_token, 'at_valid');
  });

  it('returns null when loadFn returns null', async () => {
    const result = await loadManagedToken('acct_1', {
      loadFn: async () => null,
    });
    assert.equal(result, null);
  });

  it('returns null on error', async () => {
    const result = await loadManagedToken('acct_1', {
      loadFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result, null);
  });

  it('returns null with default deps', async () => {
    const result = await loadManagedToken('acct_1');
    assert.equal(result, null);
  });

  it('never throws on null account_id', async () => {
    await assert.doesNotReject(() => loadManagedToken(null as any));
  });
});

// ── saveManagedToken ─────────────────────────────────────────────────────────

describe('saveManagedToken', () => {
  it('returns true on success', async () => {
    const result = await saveManagedToken(futureToken(), {
      saveFn: async () => {},
    });
    assert.equal(result, true);
  });

  it('returns false on error', async () => {
    const result = await saveManagedToken(futureToken(), {
      saveFn: async () => { throw new Error('save fail'); },
    });
    assert.equal(result, false);
  });

  it('returns true with default deps', async () => {
    const result = await saveManagedToken(futureToken());
    assert.equal(result, true);
  });

  it('never throws on null token', async () => {
    await assert.doesNotReject(() => saveManagedToken(null as any));
  });
});

// ── refreshManagedToken ──────────────────────────────────────────────────────

describe('refreshManagedToken', () => {
  it('refreshes when expired', async () => {
    const future = new Date();
    future.setHours(future.getHours() + 1);
    const result = await refreshManagedToken('acct_1', {
      loadFn: async () => expiredToken(),
      refreshFn: async () => ({
        access_token: 'at_new',
        expires_at: future.toISOString(),
      }),
      saveFn: async () => {},
    });
    assert.equal(result?.access_token, 'at_new');
  });

  it('skips refresh when valid', async () => {
    let refreshCalled = false;
    const result = await refreshManagedToken('acct_1', {
      loadFn: async () => futureToken(),
      refreshFn: async () => {
        refreshCalled = true;
        return { access_token: 'new', expires_at: new Date().toISOString() };
      },
    });
    assert.equal(refreshCalled, false);
    assert.equal(result?.access_token, 'at_valid');
  });

  it('returns null when no token found', async () => {
    const result = await refreshManagedToken('acct_1', {
      loadFn: async () => null,
    });
    assert.equal(result, null);
  });

  it('returns null when refreshFn is missing', async () => {
    const result = await refreshManagedToken('acct_1', {
      loadFn: async () => expiredToken(),
    });
    assert.equal(result, null);
  });

  it('returns null when refreshFn throws', async () => {
    const result = await refreshManagedToken('acct_1', {
      loadFn: async () => expiredToken(),
      refreshFn: async () => { throw new Error('refresh fail'); },
    });
    assert.equal(result, null);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => refreshManagedToken(null as any));
  });
});

// ── getValidToken ────────────────────────────────────────────────────────────

describe('getValidToken', () => {
  it('returns access_token when valid', async () => {
    const result = await getValidToken('acct_1', {
      loadFn: async () => futureToken(),
    });
    assert.equal(result, 'at_valid');
  });

  it('returns null when no token', async () => {
    const result = await getValidToken('acct_1', {
      loadFn: async () => null,
    });
    assert.equal(result, null);
  });

  it('refreshes and returns new token when expired', async () => {
    const future = new Date();
    future.setHours(future.getHours() + 1);
    const result = await getValidToken('acct_1', {
      loadFn: async () => expiredToken(),
      refreshFn: async () => ({
        access_token: 'at_refreshed',
        expires_at: future.toISOString(),
      }),
      saveFn: async () => {},
    });
    assert.equal(result, 'at_refreshed');
  });

  it('returns null when refresh fails', async () => {
    const result = await getValidToken('acct_1', {
      loadFn: async () => expiredToken(),
      refreshFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result, null);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => getValidToken(null as any));
  });
});
