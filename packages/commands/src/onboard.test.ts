/**
 * packages/commands/src/onboard.test.ts
 *
 * Unit tests for the onboard command.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runOnboard,
  type OnboardOps,
  type OnboardResult,
} from './onboard.js';
import type { FieldSnapshotRow, TracerScanResult } from './tracer-scan.js';
import type { HealthScore } from '../../../tools/scoring/health_score.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFieldSnapshot(overrides: Partial<FieldSnapshotRow> = {}): FieldSnapshotRow {
  return {
    run_id:        'run-001',
    site_id:       'site-001',
    url:           'https://example.myshopify.com/products/widget',
    field_type:    'title',
    current_value: 'A Valid Product Title For Testing',
    char_count:    34,
    issue_flag:    false,
    issue_type:    null,
    ...overrides,
  };
}

/** Build a minimal set of OK field snapshots for a single URL. */
function makeCleanSnapshots(url: string, runId: string, siteId: string): FieldSnapshotRow[] {
  return [
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'title', current_value: 'A Valid Product Title For Testing', char_count: 34 }),
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'meta_description', current_value: 'x'.repeat(130), char_count: 130 }),
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'h1', current_value: 'Product Widget', char_count: 14 }),
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'canonical', current_value: url, char_count: url.length }),
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'schema', current_value: '{"@type":"Product"}', char_count: 19 }),
  ];
}

/** Build field snapshots with issues. */
function makeIssueSnapshots(url: string, runId: string, siteId: string): FieldSnapshotRow[] {
  return [
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'title', current_value: null, char_count: 0 }),     // title_missing (critical)
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'meta_description', current_value: null, char_count: 0 }),  // meta_missing (major)
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'h1', current_value: null, char_count: 0 }),        // h1_missing (critical)
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'canonical', current_value: null, char_count: 0 }), // canonical_missing (critical)
    makeFieldSnapshot({ run_id: runId, site_id: siteId, url, field_type: 'schema', current_value: null, char_count: 0 }),    // schema_missing (major)
  ];
}

let storedHealthScore: { siteId: string; score: HealthScore } | null = null;
let insertedSite: Record<string, unknown> | null = null;
let storedCred: { siteId: string; key: string; val: string } | null = null;

