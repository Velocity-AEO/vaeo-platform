/**
 * tools/shopify/oauth_scopes.test.ts
 *
 * Tests for Shopify OAuth scope validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOAuthScopes,
  buildScopeString,
  checkInstalledScopes,
  REQUIRED_SCOPES,
  OPTIONAL_SCOPES,
  type OAuthScopeDeps,
} from './oauth_scopes.js';

// ── validateOAuthScopes ──────────────────────────────────────────────────────

describe('validateOAuthScopes', () => {
  it('valid when all required scopes granted (array)', () => {
    const result = validateOAuthScopes([...REQUIRED_SCOPES]);
    assert.equal(result.valid, true);
    assert.equal(result.has_all_required, true);
    assert.equal(result.missing_required.length, 0);
  });

  it('valid when all required scopes granted (comma string)', () => {
    const result = validateOAuthScopes(REQUIRED_SCOPES.join(','));
    assert.equal(result.valid, true);
    assert.equal(result.has_all_required, true);
  });

  it('invalid when missing required scopes', () => {
    const result = validateOAuthScopes(['read_themes', 'write_themes']);
    assert.equal(result.valid, false);
    assert.equal(result.has_all_required, false);
    assert.ok(result.missing_required.length > 0);
  });

  it('reports missing optional scopes', () => {
    const result = validateOAuthScopes([...REQUIRED_SCOPES]);
    assert.deepStrictEqual(result.missing_optional, OPTIONAL_SCOPES);
  });

  it('no missing optional when all granted', () => {
    const result = validateOAuthScopes([...REQUIRED_SCOPES, ...OPTIONAL_SCOPES]);
    assert.equal(result.missing_optional.length, 0);
  });

  it('granted list reflects input', () => {
    const result = validateOAuthScopes(['read_themes', 'write_themes']);
    assert.deepStrictEqual(result.granted, ['read_themes', 'write_themes']);
  });

  it('handles empty string', () => {
    const result = validateOAuthScopes('');
    assert.equal(result.valid, false);
    assert.equal(result.granted.length, 0);
    assert.deepStrictEqual(result.missing_required, REQUIRED_SCOPES);
  });

  it('handles empty array', () => {
    const result = validateOAuthScopes([]);
    assert.equal(result.valid, false);
  });

  it('trims whitespace in comma string', () => {
    const result = validateOAuthScopes(REQUIRED_SCOPES.join(' , '));
    assert.equal(result.valid, true);
  });

  it('ignores extra scopes not in our lists', () => {
    const result = validateOAuthScopes([...REQUIRED_SCOPES, 'read_orders', 'write_orders']);
    assert.equal(result.valid, true);
    assert.ok(result.granted.includes('read_orders'));
  });
});

// ── buildScopeString ─────────────────────────────────────────────────────────

describe('buildScopeString', () => {
  it('returns comma-separated required scopes', () => {
    const result = buildScopeString();
    assert.equal(result, REQUIRED_SCOPES.join(','));
  });

  it('includes all 7 required scopes', () => {
    const parts = buildScopeString().split(',');
    assert.equal(parts.length, 7);
  });

  it('does not include optional scopes', () => {
    const result = buildScopeString();
    for (const opt of OPTIONAL_SCOPES) {
      assert.ok(!result.includes(opt));
    }
  });
});

// ── checkInstalledScopes ─────────────────────────────────────────────────────

describe('checkInstalledScopes', () => {
  it('returns valid when all scopes installed', async () => {
    const deps: OAuthScopeDeps = {
      fetch: async () => ({
        ok: true,
        json: async () => ({
          access_scopes: REQUIRED_SCOPES.map((s) => ({ handle: s })),
        }),
      }) as Response,
    };
    const result = await checkInstalledScopes('test.myshopify.com', 'token', deps);
    assert.equal(result.valid, true);
    assert.equal(result.has_all_required, true);
  });

  it('returns invalid when API returns error', async () => {
    const deps: OAuthScopeDeps = {
      fetch: async () => ({ ok: false, status: 401 }) as Response,
    };
    const result = await checkInstalledScopes('test.myshopify.com', 'token', deps);
    assert.equal(result.valid, false);
    assert.deepStrictEqual(result.missing_required, REQUIRED_SCOPES);
  });

  it('returns invalid when fetch throws', async () => {
    const deps: OAuthScopeDeps = {
      fetch: async () => { throw new Error('network'); },
    };
    const result = await checkInstalledScopes('test.myshopify.com', 'token', deps);
    assert.equal(result.valid, false);
  });

  it('sends correct URL and headers', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    const deps: OAuthScopeDeps = {
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = Object.fromEntries(Object.entries(init?.headers ?? {}));
        return {
          ok: true,
          json: async () => ({ access_scopes: [] }),
        } as Response;
      },
    };
    await checkInstalledScopes('my-shop.myshopify.com', 'shpat_abc', deps);
    assert.equal(capturedUrl, 'https://my-shop.myshopify.com/admin/oauth/access_scopes.json');
    assert.equal(capturedHeaders['X-Shopify-Access-Token'], 'shpat_abc');
  });
});
