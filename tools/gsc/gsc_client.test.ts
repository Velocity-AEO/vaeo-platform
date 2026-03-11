/**
 * tools/gsc/gsc_client.test.ts
 *
 * Tests for GSC API client — injectable fetch, non-fatal error handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGSCClient, type GSCRow } from './gsc_client.js';

// ── Mock fetch ────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown): typeof fetch {
  return (async (_url: string | URL | Request, _init?: RequestInit) => ({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  })) as unknown as typeof fetch;
}

function capturingFetch(
  status: number,
  body: unknown,
): { fetch: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

function throwingFetch(): typeof fetch {
  return (async () => { throw new Error('Network error'); }) as unknown as typeof fetch;
}

// ── listProperties ────────────────────────────────────────────────────────────

describe('GSCClient.listProperties', () => {
  it('returns properties from siteEntry', async () => {
    const client = createGSCClient('tok', {
      fetch: mockFetch(200, {
        siteEntry: [
          { siteUrl: 'https://shop.com', permissionLevel: 'siteOwner' },
          { siteUrl: 'https://blog.com', permissionLevel: 'siteFullUser' },
        ],
      }),
    });
    const props = await client.listProperties();
    assert.equal(props.length, 2);
    assert.equal(props[0]!.siteUrl, 'https://shop.com');
    assert.equal(props[0]!.permissionLevel, 'siteOwner');
  });

  it('returns empty array on API error', async () => {
    const client = createGSCClient('tok', { fetch: mockFetch(403, {}) });
    const props = await client.listProperties();
    assert.deepEqual(props, []);
  });

  it('returns empty array on network error', async () => {
    const client = createGSCClient('tok', { fetch: throwingFetch() });
    const props = await client.listProperties();
    assert.deepEqual(props, []);
  });

  it('sends Authorization header with token', async () => {
    const { fetch: f, calls } = capturingFetch(200, { siteEntry: [] });
    const client = createGSCClient('my-secret-token', { fetch: f });
    await client.listProperties();
    assert.equal(calls.length, 1);
    const authHeader = (calls[0]!.init?.headers as Record<string, string>)?.['Authorization'];
    assert.equal(authHeader, 'Bearer my-secret-token');
  });
});

// ── query ─────────────────────────────────────────────────────────────────────

describe('GSCClient.query', () => {
  it('returns rows from search analytics', async () => {
    const rows: GSCRow[] = [
      { keys: ['https://shop.com/products/a'], clicks: 100, impressions: 1000, ctr: 0.1, position: 3.5 },
    ];
    const client = createGSCClient('tok', { fetch: mockFetch(200, { rows }) });
    const result = await client.query('https://shop.com', {
      startDate: '2026-01-01', endDate: '2026-01-28', dimensions: ['page'],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.clicks, 100);
  });

  it('POSTs to correct URL with encoded siteUrl', async () => {
    const { fetch: f, calls } = capturingFetch(200, { rows: [] });
    const client = createGSCClient('tok', { fetch: f });
    await client.query('https://shop.com', {
      startDate: '2026-01-01', endDate: '2026-01-28', dimensions: ['page'],
    });
    assert.ok(calls[0]!.url.includes(encodeURIComponent('https://shop.com')));
    assert.equal(calls[0]!.init?.method, 'POST');
  });

  it('returns empty array on error', async () => {
    const client = createGSCClient('tok', { fetch: mockFetch(500, {}) });
    const result = await client.query('https://shop.com', {
      startDate: '2026-01-01', endDate: '2026-01-28', dimensions: ['page'],
    });
    assert.deepEqual(result, []);
  });

  it('returns empty array on network failure', async () => {
    const client = createGSCClient('tok', { fetch: throwingFetch() });
    const result = await client.query('https://shop.com', {
      startDate: '2026-01-01', endDate: '2026-01-28', dimensions: ['page'],
    });
    assert.deepEqual(result, []);
  });
});

// ── getTopPages ───────────────────────────────────────────────────────────────

describe('GSCClient.getTopPages', () => {
  it('returns rows sorted by clicks descending', async () => {
    const rows: GSCRow[] = [
      { keys: ['/a'], clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { keys: ['/b'], clicks: 500, impressions: 2000, ctr: 0.25, position: 2 },
      { keys: ['/c'], clicks: 50, impressions: 800, ctr: 0.06, position: 8 },
    ];
    const client = createGSCClient('tok', { fetch: mockFetch(200, { rows }) });
    const result = await client.getTopPages('https://shop.com');
    assert.equal(result[0]!.clicks, 500);
    assert.equal(result[1]!.clicks, 50);
    assert.equal(result[2]!.clicks, 10);
  });

  it('uses page dimension in query', async () => {
    const { fetch: f, calls } = capturingFetch(200, { rows: [] });
    const client = createGSCClient('tok', { fetch: f });
    await client.getTopPages('https://shop.com', 7, 50);
    const body = JSON.parse(calls[0]!.init?.body as string);
    assert.deepEqual(body.dimensions, ['page']);
    assert.equal(body.rowLimit, 50);
  });
});

// ── getPageMetrics ────────────────────────────────────────────────────────────

describe('GSCClient.getPageMetrics', () => {
  it('returns single row for matching URL', async () => {
    const rows: GSCRow[] = [
      { keys: ['https://shop.com/products/a'], clicks: 75, impressions: 500, ctr: 0.15, position: 4.2 },
    ];
    const client = createGSCClient('tok', { fetch: mockFetch(200, { rows }) });
    const result = await client.getPageMetrics('https://shop.com', 'https://shop.com/products/a');
    assert.equal(result?.clicks, 75);
    assert.equal(result?.position, 4.2);
  });

  it('returns null when no data for URL', async () => {
    const client = createGSCClient('tok', { fetch: mockFetch(200, { rows: [] }) });
    const result = await client.getPageMetrics('https://shop.com', 'https://shop.com/nonexistent');
    assert.equal(result, null);
  });

  it('includes dimension filter for URL', async () => {
    const { fetch: f, calls } = capturingFetch(200, { rows: [] });
    const client = createGSCClient('tok', { fetch: f });
    await client.getPageMetrics('https://shop.com', 'https://shop.com/products/a');
    const body = JSON.parse(calls[0]!.init?.body as string);
    assert.equal(body.dimensionFilterGroups[0].filters[0].dimension, 'page');
    assert.equal(body.dimensionFilterGroups[0].filters[0].expression, 'https://shop.com/products/a');
  });
});
