/**
 * tools/gsc/gsc_triage_enricher.test.ts
 *
 * Tests for GSC triage enrichment — traffic data mapping, priority map building.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichTriageWithGSC, buildPriorityMap } from './gsc_triage_enricher.js';
import type { GSCClient, GSCRow } from './gsc_client.js';

// ── Mock GSC client ───────────────────────────────────────────────────────────

function mockGSCClient(rows: GSCRow[]): GSCClient {
  return {
    listProperties: async () => [],
    query:          async () => rows,
    getTopPages:    async () => [...rows].sort((a, b) => b.clicks - a.clicks),
    getPageMetrics: async (_s, url) => rows.find((r) => r.keys[0] === url) ?? null,
  };
}

function emptyGSCClient(): GSCClient {
  return mockGSCClient([]);
}

// ── enrichTriageWithGSC ───────────────────────────────────────────────────────

describe('enrichTriageWithGSC', () => {
  it('maps GSC rows to URL traffic data', async () => {
    const client = mockGSCClient([
      { keys: ['https://shop.com/products/a'], clicks: 200, impressions: 5000, ctr: 0.04, position: 3 },
      { keys: ['https://shop.com/products/b'], clicks: 15, impressions: 800, ctr: 0.02, position: 8 },
    ]);
    const result = await enrichTriageWithGSC('site-1', [
      'https://shop.com/products/a',
      'https://shop.com/products/b',
    ], client);
    assert.equal(result.size, 2);
    assert.equal(result.get('https://shop.com/products/a')!.clicks, 200);
    assert.equal(result.get('https://shop.com/products/a')!.traffic_tier, 'high');
    assert.equal(result.get('https://shop.com/products/b')!.traffic_tier, 'medium');
  });

  it('assigns traffic_tier=none for URLs without GSC data', async () => {
    const client = emptyGSCClient();
    const result = await enrichTriageWithGSC('site-1', [
      'https://shop.com/products/no-data',
    ], client);
    assert.equal(result.get('https://shop.com/products/no-data')!.traffic_tier, 'none');
    assert.equal(result.get('https://shop.com/products/no-data')!.clicks, 0);
  });

  it('assigns traffic_tier=low for clicks > 0 but <= 10', async () => {
    const client = mockGSCClient([
      { keys: ['https://shop.com/products/c'], clicks: 5, impressions: 100, ctr: 0.05, position: 15 },
    ]);
    const result = await enrichTriageWithGSC('site-1', [
      'https://shop.com/products/c',
    ], client);
    assert.equal(result.get('https://shop.com/products/c')!.traffic_tier, 'low');
  });

  it('handles empty URL list', async () => {
    const result = await enrichTriageWithGSC('site-1', [], emptyGSCClient());
    assert.equal(result.size, 0);
  });

  it('normalizes trailing slashes when matching', async () => {
    const client = mockGSCClient([
      { keys: ['https://shop.com/products/a'], clicks: 50, impressions: 500, ctr: 0.1, position: 5 },
    ]);
    const result = await enrichTriageWithGSC('site-1', [
      'https://shop.com/products/a/',
    ], client);
    assert.equal(result.get('https://shop.com/products/a/')!.clicks, 50);
  });

  it('returns empty map for invalid URLs', async () => {
    const result = await enrichTriageWithGSC('site-1', ['not-a-url'], emptyGSCClient());
    assert.equal(result.size, 0);
  });
});

// ── buildPriorityMap ──────────────────────────────────────────────────────────

describe('buildPriorityMap', () => {
  it('returns map keyed by url::issue_type', async () => {
    const client = mockGSCClient([
      { keys: ['https://shop.com/products/a'], clicks: 300, impressions: 6000, ctr: 0.05, position: 4 },
    ]);
    const result = await buildPriorityMap('site-1', [
      { url: 'https://shop.com/products/a', issue_type: 'SCHEMA_MISSING' },
    ], client);
    const entry = result.get('https://shop.com/products/a::SCHEMA_MISSING');
    assert.equal(entry?.gsc_clicks, 300);
    assert.equal(entry?.gsc_impressions, 6000);
  });

  it('deduplicates URLs before querying', async () => {
    let queryCount = 0;
    const client: GSCClient = {
      listProperties: async () => [],
      query:          async () => [],
      getTopPages:    async () => { queryCount++; return []; },
      getPageMetrics: async () => null,
    };
    await buildPriorityMap('site-1', [
      { url: 'https://shop.com/a', issue_type: 'SCHEMA_MISSING' },
      { url: 'https://shop.com/a', issue_type: 'META_TITLE_MISSING' },
    ], client);
    assert.equal(queryCount, 1);
  });

  it('returns zero clicks for URLs without GSC data', async () => {
    const result = await buildPriorityMap('site-1', [
      { url: 'https://shop.com/missing', issue_type: 'SCHEMA_MISSING' },
    ], emptyGSCClient());
    const entry = result.get('https://shop.com/missing::SCHEMA_MISSING');
    assert.equal(entry?.gsc_clicks, 0);
  });

  it('handles empty issues list', async () => {
    const result = await buildPriorityMap('site-1', [], emptyGSCClient());
    assert.equal(result.size, 0);
  });
});