function makeOps(overrides: Partial<OnboardOps> = {}): Partial<OnboardOps> {
  storedHealthScore = null;
  insertedSite = null;
  storedCred = null;

  const tracerResult: TracerScanResult = {
    run_id:            'tracer-run-001',
    site_id:           'site-001',
    site:              'example.myshopify.com',
    urls_inventoried:  5,
    snapshots_written: 25,
    protected_skipped: 0,
    status:            'completed',
  };

  return {
    verifyShopify: async () => ({ ok: true, shop_name: 'Example Store' }),
    findSiteByDomain: async () => null,
    insertSite: async (record) => { insertedSite = record; },
    storeCredential: async (siteId, _tenantId, key, val) => { storedCred = { siteId, key, val }; },
    loadFieldSnapshots: async () => makeCleanSnapshots(
      'https://example.myshopify.com/products/widget',
      'tracer-run-001',
      'site-001',
    ),
    updateHealthScore: async (siteId, score) => { storedHealthScore = { siteId, score }; },
    generateId: () => 'site-001',
    tracerOps: {
      lookupSiteByDomain: async () => ({ site_id: 'site-001', tenant_id: '00000000-0000-0000-0000-000000000001', cms_type: 'shopify' }),
      loadCrawlResults: async () => [{
        id: 'cr-1', run_id: 'run-1', tenant_id: '00000000-0000-0000-0000-000000000001',
        site_id: 'site-001', url: 'https://example.myshopify.com/products/widget',
        status_code: 200, title: 'A Valid Product Title For Testing', meta_desc: 'x'.repeat(130),
        h1: ['Product Widget'], h2: ['Details'], images: [], internal_links: [],
        schema_blocks: ['{"@type":"Product"}'], canonical: 'https://example.myshopify.com/products/widget',
        redirect_chain: null, load_time_ms: 100, crawled_at: new Date().toISOString(),
      }],
      upsertUrlInventory: async (rows) => rows.length,
      writeFieldSnapshots: async (rows) => rows.length,
      generateId: () => 'tracer-run-001',
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runOnboard', () => {

  // ── Validation ─────────────────────────────────────────────────────────

  it('fails when --site is missing', async () => {
    const result = await runOnboard({ site: '', token: 'shpat_test' }, makeOps());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('--site'));
  });

  it('fails when --token is missing', async () => {
    const result = await runOnboard({ site: 'example.myshopify.com', token: '' }, makeOps());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('--token'));
  });

  // ── Shopify verification ───────────────────────────────────────────────

  it('fails when Shopify verification fails', async () => {
    const ops = makeOps({
      verifyShopify: async () => ({ ok: false, error: 'Invalid token' }),
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'bad' }, ops);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Invalid token'));
  });

  it('fails when Shopify verification throws', async () => {
    const ops = makeOps({
      verifyShopify: async () => { throw new Error('Network error'); },
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'x' }, ops);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Network error'));
  });

  // ── Site registration ──────────────────────────────────────────────────

  it('creates a new site record when not found', async () => {
    const ops = makeOps({ findSiteByDomain: async () => null });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    assert.equal(result.status, 'completed');
    assert.ok(insertedSite !== null, 'insertSite was called');
  });

  it('reuses existing site when found', async () => {
    const ops = makeOps({
      findSiteByDomain: async () => ({ site_id: 'existing-site', tenant_id: '00000000-0000-0000-0000-000000000001' }),
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    assert.equal(result.status, 'completed');
    assert.equal(insertedSite, null, 'insertSite was NOT called');
    assert.equal(result.site_id, 'existing-site');
  });

  // ── Credential storage ─────────────────────────────────────────────────

  it('stores the access token in site_credentials', async () => {
    await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test123' }, makeOps());
    assert.ok(storedCred !== null, 'storeCredential was called');
    assert.equal(storedCred!.key, 'shopify_access_token');
    assert.equal(storedCred!.val, 'shpat_test123');
  });

  // ── Tracer scan ────────────────────────────────────────────────────────

  it('fails when tracer scan fails', async () => {
    const ops = makeOps({
      tracerOps: {
        lookupSiteByDomain: async () => null, // will cause tracer scan to fail
        loadCrawlResults: async () => [],
        upsertUrlInventory: async () => 0,
        writeFieldSnapshots: async () => 0,
        generateId: () => 'run-fail',
      },
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Tracer scan failed'));
  });

  // ── Issue classification ───────────────────────────────────────────────

  it('classifies issues from field snapshots', async () => {
    const ops = makeOps({
      loadFieldSnapshots: async () => makeIssueSnapshots(
        'https://example.myshopify.com/products/widget',
        'tracer-run-001',
        'site-001',
      ),
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    assert.equal(result.status, 'completed');
    assert.ok(result.issues.length > 0, 'should find issues');

    const types = result.issues.map((i) => i.issue_type);
    assert.ok(types.includes('title_missing'), 'detects title_missing');
    assert.ok(types.includes('h1_missing'), 'detects h1_missing');
    assert.ok(types.includes('canonical_missing'), 'detects canonical_missing');
    assert.ok(types.includes('meta_missing'), 'detects meta_missing');
    assert.ok(types.includes('schema_missing'), 'detects schema_missing');
  });

  it('returns zero issues for clean snapshots', async () => {
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, makeOps());
    assert.equal(result.status, 'completed');
    assert.equal(result.issues.length, 0);
  });

  // ── Health score ───────────────────────────────────────────────────────

  it('calculates health score for clean site as A grade', async () => {
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, makeOps());
    assert.equal(result.status, 'completed');
    assert.ok(result.health_score !== null);
    assert.equal(result.health_score!.score, 100);
    assert.equal(result.health_score!.grade, 'A');
  });

  it('calculates health score with issues', async () => {
    const ops = makeOps({
      loadFieldSnapshots: async () => makeIssueSnapshots(
        'https://example.myshopify.com/products/widget',
        'tracer-run-001',
        'site-001',
      ),
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    assert.equal(result.status, 'completed');
    assert.ok(result.health_score !== null);
    assert.ok(result.health_score!.score < 100, 'score should be below 100');
    assert.ok(result.health_score!.total_issues > 0);
  });

  it('persists health score via updateHealthScore', async () => {
    await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, makeOps());
    assert.ok(storedHealthScore !== null, 'updateHealthScore was called');
    assert.equal(storedHealthScore!.siteId, 'site-001');
    assert.equal(storedHealthScore!.score.score, 100);
  });

  it('does not fail if updateHealthScore throws (non-fatal)', async () => {
    const ops = makeOps({
      updateHealthScore: async () => { throw new Error('DB down'); },
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    assert.equal(result.status, 'completed'); // still succeeds
    assert.ok(result.health_score !== null);
  });

  // ── Full result shape ──────────────────────────────────────────────────

  it('returns complete result on success', async () => {
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, makeOps());
    assert.equal(result.status, 'completed');
    assert.equal(result.site, 'example.myshopify.com');
    assert.equal(result.shop_name, 'Example Store');
    assert.ok(result.site_id.length > 0);
    assert.ok(typeof result.url_count === 'number');
    assert.ok(Array.isArray(result.issues));
    assert.ok(result.health_score !== null);
    assert.ok(result.tracer !== null);
  });

  // ── Domain normalisation ───────────────────────────────────────────────

  it('normalises domain with https:// prefix', async () => {
    const result = await runOnboard({ site: 'https://example.myshopify.com/', token: 'shpat_test' }, makeOps());
    assert.equal(result.status, 'completed');
    assert.equal(result.site, 'example.myshopify.com');
  });

  it('normalises domain with HTTP prefix', async () => {
    const result = await runOnboard({ site: 'HTTP://Example.myshopify.com', token: 'shpat_test' }, makeOps());
    assert.equal(result.status, 'completed');
    assert.equal(result.site, 'example.myshopify.com');
  });

  // ── Issues by severity in health score ─────────────────────────────────

  it('breaks down issues by severity correctly', async () => {
    const ops = makeOps({
      loadFieldSnapshots: async () => makeIssueSnapshots(
        'https://example.myshopify.com/products/widget',
        'tracer-run-001',
        'site-001',
      ),
    });
    const result = await runOnboard({ site: 'example.myshopify.com', token: 'shpat_test' }, ops);
    const hs = result.health_score!;
    // title_missing (critical), h1_missing (critical), canonical_missing (critical)
    // meta_missing (major), schema_missing (major)
    assert.equal(hs.issues_by_severity.critical, 3);
    assert.equal(hs.issues_by_severity.major, 2);
    assert.equal(hs.issues_by_severity.minor, 0);
  });
});
