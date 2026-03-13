import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGraphStale,
  buildAttentionReasons,
  buildPlatformLinkHealth,
  getGraphBuildStatus,
  STALE_GRAPH_THRESHOLD_HOURS,
  type SiteGraphData,
} from './platform_link_health.js';

// ── STALE_GRAPH_THRESHOLD_HOURS ─────────────────────────────────────────────

describe('STALE_GRAPH_THRESHOLD_HOURS', () => {
  it('equals 25', () => {
    assert.equal(STALE_GRAPH_THRESHOLD_HOURS, 25);
  });
});

// ── isGraphStale ────────────────────────────────────────────────────────────

describe('isGraphStale', () => {
  it('returns true for null last_built', () => {
    assert.equal(isGraphStale(null, 25), true);
  });

  it('returns true when hours exceed threshold', () => {
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    assert.equal(isGraphStale(old, 25), true);
  });

  it('returns false when fresh', () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    assert.equal(isGraphStale(recent, 25), false);
  });

  it('returns true for invalid date string', () => {
    assert.equal(isGraphStale('not-a-date', 25), true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isGraphStale(null as any, null as any));
  });
});

// ── buildAttentionReasons ───────────────────────────────────────────────────

describe('buildAttentionReasons', () => {
  it('returns orphan reason when > 10', () => {
    const reasons = buildAttentionReasons({ orphaned_count: 15, broken_external_count: 0, velocity_alerts: 0, is_stale: false });
    assert.ok(reasons.some((r) => r.includes('High orphan count (15 pages)')));
  });

  it('returns broken external reason when > 5', () => {
    const reasons = buildAttentionReasons({ orphaned_count: 0, broken_external_count: 8, velocity_alerts: 0, is_stale: false });
    assert.ok(reasons.some((r) => r.includes('8 broken external links')));
  });

  it('returns velocity reason when > 0', () => {
    const reasons = buildAttentionReasons({ orphaned_count: 0, broken_external_count: 0, velocity_alerts: 3, is_stale: false });
    assert.ok(reasons.some((r) => r.includes('3 link velocity alerts')));
  });

  it('returns stale reason when is_stale', () => {
    const reasons = buildAttentionReasons({ orphaned_count: 0, broken_external_count: 0, velocity_alerts: 0, is_stale: true });
    assert.ok(reasons.some((r) => r.includes('25+ hours')));
  });

  it('returns [] when no issues', () => {
    const reasons = buildAttentionReasons({ orphaned_count: 5, broken_external_count: 3, velocity_alerts: 0, is_stale: false });
    assert.equal(reasons.length, 0);
  });

  it('returns multiple reasons', () => {
    const reasons = buildAttentionReasons({ orphaned_count: 20, broken_external_count: 10, velocity_alerts: 2, is_stale: true });
    assert.equal(reasons.length, 4);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildAttentionReasons(null as any));
  });
});

// ── buildPlatformLinkHealth ─────────────────────────────────────────────────

