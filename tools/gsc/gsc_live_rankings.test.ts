/**
 * tools/gsc/gsc_live_rankings.test.ts
 *
 * Tests for live rankings data pipeline.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLiveRankings,
  type LiveRankingsConfig,
  type GSCPropertyRecord,
} from './gsc_live_rankings.js';
import type { GSCSearchAnalyticsResponse } from './gsc_search_analytics.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function config(overrides?: Partial<LiveRankingsConfig>): LiveRankingsConfig {
  return {
    site_id:   'site_1',
    domain:    'example.com',
    days_back: 28,
    row_limit: 100,
    ...overrides,
  };
}

function verifiedProperty(): GSCPropertyRecord {
  return { site_id: 'site_1', account_id: 'acct_1', verified: true };
}

function unverifiedProperty(): GSCPropertyRecord {
  return { site_id: 'site_1', account_id: 'acct_1', verified: false };
}

function mockAnalyticsResponse(): GSCSearchAnalyticsResponse {
  return {
    rows: [
      { keys: ['seo tools', 'https://example.com/tools'], clicks: 50, impressions: 1000, ctr: 0.05, position: 4.2 },
      { keys: ['best seo', 'https://example.com/best'], clicks: 30, impressions: 800, ctr: 0.0375, position: 7.1 },
    ],
    property_url: 'https://example.com/',
    fetched_at: new Date().toISOString(),
    row_count: 2,
  };
}

// ── fetchLiveRankings — not verified ─────────────────────────────────────────

describe('fetchLiveRankings — not verified', () => {
  it('returns error=not_verified when property not found', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => null,
    });
    assert.equal(result.error, 'not_verified');
    assert.equal(result.rankings.length, 0);
  });

  it('returns error=not_verified when not verified', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => unverifiedProperty(),
    });
    assert.equal(result.error, 'not_verified');
  });

  it('sets site_id and domain on error result', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => null,
    });
    assert.equal(result.site_id, 'site_1');
    assert.equal(result.domain, 'example.com');
  });
});

// ── fetchLiveRankings — no token ─────────────────────────────────────────────

describe('fetchLiveRankings — no token', () => {
  it('returns error=no_token when token unavailable', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => null,
    });
    assert.equal(result.error, 'no_token');
  });

  it('sets account_id even when no token', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => null,
    });
    assert.equal(result.account_id, 'acct_1');
  });
});

// ── fetchLiveRankings — happy path ───────────────────────────────────────────

describe('fetchLiveRankings — happy path', () => {
  it('calls fetchAnalyticsFn with request and token', async () => {
    let calledToken = '';
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok_abc',
      fetchAnalyticsFn: async (_req, tok) => {
        calledToken = tok;
        return mockAnalyticsResponse();
      },
    });
    assert.equal(calledToken, 'tok_abc');
    assert.equal(result.rankings.length, 2);
  });

  it('returns gsc_live data_source on all rankings', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok_abc',
      fetchAnalyticsFn: async () => mockAnalyticsResponse(),
    });
    for (const r of result.rankings) {
      assert.equal(r.data_source, 'gsc_live');
    }
  });

  it('sets account_id from property', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok_abc',
      fetchAnalyticsFn: async () => mockAnalyticsResponse(),
    });
    assert.equal(result.account_id, 'acct_1');
  });

  it('sets fetched_at timestamp', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok_abc',
      fetchAnalyticsFn: async () => mockAnalyticsResponse(),
    });
    assert.ok(result.fetched_at.includes('T'));
  });

  it('maps keyword and url from analytics', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok_abc',
      fetchAnalyticsFn: async () => mockAnalyticsResponse(),
    });
    assert.equal(result.rankings[0].keyword, 'seo tools');
    assert.equal(result.rankings[0].url, 'https://example.com/tools');
  });

  it('has no error on success', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok_abc',
      fetchAnalyticsFn: async () => mockAnalyticsResponse(),
    });
    assert.equal(result.error, undefined);
  });

  it('prepends https:// to domain', async () => {
    let calledReq: any = null;
    await fetchLiveRankings(config({ domain: 'example.com' }), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok',
      fetchAnalyticsFn: async (req) => {
        calledReq = req;
        return mockAnalyticsResponse();
      },
    });
    assert.ok(calledReq.property_url.startsWith('https://'));
  });
});

// ── fetchLiveRankings — error handling ───────────────────────────────────────

describe('fetchLiveRankings — error handling', () => {
  it('returns empty rankings when fetchAnalyticsFn throws', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => verifiedProperty(),
      getTokenFn: async () => 'tok',
      fetchAnalyticsFn: async () => { throw new Error('analytics fail'); },
    });
    assert.equal(result.rankings.length, 0);
    assert.equal(result.error, 'fetch_error');
  });

  it('returns empty rankings when loadPropertyFn throws', async () => {
    const result = await fetchLiveRankings(config(), {
      loadPropertyFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result.rankings.length, 0);
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() => fetchLiveRankings(null as any));
  });

  it('never throws on null deps', async () => {
    await assert.doesNotReject(() => fetchLiveRankings(config()));
  });

  it('returns empty rankings with default deps', async () => {
    const result = await fetchLiveRankings(config());
    assert.equal(result.rankings.length, 0);
    assert.equal(result.error, 'not_verified');
  });
});
