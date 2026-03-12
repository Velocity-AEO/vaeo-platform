/**
 * tools/email/digest_aggregator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantDigest, type DigestPeriod } from './digest_aggregator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = 't1';
const PERIOD: DigestPeriod = {
  from: '2026-03-04T00:00:00Z',
  to:   '2026-03-11T23:59:59Z',
  days: 7,
};

type Row = Record<string, unknown>;

interface MockTables {
  sites?:               Row[];
  action_queue?:        Row[];
  site_health_scores?:  Row[];
  gsc_metrics_delta?:   Row[];
  [key: string]: Row[] | undefined;
}

function makeDb(tables: MockTables, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const err  = errors[table] ? { message: errors[table] } : null;

      let filtered = [...rows];

      const q: Record<string, unknown> = {
        select()    { return q; },
        eq(col: string, val: unknown) {
          filtered = filtered.filter((r) => r[col] === val);
          return q;
        },
        neq(col: string, val: unknown) {
          filtered = filtered.filter((r) => r[col] !== val);
          return q;
        },
        gte(col: string, val: unknown) {
          filtered = filtered.filter((r) => String(r[col]) >= String(val));
          return q;
        },
        lte(col: string, val: unknown) {
          filtered = filtered.filter((r) => String(r[col]) <= String(val));
          return q;
        },
        in(col: string, vals: unknown[]) {
          filtered = filtered.filter((r) => (vals as unknown[]).includes(r[col]));
          return q;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          const asc = opts?.ascending ?? true;
          filtered.sort((a, b) =>
            asc
              ? String(a[col]).localeCompare(String(b[col]))
              : String(b[col]).localeCompare(String(a[col])),
          );
          return q;
        },
        limit(n: number) {
          filtered = filtered.slice(0, n);
          return q;
        },
        then(resolve: (v: { data: Row[] | null; error: unknown }) => void) {
          resolve({ data: err ? null : filtered, error: err });
        },
      };
      return q;
    },
  };
}

function makeSites(count = 2): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    site_id:    `site-${i + 1}`,
    domain:     `site${i + 1}.com`,
    site_url:   `https://site${i + 1}.com`,
    tenant_id:  TENANT,
  }));
}

function makeDeployedAction(siteId: string, issueType = 'title_missing', appliedAt = '2026-03-10T10:00:00Z'): Row {
  return {
    site_id:          siteId,
    issue_type:       issueType,
    url:              `https://${siteId}.com/page`,
    execution_status: 'deployed',
    updated_at:       appliedAt,
    tenant_id:        TENANT,
  };
}

function makeHealthScore(siteId: string, score: number, recordedAt: string): Row {
  return { site_id: siteId, score, recorded_at: recordedAt, tenant_id: TENANT };
}

// ── Return shape ──────────────────────────────────────────────────────────────

describe('buildTenantDigest — shape', () => {
  it('returns TenantDigestData with required fields', async () => {
    const db = makeDb({ sites: makeSites(1), action_queue: [], site_health_scores: [] });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.tenant_id, TENANT);
    assert.deepStrictEqual(r.period, PERIOD);
    assert.ok(Array.isArray(r.sites));
    assert.ok(typeof r.total_fixes_applied === 'number');
    assert.ok(typeof r.total_sites === 'number');
    assert.ok(typeof r.sites_improved === 'number');
    assert.ok(typeof r.sites_regressed === 'number');
    assert.ok(typeof r.generated_at === 'string');
  });

  it('generated_at is ISO 8601', async () => {
    const db = makeDb({ sites: makeSites(1), action_queue: [] });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.ok(!isNaN(Date.parse(r.generated_at)));
  });
});

// ── Sites ─────────────────────────────────────────────────────────────────────

describe('buildTenantDigest — sites', () => {
  it('total_sites matches sites count', async () => {
    const db = makeDb({ sites: makeSites(3), action_queue: [] });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.total_sites, 3);
    assert.equal(r.sites.length, 3);
  });

  it('site domain is populated from domain field', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'mystore.com', tenant_id: TENANT }],
      action_queue: [],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.domain, 'mystore.com');
  });

  it('falls back to site_url when domain absent', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', site_url: 'https://mystore.com', tenant_id: TENANT }],
      action_queue: [],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.domain, 'https://mystore.com');
  });
});

// ── Fixes ─────────────────────────────────────────────────────────────────────

describe('buildTenantDigest — fixes_applied', () => {
  it('counts deployed actions in period', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      action_queue: [
        makeDeployedAction('s1', 'title_missing', '2026-03-08T10:00:00Z'),
        makeDeployedAction('s1', 'meta_missing',  '2026-03-09T10:00:00Z'),
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.fixes_applied, 2);
    assert.equal(r.total_fixes_applied, 2);
  });

  it('total_fixes_applied sums across all sites', async () => {
    const db = makeDb({
      sites: makeSites(2),
      action_queue: [
        makeDeployedAction('site-1', 'title_missing', '2026-03-08T10:00:00Z'),
        makeDeployedAction('site-1', 'meta_missing',  '2026-03-09T10:00:00Z'),
        makeDeployedAction('site-2', 'title_missing', '2026-03-10T10:00:00Z'),
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.total_fixes_applied, 3);
  });

  it('top_fixes limited to 3 per site', async () => {
    const actions = Array.from({ length: 5 }, (_, i) =>
      makeDeployedAction('s1', 'title_missing', `2026-03-0${i + 1}T10:00:00Z`),
    );
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      action_queue: actions,
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.ok((r.sites[0]?.top_fixes.length ?? 0) <= 3);
  });

  it('top_fixes ordered most-recent first', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      action_queue: [
        makeDeployedAction('s1', 'a', '2026-03-06T10:00:00Z'),
        makeDeployedAction('s1', 'b', '2026-03-10T10:00:00Z'),
        makeDeployedAction('s1', 'c', '2026-03-08T10:00:00Z'),
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    const fixes = r.sites[0]?.top_fixes ?? [];
    assert.ok(fixes.length >= 2);
    // most recent first
    assert.ok(fixes[0]!.applied_at >= fixes[1]!.applied_at);
  });
});

// ── AEO / Timestamp subcounts ────────────────────────────────────────────────

describe('buildTenantDigest — subtype counts', () => {
  it('aeo_items_added counts AEO issue types', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      action_queue: [
        makeDeployedAction('s1', 'SPEAKABLE_MISSING'),
        makeDeployedAction('s1', 'FAQ_OPPORTUNITY'),
        makeDeployedAction('s1', 'title_missing'),
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.aeo_items_added, 2);
  });

  it('timestamp_fixes_applied counts TIMESTAMP issue types', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      action_queue: [
        makeDeployedAction('s1', 'TIMESTAMP_MISSING'),
        makeDeployedAction('s1', 'DATE_MODIFIED_STALE'),
        makeDeployedAction('s1', 'title_missing'),
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.timestamp_fixes_applied, 2);
  });
});

// ── Health scores ─────────────────────────────────────────────────────────────

describe('buildTenantDigest — health scores', () => {
  it('computes health_score_delta = current - previous', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      action_queue: [],
      site_health_scores: [
        makeHealthScore('s1', 80, '2026-03-11T08:00:00Z'),
        makeHealthScore('s1', 65, '2026-03-03T08:00:00Z'), // before period
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.health_score_current, 80);
    assert.equal(r.sites[0]?.health_score_previous, 65);
    assert.equal(r.sites[0]?.health_score_delta, 15);
  });

  it('sites_improved counts positive health_score_delta', async () => {
    const db = makeDb({
      sites: makeSites(2),
      action_queue: [],
      site_health_scores: [
        makeHealthScore('site-1', 80, '2026-03-11T08:00:00Z'),
        makeHealthScore('site-1', 60, '2026-03-01T08:00:00Z'),
        makeHealthScore('site-2', 50, '2026-03-11T08:00:00Z'),
        makeHealthScore('site-2', 70, '2026-03-01T08:00:00Z'),
      ],
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites_improved, 1);
    assert.equal(r.sites_regressed, 1);
  });
});

// ── Non-fatal / error handling ────────────────────────────────────────────────

describe('buildTenantDigest — error handling', () => {
  it('returns empty digest when sites table errors', async () => {
    const db = makeDb({ sites: [] }, { sites: 'DB offline' });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.total_sites, 0);
    assert.equal(r.sites.length, 0);
  });

  it('returns empty digest when no sites found', async () => {
    const db = makeDb({ sites: [] });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.total_sites, 0);
  });

  it('never throws even when db throws', async () => {
    const badDb = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => buildTenantDigest(TENANT, PERIOD, badDb));
  });

  it('handles missing action_queue data gracefully', async () => {
    const db = makeDb({
      sites: [{ site_id: 's1', domain: 'a.com', tenant_id: TENANT }],
      // action_queue not provided → defaults to []
    });
    const r = await buildTenantDigest(TENANT, PERIOD, db);
    assert.equal(r.sites[0]?.fixes_applied, 0);
  });
});
