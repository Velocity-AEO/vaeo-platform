/**
 * tools/gsc-ingest/keyword_sync.test.ts
 *
 * Unit tests for the GSC keyword sync engine.
 * All GSC API calls are mocked via injectable deps.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncKeywordsForSite,
  getTopKeywordsForUrl,
  type GscCredentials,
  type GscKeywordRow,
  type GscCacheRow,
  type UrlInventoryRow,
  type KeywordSyncDeps,
} from './keyword_sync.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CREDS: GscCredentials = {
  clientId:     'test-client-id',
  clientSecret: 'test-client-secret',
  refreshToken: 'test-refresh-token',
};

const SITE_ID  = 'site-001';
const SITE_URL = 'https://example.com/';

function makeKeywords(query: string, clicks: number): GscKeywordRow {
  return { query, clicks, impressions: clicks * 10, ctr: 0.05, position: 3.2 };
}

// ── Mock deps ────────────────────────────────────────────────────────────────

interface MockState {
  upsertedRows: GscCacheRow[];
  fetchCalls:   string[];
  delayCount:   number;
}

function makeDeps(overrides: Partial<KeywordSyncDeps> = {}): KeywordSyncDeps & { _state: MockState } {
  const state: MockState = { upsertedRows: [], fetchCalls: [], delayCount: 0 };

  return {
    _state: state,

    fetchGscData: async (_siteUrl, pageUrl, _creds) => {
      state.fetchCalls.push(pageUrl);
      return [
        makeKeywords('pool floats', 50),
        makeKeywords('foam floats', 30),
        makeKeywords('luxury pool', 20),
      ];
    },

    loadUrlInventory: async () => [
      { url: 'https://example.com/', status: 'active' },
      { url: 'https://example.com/products/widget', status: 'active' },
      { url: 'https://example.com/products/gadget', status: 'active' },
    ],

    upsertCache: async (rows) => {
      state.upsertedRows.push(...rows);
      return rows.length;
    },

    readCachedKeywords: async (_siteId, _url, limit) => {
      return state.upsertedRows
        .filter((r) => r.url === _url)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, limit);
    },

    delay: async () => { state.delayCount++; },

    ...overrides,
  };
}

// ── syncKeywordsForSite ──────────────────────────────────────────────────────

describe('syncKeywordsForSite', () => {

  // ── Validation ─────────────────────────────────────────────────────────

  it('fails when siteId is empty', async () => {
    const deps = makeDeps();
    const result = await syncKeywordsForSite('', SITE_URL, CREDS, deps);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('siteId'));
  });

  it('fails when siteUrl is empty', async () => {
    const deps = makeDeps();
    const result = await syncKeywordsForSite(SITE_ID, '', CREDS, deps);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('siteUrl'));
  });

  it('fails when credentials are incomplete', async () => {
    const deps = makeDeps();
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, { clientId: '', clientSecret: '', refreshToken: '' }, deps);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('credentials'));
  });

  it('fails when clientSecret is missing', async () => {
    const deps = makeDeps();
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, { ...CREDS, clientSecret: '' }, deps);
    assert.equal(result.status, 'failed');
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it('fetches keywords for all active URLs', async () => {
    const deps = makeDeps();
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'completed');
    assert.equal(result.urls_processed, 3);
    assert.equal(deps._state.fetchCalls.length, 3);
  });

  it('stores keywords in cache via upsertCache', async () => {
    const deps = makeDeps();
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    // 3 URLs × 3 keywords each = 9 cache rows
    assert.equal(result.keywords_cached, 9);
    assert.equal(deps._state.upsertedRows.length, 9);
  });

  it('cache rows have correct site_id and url', async () => {
    const deps = makeDeps();
    await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    for (const row of deps._state.upsertedRows) {
      assert.equal(row.site_id, SITE_ID);
      assert.ok(row.url.startsWith('https://example.com'));
      assert.ok(row.captured_at.length > 0, 'has captured_at timestamp');
    }
  });

  // ── Filtering ──────────────────────────────────────────────────────────

  it('skips non-active URLs', async () => {
    const deps = makeDeps({
      loadUrlInventory: async () => [
        { url: 'https://example.com/active', status: 'active' },
        { url: 'https://example.com/redirected', status: 'redirected' },
        { url: 'https://example.com/deleted', status: 'deleted' },
        { url: 'https://example.com/not-found', status: '404' },
      ],
    });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.urls_processed, 1);
    assert.equal(deps._state.fetchCalls.length, 1);
    assert.equal(deps._state.fetchCalls[0], 'https://example.com/active');
  });

  it('returns completed with zero counts when no active URLs', async () => {
    const deps = makeDeps({
      loadUrlInventory: async () => [
        { url: 'https://example.com/gone', status: '404' },
      ],
    });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'completed');
    assert.equal(result.urls_processed, 0);
    assert.equal(result.keywords_cached, 0);
  });

  it('returns completed with zero counts when inventory is empty', async () => {
    const deps = makeDeps({ loadUrlInventory: async () => [] });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'completed');
    assert.equal(result.urls_processed, 0);
  });

  // ── Rate limiting / batching ───────────────────────────────────────────

  it('processes URLs in batches of 10', async () => {
    // 25 URLs → 3 batches (10, 10, 5)
    const urls: UrlInventoryRow[] = [];
    for (let i = 0; i < 25; i++) {
      urls.push({ url: `https://example.com/page-${i}`, status: 'active' });
    }
    const deps = makeDeps({ loadUrlInventory: async () => urls });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.batches, 3);
    assert.equal(result.urls_processed, 25);
  });

  it('delays 1 second between batches (not before first)', async () => {
    const urls: UrlInventoryRow[] = [];
    for (let i = 0; i < 25; i++) {
      urls.push({ url: `https://example.com/page-${i}`, status: 'active' });
    }
    const deps = makeDeps({ loadUrlInventory: async () => urls });
    await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    // 3 batches → 2 delays (no delay before first batch)
    assert.equal(deps._state.delayCount, 2);
  });

  it('no delay for a single batch', async () => {
    const deps = makeDeps({
      loadUrlInventory: async () => [
        { url: 'https://example.com/only', status: 'active' },
      ],
    });
    await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(deps._state.delayCount, 0);
  });

  it('exactly 10 URLs = 1 batch, no delays', async () => {
    const urls: UrlInventoryRow[] = [];
    for (let i = 0; i < 10; i++) {
      urls.push({ url: `https://example.com/page-${i}`, status: 'active' });
    }
    const deps = makeDeps({ loadUrlInventory: async () => urls });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.batches, 1);
    assert.equal(deps._state.delayCount, 0);
  });

  it('11 URLs = 2 batches, 1 delay', async () => {
    const urls: UrlInventoryRow[] = [];
    for (let i = 0; i < 11; i++) {
      urls.push({ url: `https://example.com/page-${i}`, status: 'active' });
    }
    const deps = makeDeps({ loadUrlInventory: async () => urls });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.batches, 2);
    assert.equal(deps._state.delayCount, 1);
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('continues processing when fetchGscData fails for one URL', async () => {
    let callCount = 0;
    const deps = makeDeps({
      fetchGscData: async (_siteUrl, pageUrl) => {
        callCount++;
        if (callCount === 2) throw new Error('GSC quota exceeded');
        return [makeKeywords('test keyword', 10)];
      },
    });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'completed');
    assert.equal(result.urls_processed, 2); // 3 URLs, 1 failed
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].includes('GSC quota exceeded'));
  });

  it('records error when upsertCache fails', async () => {
    const deps = makeDeps({
      upsertCache: async () => { throw new Error('DB write failed'); },
    });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'completed');
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('upsert failed'));
  });

  it('fails when loadUrlInventory throws', async () => {
    const deps = makeDeps({
      loadUrlInventory: async () => { throw new Error('DB read failed'); },
    });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Failed to load URL inventory'));
  });

  // ── URLs with no keywords ──────────────────────────────────────────────

  it('handles URLs that return zero keywords', async () => {
    const deps = makeDeps({
      fetchGscData: async () => [],
    });
    const result = await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    assert.equal(result.status, 'completed');
    assert.equal(result.urls_processed, 3);
    assert.equal(result.keywords_cached, 0);
    assert.equal(deps._state.upsertedRows.length, 0);
  });
});

// ── getTopKeywordsForUrl ─────────────────────────────────────────────────────

describe('getTopKeywordsForUrl', () => {

  it('returns top 5 keywords by clicks from cache', async () => {
    const cachedRows: GscCacheRow[] = [
      { site_id: SITE_ID, url: 'https://example.com/p', query: 'kw1', clicks: 100, impressions: 1000, ctr: 0.1, position: 1.5, captured_at: '' },
      { site_id: SITE_ID, url: 'https://example.com/p', query: 'kw2', clicks: 80, impressions: 900, ctr: 0.09, position: 2.1, captured_at: '' },
      { site_id: SITE_ID, url: 'https://example.com/p', query: 'kw3', clicks: 60, impressions: 800, ctr: 0.08, position: 3.0, captured_at: '' },
      { site_id: SITE_ID, url: 'https://example.com/p', query: 'kw4', clicks: 40, impressions: 700, ctr: 0.06, position: 4.5, captured_at: '' },
      { site_id: SITE_ID, url: 'https://example.com/p', query: 'kw5', clicks: 20, impressions: 600, ctr: 0.03, position: 6.0, captured_at: '' },
    ];

    const deps: Pick<KeywordSyncDeps, 'readCachedKeywords'> = {
      readCachedKeywords: async (_siteId, _url, limit) => cachedRows.slice(0, limit),
    };

    const keywords = await getTopKeywordsForUrl(SITE_ID, 'https://example.com/p', deps);

    assert.equal(keywords.length, 5);
    assert.equal(keywords[0].query, 'kw1');
    assert.equal(keywords[0].clicks, 100);
    assert.equal(keywords[4].query, 'kw5');
  });

  it('returns empty array when no cached data', async () => {
    const deps: Pick<KeywordSyncDeps, 'readCachedKeywords'> = {
      readCachedKeywords: async () => [],
    };

    const keywords = await getTopKeywordsForUrl(SITE_ID, 'https://example.com/no-data', deps);
    assert.deepStrictEqual(keywords, []);
  });

  it('returns empty array when siteId is empty', async () => {
    const deps: Pick<KeywordSyncDeps, 'readCachedKeywords'> = {
      readCachedKeywords: async () => { throw new Error('should not be called'); },
    };

    const keywords = await getTopKeywordsForUrl('', 'https://example.com/p', deps);
    assert.deepStrictEqual(keywords, []);
  });

  it('returns empty array when url is empty', async () => {
    const deps: Pick<KeywordSyncDeps, 'readCachedKeywords'> = {
      readCachedKeywords: async () => { throw new Error('should not be called'); },
    };

    const keywords = await getTopKeywordsForUrl(SITE_ID, '', deps);
    assert.deepStrictEqual(keywords, []);
  });

  it('returns empty array when readCachedKeywords throws', async () => {
    const deps: Pick<KeywordSyncDeps, 'readCachedKeywords'> = {
      readCachedKeywords: async () => { throw new Error('DB error'); },
    };

    const keywords = await getTopKeywordsForUrl(SITE_ID, 'https://example.com/p', deps);
    assert.deepStrictEqual(keywords, []);
  });

  it('returns GscKeywordRow[] shape (no site_id, url, captured_at)', async () => {
    const deps: Pick<KeywordSyncDeps, 'readCachedKeywords'> = {
      readCachedKeywords: async () => [
        { site_id: SITE_ID, url: 'https://example.com/p', query: 'test', clicks: 10, impressions: 100, ctr: 0.1, position: 2.0, captured_at: '2026-01-01' },
      ],
    };

    const keywords = await getTopKeywordsForUrl(SITE_ID, 'https://example.com/p', deps);
    assert.equal(keywords.length, 1);
    assert.deepStrictEqual(Object.keys(keywords[0]).sort(), ['clicks', 'ctr', 'impressions', 'position', 'query']);
  });
});

// ── Integration-style test ───────────────────────────────────────────────────

describe('sync then read', () => {
  it('synced keywords can be read back via getTopKeywordsForUrl', async () => {
    const deps = makeDeps();
    await syncKeywordsForSite(SITE_ID, SITE_URL, CREDS, deps);

    const keywords = await getTopKeywordsForUrl(
      SITE_ID,
      'https://example.com/products/widget',
      deps,
    );

    assert.ok(keywords.length > 0, 'should have cached keywords');
    assert.equal(keywords[0].query, 'pool floats'); // highest clicks
    assert.equal(keywords[0].clicks, 50);
  });
});
