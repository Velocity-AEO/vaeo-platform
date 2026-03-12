/**
 * tools/gsc/gsc_search_analytics.test.ts
 *
 * Tests for GSC search analytics client.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnalyticsRequest,
  fetchSearchAnalytics,
  extractKeywordRankings,
  type GSCSearchAnalyticsRequest,
  type GSCSearchAnalyticsResponse,
  type GSCSearchAnalyticsRow,
} from './gsc_search_analytics.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function mockRow(keyword: string, url: string): GSCSearchAnalyticsRow {
  return {
    keys: [keyword, url],
    clicks: 42,
    impressions: 500,
    ctr: 0.084,
    position: 5.3,
  };
}

function mockResponse(rows?: GSCSearchAnalyticsRow[]): GSCSearchAnalyticsResponse {
  const r = rows ?? [mockRow('seo tools', 'https://x.com/tools')];
  return {
    rows: r,
    property_url: 'https://x.com/',
    fetched_at: new Date().toISOString(),
    row_count: r.length,
  };
}

function mockRequest(): GSCSearchAnalyticsRequest {
  return buildAnalyticsRequest('https://x.com/', 28);
}

// ── buildAnalyticsRequest ────────────────────────────────────────────────────

describe('buildAnalyticsRequest', () => {
  it('sets property_url', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28);
    assert.equal(req.property_url, 'https://x.com/');
  });

  it('sets start_date based on days_back', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28);
    assert.equal(req.start_date, daysAgo(28));
  });

  it('sets end_date to 3 days ago (GSC lag)', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28);
    assert.equal(req.end_date, daysAgo(3));
  });

  it('respects custom days_back', () => {
    const req = buildAnalyticsRequest('https://x.com/', 7);
    assert.equal(req.start_date, daysAgo(7));
  });

  it('sets default dimensions to query and page', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28);
    assert.deepEqual(req.dimensions, ['query', 'page']);
  });

  it('sets default row_limit to 1000', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28);
    assert.equal(req.row_limit, 1000);
  });

  it('respects custom row_limit', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28, 500);
    assert.equal(req.row_limit, 500);
  });

  it('sets start_row to 0', () => {
    const req = buildAnalyticsRequest('https://x.com/', 28);
    assert.equal(req.start_row, 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildAnalyticsRequest(null as any, null as any));
  });
});

// ── fetchSearchAnalytics ─────────────────────────────────────────────────────

describe('fetchSearchAnalytics', () => {
  it('calls fetchFn with correct URL', async () => {
    let calledUrl = '';
    const fetchFn = async (url: string) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ rows: [] }) };
    };
    await fetchSearchAnalytics(mockRequest(), 'tok_123', { fetchFn });
    assert.ok(calledUrl.includes('searchAnalytics/query'));
    assert.ok(calledUrl.includes(encodeURIComponent('https://x.com/')));
  });

  it('sends Authorization header with token', async () => {
    let headers: any = {};
    const fetchFn = async (_url: string, opts: any) => {
      headers = opts.headers;
      return { ok: true, json: async () => ({ rows: [] }) };
    };
    await fetchSearchAnalytics(mockRequest(), 'tok_abc', { fetchFn });
    assert.equal(headers['Authorization'], 'Bearer tok_abc');
  });

  it('sends POST method', async () => {
    let method = '';
    const fetchFn = async (_url: string, opts: any) => {
      method = opts.method;
      return { ok: true, json: async () => ({ rows: [] }) };
    };
    await fetchSearchAnalytics(mockRequest(), 'tok', { fetchFn });
    assert.equal(method, 'POST');
  });

  it('returns rows from successful response', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        rows: [{ keys: ['kw', 'url'], clicks: 10, impressions: 100, ctr: 0.1, position: 3.5 }],
      }),
    });
    const res = await fetchSearchAnalytics(mockRequest(), 'tok', { fetchFn });
    assert.equal(res.row_count, 1);
    assert.equal(res.rows[0].clicks, 10);
  });

  it('returns empty rows on non-ok response', async () => {
    const fetchFn = async () => ({ ok: false, json: async () => ({}) });
    const res = await fetchSearchAnalytics(mockRequest(), 'tok', { fetchFn });
    assert.equal(res.row_count, 0);
    assert.deepEqual(res.rows, []);
  });

  it('returns empty rows when fetchFn throws', async () => {
    const fetchFn = async () => { throw new Error('network'); };
    const res = await fetchSearchAnalytics(mockRequest(), 'tok', { fetchFn });
    assert.equal(res.row_count, 0);
  });

  it('sets property_url on response', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ rows: [] }) });
    const res = await fetchSearchAnalytics(mockRequest(), 'tok', { fetchFn });
    assert.equal(res.property_url, 'https://x.com/');
  });

  it('sets fetched_at timestamp', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ rows: [] }) });
    const res = await fetchSearchAnalytics(mockRequest(), 'tok', { fetchFn });
    assert.ok(res.fetched_at.includes('T'));
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => fetchSearchAnalytics(null as any, null as any, {
      fetchFn: async () => { throw new Error('boom'); },
    }));
  });
});

// ── extractKeywordRankings ───────────────────────────────────────────────────

describe('extractKeywordRankings', () => {
  it('maps rows to keyword rankings', () => {
    const rankings = extractKeywordRankings(mockResponse());
    assert.equal(rankings.length, 1);
    assert.equal(rankings[0].keyword, 'seo tools');
    assert.equal(rankings[0].url, 'https://x.com/tools');
  });

  it('sets position rounded to 1 decimal', () => {
    const rankings = extractKeywordRankings(mockResponse());
    assert.equal(rankings[0].position, 5.3);
  });

  it('sets clicks and impressions', () => {
    const rankings = extractKeywordRankings(mockResponse());
    assert.equal(rankings[0].clicks, 42);
    assert.equal(rankings[0].impressions, 500);
  });

  it('handles multiple rows', () => {
    const rows = [
      mockRow('kw1', 'https://x.com/a'),
      mockRow('kw2', 'https://x.com/b'),
      mockRow('kw3', 'https://x.com/c'),
    ];
    const rankings = extractKeywordRankings(mockResponse(rows));
    assert.equal(rankings.length, 3);
  });

  it('returns empty array for empty rows', () => {
    const rankings = extractKeywordRankings(mockResponse([]));
    assert.deepEqual(rankings, []);
  });

  it('returns empty array for null response', () => {
    const rankings = extractKeywordRankings(null as any);
    assert.deepEqual(rankings, []);
  });

  it('handles rows with missing keys gracefully', () => {
    const res = mockResponse([{ keys: [], clicks: 0, impressions: 0, ctr: 0, position: 0 }]);
    const rankings = extractKeywordRankings(res);
    assert.equal(rankings[0].keyword, '');
    assert.equal(rankings[0].url, '');
  });

  it('never throws on malformed input', () => {
    assert.doesNotThrow(() => extractKeywordRankings({} as any));
  });
});
