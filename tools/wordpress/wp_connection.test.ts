/**
 * tools/wordpress/wp_connection.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthHeader,
  verifyWPConnection,
  fetchActivePlugins,
} from './wp_connection.ts';
import type { WPConnectionConfig } from './wp_connection.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_CONFIG: WPConnectionConfig = {
  site_id:      'wp-site-1',
  domain:       'teststore.com',
  wp_url:       'https://teststore.com',
  username:     'admin',
  app_password: 'abcd 1234 efgh',
  platform:     'wordpress',
};

function mockFetch(status: number, body: unknown, ok = true): WPConnectionConfig['app_password'] {
  return 'unused'; // used below with fetchFn
}

function makeFetchFn(responses: Array<{ status: number; body: unknown; ok?: boolean }>) {
  let call = 0;
  return async (_url: string, _opts: RequestInit): Promise<Response> => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    const ok = r.ok ?? (r.status >= 200 && r.status < 300);
    return {
      ok,
      status:     r.status,
      statusText: ok ? 'OK' : 'Error',
      json:       async () => r.body,
    } as unknown as Response;
  };
}

// ── buildAuthHeader ───────────────────────────────────────────────────────────

describe('buildAuthHeader', () => {
  it('returns a Basic auth string', () => {
    const h = buildAuthHeader('admin', 'pass123');
    assert.ok(h.startsWith('Basic '));
  });

  it('base64-encodes username:password', () => {
    const h    = buildAuthHeader('admin', 'pass123');
    const b64  = h.replace('Basic ', '');
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    assert.equal(decoded, 'admin:pass123');
  });

  it('handles app password with spaces', () => {
    const h    = buildAuthHeader('user', 'ab cd ef gh');
    const b64  = h.replace('Basic ', '');
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    assert.equal(decoded, 'user:ab cd ef gh');
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildAuthHeader(null as never, null as never));
  });
});

// ── verifyWPConnection ────────────────────────────────────────────────────────

describe('verifyWPConnection', () => {
  it('returns success=true on 200 response', async () => {
    const fetchFn = makeFetchFn([
      { status: 200, body: { generator: 'WordPress/6.4.2', name: 'Test Store' } },
      { status: 200, body: [] }, // plugins
    ]);
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn });
    assert.equal(r.success, true);
  });

  it('sets site_id and domain on success', async () => {
    const fetchFn = makeFetchFn([
      { status: 200, body: { generator: 'WordPress/6.4.2' } },
      { status: 200, body: [] },
    ]);
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn });
    assert.equal(r.site_id, 'wp-site-1');
    assert.equal(r.domain, 'teststore.com');
  });

  it('extracts wp_version from generator field', async () => {
    const fetchFn = makeFetchFn([
      { status: 200, body: { generator: 'WordPress/6.4.2' } },
      { status: 200, body: [] },
    ]);
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn });
    assert.equal(r.wp_version, '6.4.2');
  });

  it('returns success=false on 401', async () => {
    const fetchFn = makeFetchFn([{ status: 401, body: {}, ok: false }]);
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn });
    assert.equal(r.success, false);
    assert.ok(r.error?.includes('401'));
  });

  it('returns success=false when fetch throws', async () => {
    const fetchFn = async () => { throw new Error('Network error'); };
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn: fetchFn as never });
    assert.equal(r.success, false);
    assert.ok(r.error?.includes('Network error'));
  });

  it('detects WooCommerce from plugins list', async () => {
    const fetchFn = makeFetchFn([
      { status: 200, body: { generator: 'WordPress/6.4' } },
      { status: 200, body: [{ plugin: 'woocommerce/woocommerce.php' }] },
    ]);
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn });
    assert.equal(r.woocommerce_active, true);
  });

  it('woocommerce_active=false when not in plugins', async () => {
    const fetchFn = makeFetchFn([
      { status: 200, body: { generator: 'WordPress/6.4' } },
      { status: 200, body: [{ plugin: 'yoast-seo/wp-seo.php' }] },
    ]);
    const r = await verifyWPConnection(BASE_CONFIG, { fetchFn });
    assert.equal(r.woocommerce_active, false);
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() =>
      verifyWPConnection(null as never),
    );
  });
});

// ── fetchActivePlugins ────────────────────────────────────────────────────────

describe('fetchActivePlugins', () => {
  it('returns array of plugin slugs', async () => {
    const fetchFn = makeFetchFn([{
      status: 200,
      body:   [
        { plugin: 'woocommerce/woocommerce.php' },
        { plugin: 'yoast-seo/wp-seo.php' },
      ],
    }]);
    const plugins = await fetchActivePlugins(BASE_CONFIG, { fetchFn });
    assert.ok(Array.isArray(plugins));
    assert.ok(plugins.includes('woocommerce/woocommerce.php'));
  });

  it('returns [] on non-200 response', async () => {
    const fetchFn = makeFetchFn([{ status: 403, body: {}, ok: false }]);
    const plugins = await fetchActivePlugins(BASE_CONFIG, { fetchFn });
    assert.deepEqual(plugins, []);
  });

  it('returns [] when fetch throws', async () => {
    const fetchFn = async () => { throw new Error('timeout'); };
    const plugins = await fetchActivePlugins(BASE_CONFIG, { fetchFn: fetchFn as never });
    assert.deepEqual(plugins, []);
  });

  it('returns [] on non-array response body', async () => {
    const fetchFn = makeFetchFn([{ status: 200, body: { error: 'rest_forbidden' } }]);
    const plugins = await fetchActivePlugins(BASE_CONFIG, { fetchFn });
    assert.deepEqual(plugins, []);
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() =>
      fetchActivePlugins(null as never),
    );
  });
});