function makeGraphData(overrides?: Partial<SiteGraphData>): SiteGraphData {
  return {
    site_id: 's1',
    domain: 'a.com',
    pages_mapped: 100,
    orphaned_count: 3,
    dead_end_count: 2,
    deep_page_count: 1,
    broken_external_count: 4,
    canonical_conflict_count: 2,
    link_opportunity_count: 5,
    avg_authority_score: 0.5,
    last_built: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildPlatformLinkHealth', () => {
  it('aggregates total pages', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [
        { site_id: 's1', domain: 'a.com' },
        { site_id: 's2', domain: 'b.com' },
      ],
      loadGraphsFn: async (sid) => makeGraphData({ site_id: sid, pages_mapped: sid === 's1' ? 100 : 50 }),
      loadVelocityFn: async () => ({ alert_count: 0 }),
    });
    assert.equal(result.total_pages_mapped, 150);
  });

  it('identifies sites needing attention', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [{ site_id: 's1', domain: 'bad.com' }],
      loadGraphsFn: async () => makeGraphData({ orphaned_count: 20, broken_external_count: 10 }),
      loadVelocityFn: async () => ({ alert_count: 3 }),
    });
    assert.ok(result.sites_needing_attention.length > 0);
    assert.ok(result.sites_needing_attention[0].attention_reasons.length > 0);
  });

  it('sorts sites needing attention by signals desc', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [
        { site_id: 's1', domain: 'a.com' },
        { site_id: 's2', domain: 'b.com' },
      ],
      loadGraphsFn: async (sid) => makeGraphData({
        site_id: sid,
        orphaned_count: sid === 's1' ? 15 : 30,
        broken_external_count: sid === 's1' ? 6 : 10,
      }),
      loadVelocityFn: async () => ({ alert_count: 0 }),
    });
    if (result.sites_needing_attention.length >= 2) {
      assert.equal(result.sites_needing_attention[0].domain, 'b.com');
    }
  });

  it('returns empty on error', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.total_sites, 0);
    assert.equal(result.total_pages_mapped, 0);
  });

  it('counts sites_with_graph correctly', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [
        { site_id: 's1', domain: 'a.com' },
        { site_id: 's2', domain: 'b.com' },
      ],
      loadGraphsFn: async (sid) => sid === 's1'
        ? makeGraphData()
        : makeGraphData({ last_built: null }),
      loadVelocityFn: async () => ({ alert_count: 0 }),
    });
    assert.equal(result.sites_with_graph, 1);
    assert.equal(result.sites_without_graph, 1);
  });

  it('calculates avg_orphaned_per_site', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [
        { site_id: 's1', domain: 'a.com' },
        { site_id: 's2', domain: 'b.com' },
      ],
      loadGraphsFn: async () => makeGraphData({ orphaned_count: 10 }),
      loadVelocityFn: async () => ({ alert_count: 0 }),
    });
    assert.equal(result.avg_orphaned_per_site, 10);
  });

  it('calculates avg_authority_score', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [{ site_id: 's1', domain: 'a.com' }],
      loadGraphsFn: async () => makeGraphData({ avg_authority_score: 0.6 }),
      loadVelocityFn: async () => ({ alert_count: 0 }),
    });
    assert.equal(result.avg_authority_score, 0.6);
  });

  it('returns null avg_authority_score when no scores', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [{ site_id: 's1', domain: 'a.com' }],
      loadGraphsFn: async () => makeGraphData({ avg_authority_score: null }),
      loadVelocityFn: async () => ({ alert_count: 0 }),
    });
    assert.equal(result.avg_authority_score, null);
  });

  it('all deps injectable', async () => {
    let called = false;
    await buildPlatformLinkHealth({
      loadSitesFn: async () => { called = true; return []; },
    });
    assert.equal(called, true);
  });

  it('returns empty for no sites', async () => {
    const result = await buildPlatformLinkHealth({
      loadSitesFn: async () => [],
    });
    assert.equal(result.total_sites, 0);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => buildPlatformLinkHealth(null as any));
  });
});

// ── getGraphBuildStatus ─────────────────────────────────────────────────────

describe('getGraphBuildStatus', () => {
  it('returns stale first', async () => {
    const result = await getGraphBuildStatus({
      loadSitesFn: async () => [
        { site_id: 's1', domain: 'fresh.com' },
        { site_id: 's2', domain: 'stale.com' },
      ],
      loadGraphsFn: async (sid) => sid === 's1'
        ? makeGraphData({ last_built: new Date().toISOString() })
        : makeGraphData({ last_built: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() }),
    });
    assert.ok(result.length >= 2);
    assert.equal(result[0].is_stale, true);
  });

  it('marks never-built as stale', async () => {
    const result = await getGraphBuildStatus({
      loadSitesFn: async () => [{ site_id: 's1', domain: 'new.com' }],
      loadGraphsFn: async () => makeGraphData({ last_built: null }),
    });
    assert.equal(result[0].is_stale, true);
    assert.equal(result[0].last_built, null);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => getGraphBuildStatus(null as any));
  });
});
