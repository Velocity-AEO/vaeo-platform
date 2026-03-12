/**
 * tools/gsc/gsc_token_store.test.ts
 *
 * Tests for GSC token storage — store, retrieve, expiry, OAuth URL.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  storeGSCToken,
  getGSCToken,
  isGSCConnected,
  buildGSCAuthUrl,
  exchangeGSCCode,
  type GSCTokenRecord,
  type TokenStoreDb,
} from './gsc_token_store.js';

// ── Mock DB ───────────────────────────────────────────────────────────────────

function mockDb(
  extraData: Record<string, unknown> | null = null,
): { db: TokenStoreDb; updates: Array<Record<string, unknown>> } {
  const updates: Array<Record<string, unknown>> = [];
  const db: TokenStoreDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: extraData !== null ? { extra_data: extraData } : null,
            error: null,
          }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        updates.push(data);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { db, updates };
}

function errorDb(): TokenStoreDb {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => { throw new Error('DB down'); },
        }),
      }),
      update: () => ({
        eq: async () => { throw new Error('DB down'); },
      }),
    }),
  };
}

function futureDate(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function pastDate(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

const validToken: GSCTokenRecord = {
  site_id:       'site-1',
  access_token:  'tok-123',
  refresh_token: 'ref-456',
  expires_at:    futureDate(60),
  scope:         'webmasters.readonly',
  created_at:    new Date().toISOString(),
};

// ── storeGSCToken ─────────────────────────────────────────────────────────────

describe('storeGSCToken', () => {
  it('upserts token into extra_data.gsc_token', async () => {
    const { db, updates } = mockDb({});
    await storeGSCToken(validToken, db);
    assert.equal(updates.length, 1);
    const stored = (updates[0]!.extra_data as Record<string, unknown>).gsc_token as GSCTokenRecord;
    assert.equal(stored.access_token, 'tok-123');
  });

  it('preserves existing extra_data fields', async () => {
    const { db, updates } = mockDb({ other_field: 'keep-me' });
    await storeGSCToken(validToken, db);
    const extraData = updates[0]!.extra_data as Record<string, unknown>;
    assert.equal(extraData.other_field, 'keep-me');
    assert.ok(extraData.gsc_token);
  });

  it('does not throw on DB error', async () => {
    await assert.doesNotReject(() => storeGSCToken(validToken, errorDb()));
  });
});

// ── getGSCToken ───────────────────────────────────────────────────────────────

describe('getGSCToken', () => {
  it('returns token when valid and not expired', async () => {
    const { db } = mockDb({ gsc_token: validToken });
    const result = await getGSCToken('site-1', db);
    assert.equal(result?.access_token, 'tok-123');
  });

  it('returns null when no site found', async () => {
    const db: TokenStoreDb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const result = await getGSCToken('missing', db);
    assert.equal(result, null);
  });

  it('returns null when token expired', async () => {
    const expiredToken = { ...validToken, expires_at: pastDate(10) };
    const { db } = mockDb({ gsc_token: expiredToken });
    const result = await getGSCToken('site-1', db);
    assert.equal(result, null);
  });

  it('returns null when token expires within 5 minutes', async () => {
    const nearExpiry = { ...validToken, expires_at: futureDate(3) };
    const { db } = mockDb({ gsc_token: nearExpiry });
    const result = await getGSCToken('site-1', db);
    assert.equal(result, null);
  });

  it('returns null on DB error', async () => {
    const result = await getGSCToken('site-1', errorDb());
    assert.equal(result, null);
  });
});

// ── isGSCConnected ────────────────────────────────────────────────────────────

describe('isGSCConnected', () => {
  it('returns true when valid token exists', async () => {
    const { db } = mockDb({ gsc_token: validToken });
    assert.equal(await isGSCConnected('site-1', db), true);
  });

  it('returns false when no token', async () => {
    const { db } = mockDb({});
    assert.equal(await isGSCConnected('site-1', db), false);
  });
});

// ── buildGSCAuthUrl ───────────────────────────────────────────────────────────

describe('buildGSCAuthUrl', () => {
  it('returns Google OAuth URL with correct params', () => {
    const url = buildGSCAuthUrl('client-123', 'https://app.com/callback', 'csrf-state');
    assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
    assert.ok(url.includes('client_id=client-123'));
    assert.ok(url.includes('state=csrf-state'));
    assert.ok(url.includes('webmasters.readonly'));
    assert.ok(url.includes('access_type=offline'));
  });
});

// ── exchangeGSCCode ───────────────────────────────────────────────────────────

describe('exchangeGSCCode', () => {
  it('returns tokens on success', async () => {
    const mockFetch = (async () => ({
      ok:   true,
      json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    })) as unknown as typeof fetch;

    const result = await exchangeGSCCode('code-1', 'cid', 'csec', 'https://app.com/cb', { fetch: mockFetch });
    assert.equal(result.access_token, 'at');
    assert.equal(result.refresh_token, 'rt');
    assert.equal(result.expires_in, 3600);
  });

  it('throws on API error', async () => {
    const mockFetch = (async () => ({
      ok:     false,
      status: 400,
      text:   async () => 'Bad Request',
    })) as unknown as typeof fetch;

    await assert.rejects(
      () => exchangeGSCCode('bad-code', 'cid', 'csec', 'https://app.com/cb', { fetch: mockFetch }),
      /Token exchange failed/,
    );
  });
});
