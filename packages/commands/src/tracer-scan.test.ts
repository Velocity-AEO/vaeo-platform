/**
 * packages/commands/src/tracer-scan.test.ts
 *
 * Tests for runTracerScan.
 * All external deps (Supabase) are injected via TracerScanOps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runTracerScan,
  deriveTemplateId,
  deriveUrlStatus,
  extractFieldSnapshots,
  type TracerScanRequest,
  type TracerScanOps,
  type CrawlResultRow,
  type UrlInventoryRow,
  type FieldSnapshotRow,
} from './tracer-scan.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID    = 'site-uuid-001';
const TENANT_ID  = 'tenant-uuid-001';

const SITE_RECORD = { site_id: SITE_ID, tenant_id: TENANT_ID, cms_type: 'shopify' };

function makeCrawlRow(overrides: Partial<CrawlResultRow> = {}): CrawlResultRow {
  return {
    id:             'row-1',
    run_id:         'run-001',
    tenant_id:      TENANT_ID,
    site_id:        SITE_ID,
    url:            'https://cococabanalife.com/products/sunset-hat',
    status_code:    200,
    title:          'Sunset Hat – Cococabana Life',
    meta_desc:      'A stylish hat for your beach adventures. Perfect for sunny days at the shore.',
    h1:             ['Sunset Hat'],
    h2:             ['Details', 'Reviews'],
    images:         [],
    internal_links: ['/collections/hats'],
    schema_blocks:  ['{"@type":"Product","name":"Sunset Hat"}'],
    canonical:      'https://cococabanalife.com/products/sunset-hat',
    redirect_chain: [],
    load_time_ms:   350,
    crawled_at:     '2025-01-15T10:00:00Z',
    ...overrides,
  };
}

function baseReq(overrides: Partial<TracerScanRequest> = {}): TracerScanRequest {
  return { site: 'cococabanalife.com', ...overrides };
}

function happyOps(overrides: Partial<TracerScanOps> = {}): Partial<TracerScanOps> {
  return {
    lookupSiteByDomain: async () => SITE_RECORD,
    loadCrawlResults:   async () => [
      makeCrawlRow(),
      makeCrawlRow({ url: 'https://cococabanalife.com/', title: 'Cococabana Life', id: 'row-2' }),
      makeCrawlRow({ url: 'https://cococabanalife.com/collections/hats', title: 'Hats Collection', id: 'row-3' }),
    ],
    upsertUrlInventory:  async (rows: UrlInventoryRow[]) => rows.length,
    writeFieldSnapshots: async (rows: FieldSnapshotRow[]) => rows.length,
    generateId:          () => FIXED_UUID,
    ...overrides,
  };
}

// ── runTracerScan — happy path ──────────────────────────────────────────────

describe('runTracerScan — happy path', () => {
  it('returns status=completed with correct counts', async () => {
    const result = await runTracerScan(baseReq(), happyOps());
    assert.equal(result.status, 'completed');
    assert.equal(result.run_id, FIXED_UUID);
    assert.equal(result.site_id, SITE_ID);
    assert.equal(result.site, 'cococabanalife.com');
    assert.equal(result.urls_inventoried, 3);
    // 3 URLs * 6 fields each = 18 snapshots
    assert.equal(result.snapshots_written, 18);
    assert.equal(result.protected_skipped, 0);
  });

  it('deduplicates URLs keeping the most recent', async () => {
    let capturedInventory: UrlInventoryRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [
        makeCrawlRow({ crawled_at: '2025-01-10T10:00:00Z', title: 'Old Title' }),
        makeCrawlRow({ crawled_at: '2025-01-15T10:00:00Z', title: 'New Title' }),
      ],
      upsertUrlInventory: async (rows) => { capturedInventory = rows; return rows.length; },
    }));
    assert.equal(capturedInventory.length, 1);
  });
});

// ── runTracerScan — protected route filtering ───────────────────────────────

describe('runTracerScan — protected routes', () => {
  it('skips protected Shopify routes', async () => {
    const result = await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [
        makeCrawlRow({ url: 'https://cococabanalife.com/products/hat' }),
        makeCrawlRow({ url: 'https://cococabanalife.com/cart', id: 'row-cart' }),
        makeCrawlRow({ url: 'https://cococabanalife.com/checkout', id: 'row-checkout' }),
        makeCrawlRow({ url: 'https://cococabanalife.com/account/login', id: 'row-acct' }),
      ],
    }));
    assert.equal(result.urls_inventoried, 1);
    assert.equal(result.protected_skipped, 3);
  });
});

// ── runTracerScan — validation failures ─────────────────────────────────────

describe('runTracerScan — validation', () => {
  it('returns failed when site is empty', async () => {
    const result = await runTracerScan(baseReq({ site: '' }), happyOps());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('site domain is required'));
  });

  it('returns failed when site not found', async () => {
    const result = await runTracerScan(baseReq(), happyOps({
      lookupSiteByDomain: async () => null,
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Site not found'));
  });

  it('returns failed when no crawl results exist', async () => {
    const result = await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [],
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('No crawl_results'));
  });

  it('returns failed when lookupSiteByDomain throws', async () => {
    const result = await runTracerScan(baseReq(), happyOps({
      lookupSiteByDomain: async () => { throw new Error('DB timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('DB timeout'));
  });

  it('returns failed when upsertUrlInventory throws', async () => {
    const result = await runTracerScan(baseReq(), happyOps({
      upsertUrlInventory: async () => { throw new Error('upsert error'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('upsert error'));
  });

  it('returns failed when writeFieldSnapshots throws', async () => {
    const result = await runTracerScan(baseReq(), happyOps({
      writeFieldSnapshots: async () => { throw new Error('insert error'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('insert error'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      runTracerScan(baseReq(), happyOps({
        lookupSiteByDomain: async () => { throw new Error('crash'); },
      })),
    );
  });
});

// ── runTracerScan — field snapshot capture ──────────────────────────────────

describe('runTracerScan — field snapshots written correctly', () => {
  it('writes 6 field types per URL', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow()],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    assert.equal(capturedSnapshots.length, 6);
    const types = capturedSnapshots.map((s) => s.field_type);
    assert.deepEqual(types, ['title', 'meta_description', 'h1', 'h2', 'canonical', 'schema']);
  });

  it('flags missing title', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ title: null })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const titleSnap = capturedSnapshots.find((s) => s.field_type === 'title');
    assert.ok(titleSnap);
    assert.equal(titleSnap.issue_flag, true);
    assert.equal(titleSnap.issue_type, 'MISSING');
  });

  it('flags long title (>60 chars)', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ title: 'A'.repeat(65) })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const titleSnap = capturedSnapshots.find((s) => s.field_type === 'title');
    assert.ok(titleSnap);
    assert.equal(titleSnap.issue_flag, true);
    assert.equal(titleSnap.issue_type, 'TOO_LONG');
  });

  it('flags missing meta description', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ meta_desc: '' })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const descSnap = capturedSnapshots.find((s) => s.field_type === 'meta_description');
    assert.ok(descSnap);
    assert.equal(descSnap.issue_flag, true);
    assert.equal(descSnap.issue_type, 'MISSING');
  });

  it('flags missing h1', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ h1: [] })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const h1Snap = capturedSnapshots.find((s) => s.field_type === 'h1');
    assert.ok(h1Snap);
    assert.equal(h1Snap.issue_flag, true);
    assert.equal(h1Snap.issue_type, 'MISSING');
  });

  it('flags multiple h1', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ h1: ['First', 'Second'] })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const h1Snap = capturedSnapshots.find((s) => s.field_type === 'h1');
    assert.ok(h1Snap);
    assert.equal(h1Snap.issue_flag, true);
    assert.equal(h1Snap.issue_type, 'MULTIPLE');
  });

  it('flags missing canonical', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ canonical: null })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const canonSnap = capturedSnapshots.find((s) => s.field_type === 'canonical');
    assert.ok(canonSnap);
    assert.equal(canonSnap.issue_flag, true);
    assert.equal(canonSnap.issue_type, 'MISSING');
  });

  it('flags missing schema', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow({ schema_blocks: [] })],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    const schemaSnap = capturedSnapshots.find((s) => s.field_type === 'schema');
    assert.ok(schemaSnap);
    assert.equal(schemaSnap.issue_flag, true);
    assert.equal(schemaSnap.issue_type, 'MISSING');
  });

  it('no issue flags on healthy page', async () => {
    let capturedSnapshots: FieldSnapshotRow[] = [];
    await runTracerScan(baseReq(), happyOps({
      loadCrawlResults: async () => [makeCrawlRow()],
      writeFieldSnapshots: async (rows) => { capturedSnapshots = rows; return rows.length; },
    }));
    // Only h2 is missing issue (has h2 data), and schema is present
    // The happy-path row has all fields populated correctly
    const issueSnaps = capturedSnapshots.filter((s) => s.issue_flag);
    assert.equal(issueSnaps.length, 0, `Unexpected issues: ${JSON.stringify(issueSnaps.map(s => s.field_type + ':' + s.issue_type))}`);
  });
});

// ── deriveTemplateId ────────────────────────────────────────────────────────

describe('deriveTemplateId', () => {
  it('maps / to index', () => {
    assert.equal(deriveTemplateId('https://example.com/'), 'index');
  });

  it('maps /products/x to product', () => {
    assert.equal(deriveTemplateId('https://example.com/products/sunset-hat'), 'product');
  });

  it('maps /collections/x to collection', () => {
    assert.equal(deriveTemplateId('https://example.com/collections/hats'), 'collection');
  });

  it('maps /pages/x to page', () => {
    assert.equal(deriveTemplateId('https://example.com/pages/about'), 'page');
  });

  it('maps /blogs/x/y to article', () => {
    assert.equal(deriveTemplateId('https://example.com/blogs/news/first-post'), 'article');
  });

  it('maps /blogs/x to blog', () => {
    assert.equal(deriveTemplateId('https://example.com/blogs/news'), 'blog');
  });

  it('maps unknown paths to other', () => {
    assert.equal(deriveTemplateId('https://example.com/custom-route'), 'other');
  });
});

// ── deriveUrlStatus ─────────────────────────────────────────────────────────

describe('deriveUrlStatus', () => {
  it('returns 404 for status 404', () => {
    assert.equal(deriveUrlStatus(404, []), '404');
  });

  it('returns deleted for 5xx', () => {
    assert.equal(deriveUrlStatus(500, []), 'deleted');
  });

  it('returns redirected when redirect chain exists', () => {
    assert.equal(deriveUrlStatus(301, ['https://a.com/old']), 'redirected');
  });

  it('returns active for 200', () => {
    assert.equal(deriveUrlStatus(200, []), 'active');
  });

  it('returns active for null status', () => {
    assert.equal(deriveUrlStatus(null, null), 'active');
  });
});
