/**
 * packages/adapters/gsc/src/index.test.ts
 *
 * Tests for @vaeo/gsc-adapter.
 * All HTTP calls are injected — no real GSC API calls.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTopKeywords,
  getIndexingStatus,
  clearTokenCache,
  type GscFetch,
  type GscCredentials,
} from './index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREDS: GscCredentials = {
  clientId:     'test-client-id',
  clientSecret: 'test-client-secret',
  refreshToken: 'test-refresh-token',
};

const SITE_URL = 'https://cococabanalife.com/';
const PAGE_URL = 'https://cococabanalife.com/pages/returns';

/** Builds a mock fetch that handles token + analytics calls in sequence. */
function makeFetch(opts: {
  tokenStatus?:    number;
  tokenBody?:      object;
  analyticsStatus?: number;
  analyticsBody?:  object;
  inspectStatus?:  number;
  inspectBody?:    object;
}): GscFetch {
  let callCount = 0;
  return async (url, _init) => {
    callCount++;

    // Token endpoint
    if (url.includes('oauth2.googleapis.com/token')) {
      const status = opts.tokenStatus ?? 200;
      const body   = opts.tokenBody ?? { access_token: 'mock-token-abc', expires_in: 3600 };
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Search Analytics endpoint
    if (url.includes('searchAnalytics/query')) {
      const status = opts.analyticsStatus ?? 200;
      const body   = opts.analyticsBody ?? { rows: [] };
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    // URL Inspection endpoint
    if (url.includes('urlInspection')) {
      const status = opts.inspectStatus ?? 200;
      const body   = opts.inspectBody ?? { inspectionResult: {} };
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`Unexpected URL in test: ${url} (call #${callCount})`);
  };
}

const SAMPLE_ANALYTICS_ROWS = {
  rows: [
    { keys: ['coco cabana returns',  'https://cococabanalife.com/pages/returns'], clicks: 10, impressions: 220, ctr: 0.045, position: 4.2 },
    { keys: ['return policy',        'https://cococabanalife.com/pages/returns'], clicks:  5, impressions: 180, ctr: 0.028, position: 6.1 },
    { keys: ['luxury float returns', 'https://cococabanalife.com/pages/returns'], clicks:  3, impressions:  95, ctr: 0.032, position: 8.7 },
    { keys: ['refund cococabana',    'https://cococabanalife.com/pages/returns'], clicks:  1, impressions:  40, ctr: 0.025, position: 12.0 },
  ],
};

// ── getTopKeywords ────────────────────────────────────────────────────────────

describe('getTopKeywords — returns top 3 sorted by impressions', () => {
  beforeEach(() => clearTokenCache());

  it('returns rows sorted by impressions DESC, capped at 3', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({ analyticsBody: SAMPLE_ANALYTICS_ROWS }),
    });

    assert.equal(result.length, 3, 'Should return exactly 3 rows');
    assert.equal(result[0]!.query, 'coco cabana returns',  'Row 0: highest impressions');
    assert.equal(result[1]!.query, 'return policy',        'Row 1: second highest');
    assert.equal(result[2]!.query, 'luxury float returns', 'Row 2: third highest');
    // Row with 40 impressions should be excluded
    const queries = result.map((r) => r.query);
    assert.ok(!queries.includes('refund cococabana'), 'Row 4 should be cut off');
  });

  it('each row has query, clicks, impressions, ctr, position', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({ analyticsBody: SAMPLE_ANALYTICS_ROWS }),
    });
    const row = result[0]!;
    assert.equal(typeof row.query,       'string', 'query should be string');
    assert.equal(typeof row.clicks,      'number', 'clicks should be number');
    assert.equal(typeof row.impressions, 'number', 'impressions should be number');
    assert.equal(typeof row.ctr,         'number', 'ctr should be number');
    assert.equal(typeof row.position,    'number', 'position should be number');
  });

  it('returns [] when Analytics API returns no rows', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({ analyticsBody: {} }),
    });
    assert.deepEqual(result, []);
  });

  it('returns [] when fewer than 3 rows come back', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({
        analyticsBody: {
          rows: [
            { keys: ['only query'], clicks: 2, impressions: 50, ctr: 0.04, position: 5 },
          ],
        },
      }),
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.query, 'only query');
  });
});

describe('getTopKeywords — returns [] on API errors', () => {
  beforeEach(() => clearTokenCache());

  it('returns [] on token refresh failure (401)', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({ tokenStatus: 401, tokenBody: { error: 'invalid_client' } }),
    });
    assert.deepEqual(result, []);
  });

  it('returns [] on Analytics API 403', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({ analyticsStatus: 403, analyticsBody: { error: 'forbidden' } }),
    });
    assert.deepEqual(result, []);
  });

  it('returns [] on Analytics API 500', async () => {
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    makeFetch({ analyticsStatus: 500 }),
    });
    assert.deepEqual(result, []);
  });

  it('returns [] when fetch throws (network error)', async () => {
    const failFetch: GscFetch = async (url) => {
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      throw new Error('ECONNREFUSED');
    };
    const result = await getTopKeywords(SITE_URL, PAGE_URL, 28, {
      credentials: CREDS,
      gscFetch:    failFetch,
    });
    assert.deepEqual(result, []);
  });

  it('does not throw — always returns an array', async () => {
    const alwaysThrow: GscFetch = async () => { throw new Error('network down'); };
    await assert.doesNotReject(() =>
      getTopKeywords(SITE_URL, PAGE_URL, 28, { credentials: CREDS, gscFetch: alwaysThrow }),
    );
  });
});

