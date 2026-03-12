/**
 * tools/apps/app_replacement_library.test.ts
 *
 * Tests for app replacement library — logging, querying, and summarizing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  logAppReplacement,
  getAppReplacements,
  getReplacementSummary,
  type AppReplacement,
  type AppReplacementDeps,
} from './app_replacement_library.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                  'r-001',
    site_id:             'site-001',
    tenant_id:           'tenant-001',
    app_name:            'SEO Manager',
    app_category:        'seo',
    removed_at:          '2026-01-15T00:00:00Z',
    replacement:         'VAEO Title/Meta Engine',
    replacement_type:    'vaeo_native',
    health_score_before: 55,
    health_score_after:  72,
    lcp_before:          3200,
    lcp_after:           2100,
    notes:               null,
    created_at:          '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeDeps(rows: Record<string, unknown>[] = []): AppReplacementDeps {
  return {
    insert: async (_table, row) => ({ id: (row.app_name as string) + '-id' }),
    query: async () => rows,
  };
}

const BASE_ENTRY = {
  site_id:          'site-001',
  tenant_id:        'tenant-001',
  app_name:         'SEO Manager',
  app_category:     'seo' as const,
  removed_at:       '2026-01-15T00:00:00Z',
  replacement:      'VAEO Title/Meta Engine',
  replacement_type: 'vaeo_native' as const,
};

// ── logAppReplacement ────────────────────────────────────────────────────────

describe('logAppReplacement', () => {
  it('returns ok=true with id on success', async () => {
    const result = await logAppReplacement(BASE_ENTRY, makeDeps());
    assert.equal(result.ok, true);
    assert.ok(result.id);
  });

  it('returns ok=false when insert returns null', async () => {
    const deps: AppReplacementDeps = {
      insert: async () => null,
      query: async () => [],
    };
    const result = await logAppReplacement(BASE_ENTRY, deps);
    assert.equal(result.ok, false);
  });

  it('returns ok=false when insert throws', async () => {
    const deps: AppReplacementDeps = {
      insert: async () => { throw new Error('db down'); },
      query: async () => [],
    };
    const result = await logAppReplacement(BASE_ENTRY, deps);
    assert.equal(result.ok, false);
  });

  it('handles optional fields', async () => {
    const entry = { ...BASE_ENTRY, health_score_before: 50, notes: 'test' };
    const result = await logAppReplacement(entry, makeDeps());
    assert.equal(result.ok, true);
  });
});

// ── getAppReplacements ───────────────────────────────────────────────────────

describe('getAppReplacements', () => {
  it('returns empty array for no rows', async () => {
    const result = await getAppReplacements('site-001', makeDeps([]));
    assert.deepStrictEqual(result, []);
  });

  it('maps rows to AppReplacement objects', async () => {
    const result = await getAppReplacements('site-001', makeDeps([makeRow()]));
    assert.equal(result.length, 1);
    assert.equal(result[0].app_name, 'SEO Manager');
    assert.equal(result[0].app_category, 'seo');
    assert.equal(result[0].replacement_type, 'vaeo_native');
  });

  it('computes health_delta correctly', async () => {
    const result = await getAppReplacements('site-001', makeDeps([makeRow()]));
    assert.equal(result[0].health_delta, 17); // 72 - 55
  });

  it('computes lcp_delta correctly (positive = improvement)', async () => {
    const result = await getAppReplacements('site-001', makeDeps([makeRow()]));
    assert.equal(result[0].lcp_delta, 1100); // 3200 - 2100
  });

  it('health_delta is undefined when before is null', async () => {
    const result = await getAppReplacements('site-001', makeDeps([
      makeRow({ health_score_before: null }),
    ]));
    assert.equal(result[0].health_delta, undefined);
  });

  it('lcp_delta is undefined when after is null', async () => {
    const result = await getAppReplacements('site-001', makeDeps([
      makeRow({ lcp_after: null }),
    ]));
    assert.equal(result[0].lcp_delta, undefined);
  });

  it('sorts by removed_at descending', async () => {
    const rows = [
      makeRow({ id: 'r-old', removed_at: '2025-06-01T00:00:00Z' }),
      makeRow({ id: 'r-new', removed_at: '2026-03-01T00:00:00Z' }),
    ];
    const result = await getAppReplacements('site-001', makeDeps(rows));
    assert.equal(result[0].id, 'r-new');
    assert.equal(result[1].id, 'r-old');
  });

  it('returns empty on query error', async () => {
    const deps: AppReplacementDeps = {
      insert: async () => null,
      query: async () => { throw new Error('fail'); },
    };
    const result = await getAppReplacements('site-001', deps);
    assert.deepStrictEqual(result, []);
  });

  it('handles replacement as undefined when empty', async () => {
    const result = await getAppReplacements('site-001', makeDeps([
      makeRow({ replacement: '' }),
    ]));
    assert.equal(result[0].replacement, undefined);
  });
});

// ── getReplacementSummary ────────────────────────────────────────────────────

describe('getReplacementSummary', () => {
  it('returns zeros for empty site', async () => {
    const summary = await getReplacementSummary('site-001', makeDeps([]));
    assert.equal(summary.total_apps_removed, 0);
    assert.equal(summary.avg_health_delta, 0);
    assert.equal(summary.avg_lcp_improvement_ms, 0);
  });

  it('counts total apps removed', async () => {
    const rows = [makeRow(), makeRow({ id: 'r-002', app_name: 'Smart SEO' })];
    const summary = await getReplacementSummary('site-001', makeDeps(rows));
    assert.equal(summary.total_apps_removed, 2);
  });

  it('computes avg_health_delta', async () => {
    const rows = [
      makeRow({ health_score_before: 50, health_score_after: 70 }), // delta = 20
      makeRow({ id: 'r-002', health_score_before: 60, health_score_after: 80 }), // delta = 20
    ];
    const summary = await getReplacementSummary('site-001', makeDeps(rows));
    assert.equal(summary.avg_health_delta, 20);
  });

  it('computes avg_lcp_improvement_ms', async () => {
    const rows = [
      makeRow({ lcp_before: 3000, lcp_after: 2000 }), // delta = 1000
      makeRow({ id: 'r-002', lcp_before: 4000, lcp_after: 2000 }), // delta = 2000
    ];
    const summary = await getReplacementSummary('site-001', makeDeps(rows));
    assert.equal(summary.avg_lcp_improvement_ms, 1500);
  });

  it('counts replaced_by_vaeo and deemed_unnecessary', async () => {
    const rows = [
      makeRow({ replacement_type: 'vaeo_native' }),
      makeRow({ id: 'r-002', replacement_type: 'unnecessary' }),
      makeRow({ id: 'r-003', replacement_type: 'vaeo_native' }),
    ];
    const summary = await getReplacementSummary('site-001', makeDeps(rows));
    assert.equal(summary.replaced_by_vaeo, 2);
    assert.equal(summary.deemed_unnecessary, 1);
  });

  it('populates categories', async () => {
    const rows = [
      makeRow({ app_category: 'seo' }),
      makeRow({ id: 'r-002', app_category: 'seo' }),
      makeRow({ id: 'r-003', app_category: 'redirects' }),
    ];
    const summary = await getReplacementSummary('site-001', makeDeps(rows));
    assert.equal(summary.categories.seo, 2);
    assert.equal(summary.categories.redirects, 1);
    assert.equal(summary.categories.analytics, 0);
  });

  it('returns zeros on error', async () => {
    const deps: AppReplacementDeps = {
      insert: async () => null,
      query: async () => { throw new Error('fail'); },
    };
    const summary = await getReplacementSummary('site-001', deps);
    assert.equal(summary.total_apps_removed, 0);
  });

  it('has correct site_id', async () => {
    const summary = await getReplacementSummary('site-xyz', makeDeps([]));
    assert.equal(summary.site_id, 'site-xyz');
  });
});