// ── Token cache ───────────────────────────────────────────────────────────────

describe('getTopKeywords — caches access token, only refreshes on expiry', () => {
  beforeEach(() => clearTokenCache());

  it('calls token endpoint only once for two sequential keyword fetches', async () => {
    let tokenCalls = 0;
    const countingFetch: GscFetch = async (url, init) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        tokenCalls++;
        return new Response(
          JSON.stringify({ access_token: 'cached-token', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await getTopKeywords(SITE_URL, PAGE_URL, 28, { credentials: CREDS, gscFetch: countingFetch });
    await getTopKeywords(SITE_URL, PAGE_URL, 28, { credentials: CREDS, gscFetch: countingFetch });

    assert.equal(tokenCalls, 1, 'Token should only be fetched once; second call uses cache');
  });

  it('re-fetches token after clearTokenCache()', async () => {
    let tokenCalls = 0;
    const countingFetch: GscFetch = async (url) => {
      if (url.includes('oauth2')) {
        tokenCalls++;
        return new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await getTopKeywords(SITE_URL, PAGE_URL, 28, { credentials: CREDS, gscFetch: countingFetch });
    clearTokenCache();
    await getTopKeywords(SITE_URL, PAGE_URL, 28, { credentials: CREDS, gscFetch: countingFetch });

    assert.equal(tokenCalls, 2, 'After cache clear, token should be re-fetched');
  });
});

// ── getIndexingStatus ─────────────────────────────────────────────────────────

describe('getIndexingStatus — returns correct shape', () => {
  beforeEach(() => clearTokenCache());

  it('returns indexed=true when verdict=PASS', async () => {
    const result = await getIndexingStatus(SITE_URL, PAGE_URL, {
      credentials: CREDS,
      gscFetch: makeFetch({
        inspectBody: {
          inspectionResult: {
            indexStatusResult: {
              verdict:       'PASS',
              lastCrawlTime: '2026-02-15T10:30:00Z',
              coverageState: 'Submitted and indexed',
            },
          },
        },
      }),
    });
    assert.equal(result.indexed,       true,                       'indexed should be true');
    assert.equal(result.lastCrawled,   '2026-02-15T10:30:00Z',     'lastCrawled should match');
    assert.equal(result.coverageState, 'Submitted and indexed',    'coverageState should match');
  });

  it('returns indexed=false when verdict=NEUTRAL', async () => {
    const result = await getIndexingStatus(SITE_URL, PAGE_URL, {
      credentials: CREDS,
      gscFetch: makeFetch({
        inspectBody: {
          inspectionResult: {
            indexStatusResult: {
              verdict:       'NEUTRAL',
              coverageState: 'Crawled - currently not indexed',
            },
          },
        },
      }),
    });
    assert.equal(result.indexed, false);
    assert.equal(result.lastCrawled, null);
    assert.equal(result.coverageState, 'Crawled - currently not indexed');
  });

  it('returns default object on API error', async () => {
    const result = await getIndexingStatus(SITE_URL, PAGE_URL, {
      credentials: CREDS,
      gscFetch:    makeFetch({ tokenStatus: 500, tokenBody: {} }),
    });
    assert.equal(result.indexed,       false);
    assert.equal(result.lastCrawled,   null);
    assert.equal(result.coverageState, 'unknown');
  });

  it('returns default object on network failure', async () => {
    const failFetch: GscFetch = async () => { throw new Error('timeout'); };
    const result = await getIndexingStatus(SITE_URL, PAGE_URL, {
      credentials: CREDS,
      gscFetch:    failFetch,
    });
    assert.equal(result.indexed,       false);
    assert.equal(result.lastCrawled,   null);
    assert.equal(result.coverageState, 'unknown');
  });

  it('does not throw — always returns IndexingStatus', async () => {
    const failFetch: GscFetch = async () => { throw new Error('boom'); };
    await assert.doesNotReject(() =>
      getIndexingStatus(SITE_URL, PAGE_URL, { credentials: CREDS, gscFetch: failFetch }),
    );
  });

  it('returns object with all three required fields in all cases', async () => {
    const result = await getIndexingStatus(SITE_URL, PAGE_URL, {
      credentials: CREDS,
      gscFetch:    makeFetch({ inspectBody: { inspectionResult: {} } }),
    });
    assert.ok('indexed'       in result, 'Missing indexed');
    assert.ok('lastCrawled'   in result, 'Missing lastCrawled');
    assert.ok('coverageState' in result, 'Missing coverageState');
  });
});
