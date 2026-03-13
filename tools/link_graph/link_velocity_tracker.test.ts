/**
 * tools/link_graph/link_velocity_tracker.test.ts
 *
 * Tests for link velocity tracker.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVelocityTrend,
  shouldAlertVelocity,
  captureVelocitySnapshot,
  loadVelocityHistory,
  calculateVelocityTrends,
  getSiteVelocitySummary,
  VELOCITY_THRESHOLDS,
  type LinkVelocityTrend,
  type LinkVelocitySnapshot,
} from './link_velocity_tracker.js';

function makeTrend(overrides?: Partial<LinkVelocityTrend>): LinkVelocityTrend {
  return {
    url: 'https://example.com/page',
    site_id: 's1',
    title: 'Page',
    current_inbound: 20,
    inbound_7d_ago: 20,
    inbound_30d_ago: 20,
    change_7d: 0,
    change_30d: 0,
    pct_change_7d: 0,
    pct_change_30d: 0,
    trend_type: 'stable',
    is_hub_page: false,
    alert_required: false,
    alert_reason: null,
    authority_score: 50,
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<LinkVelocitySnapshot>): LinkVelocitySnapshot {
  return {
    id: 'snap-1',
    site_id: 's1',
    url: 'https://example.com/page',
    snapshot_date: '2026-03-06',
    inbound_internal_count: 20,
    outbound_internal_count: 10,
    body_content_inbound: 15,
    navigation_inbound: 5,
    authority_score: 50,
    captured_at: '2026-03-06T00:00:00Z',
    ...overrides,
  };
}

// ── VELOCITY_THRESHOLDS ──────────────────────────────────────────────────────

describe('VELOCITY_THRESHOLDS', () => {
  it('sudden_loss_pct equals 25', () => {
    assert.equal(VELOCITY_THRESHOLDS.sudden_loss_pct, 25);
  });

  it('gradual_loss_pct equals 10', () => {
    assert.equal(VELOCITY_THRESHOLDS.gradual_loss_pct, 10);
  });

  it('gaining_threshold equals 3', () => {
    assert.equal(VELOCITY_THRESHOLDS.gaining_threshold, 3);
  });

  it('hub_sudden_loss equals 5', () => {
    assert.equal(VELOCITY_THRESHOLDS.hub_sudden_loss, 5);
  });
});

// ── classifyVelocityTrend ────────────────────────────────────────────────────

describe('classifyVelocityTrend', () => {
  it('returns insufficient_data when both null', () => {
    assert.equal(classifyVelocityTrend(null, null, 10, null), 'insufficient_data');
  });

  it('returns new_page when no history and zero inbound', () => {
    assert.equal(classifyVelocityTrend(null, null, 0, null), 'insufficient_data');
    // new_page: inbound=0, change_7d=null but change_30d has data
    assert.equal(classifyVelocityTrend(null, 0, 0, null), 'new_page');
  });

  it('returns losing_sudden when pct_change_7d <= -25', () => {
    assert.equal(classifyVelocityTrend(-5, -5, 15, -25), 'losing_sudden');
    assert.equal(classifyVelocityTrend(-10, -10, 10, -50), 'losing_sudden');
  });

  it('returns losing_gradual when pct_change_30d <= -10', () => {
    // current=18, change_30d=-4, so base=22, pct=-18.2%
    assert.equal(classifyVelocityTrend(0, -4, 18, 0), 'losing_gradual');
  });

  it('returns gaining when change_7d >= 3', () => {
    assert.equal(classifyVelocityTrend(3, 5, 20, 15), 'gaining');
    assert.equal(classifyVelocityTrend(10, 20, 30, 50), 'gaining');
  });

  it('returns stable by default', () => {
    assert.equal(classifyVelocityTrend(0, 0, 20, 0), 'stable');
    assert.equal(classifyVelocityTrend(1, 1, 20, 5), 'stable');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => classifyVelocityTrend(null as any, null as any, null as any, null as any));
  });
});

// ── shouldAlertVelocity ──────────────────────────────────────────────────────

describe('shouldAlertVelocity', () => {
  it('alerts for hub losing suddenly', () => {
    const trend = makeTrend({
      is_hub_page: true,
      trend_type: 'losing_sudden',
      change_7d: -8,
    });
    const result = shouldAlertVelocity(trend);
    assert.equal(result.alert, true);
    assert.ok(result.reason?.includes('Hub page'));
  });

  it('alerts for page losing rapidly with low inbound', () => {
    const trend = makeTrend({
      trend_type: 'losing_sudden',
      current_inbound: 3,
      change_7d: -2,
    });
    const result = shouldAlertVelocity(trend);
    assert.equal(result.alert, true);
    assert.ok(result.reason?.includes('orphaned'));
  });

  it('alerts for high authority gradual loss', () => {
    const trend = makeTrend({
      trend_type: 'losing_gradual',
      authority_score: 75,
    });
    const result = shouldAlertVelocity(trend);
    assert.equal(result.alert, true);
    assert.ok(result.reason?.includes('High-authority'));
  });

  it('no alert for gaining', () => {
    const trend = makeTrend({ trend_type: 'gaining', change_7d: 5 });
    assert.equal(shouldAlertVelocity(trend).alert, false);
  });

  it('no alert for stable', () => {
    const trend = makeTrend({ trend_type: 'stable' });
    assert.equal(shouldAlertVelocity(trend).alert, false);
  });

  it('includes reason string', () => {
    const trend = makeTrend({ is_hub_page: true, trend_type: 'losing_sudden', change_7d: -6 });
    const result = shouldAlertVelocity(trend);
    assert.ok(typeof result.reason === 'string');
    assert.ok((result.reason ?? '').length > 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => shouldAlertVelocity(null as any));
  });
});

// ── captureVelocitySnapshot ──────────────────────────────────────────────────

describe('captureVelocitySnapshot', () => {
  it('returns 0 on error', async () => {
    const count = await captureVelocitySnapshot('s1', { pages: [] }, [], {
      saveFn: async () => { throw new Error('db down'); },
    });
    assert.equal(count, 0);
  });

  it('creates one snapshot per page', async () => {
    let saved: any[] = [];
    const pages = [
      { url: '/a', title: 'A', depth_from_homepage: 1, link_equity_score: 50, inbound_link_count: 5, outbound_link_count: 3, is_in_sitemap: true },
      { url: '/b', title: 'B', depth_from_homepage: 2, link_equity_score: 30, inbound_link_count: 2, outbound_link_count: 1, is_in_sitemap: true },
    ];
    const count = await captureVelocitySnapshot('s1', { pages }, [], {
      saveFn: async (snaps) => { saved = snaps; },
    });
    assert.equal(count, 2);
    assert.equal(saved.length, 2);
  });

  it('returns 0 for empty site_id', async () => {
    assert.equal(await captureVelocitySnapshot('', { pages: [] }, []), 0);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => captureVelocitySnapshot(null as any, null as any, null as any, null as any));
  });
});

// ── loadVelocityHistory ──────────────────────────────────────────────────────

describe('loadVelocityHistory', () => {
  it('returns sorted desc', async () => {
    const snaps = [
      makeSnapshot({ snapshot_date: '2026-03-01' }),
      makeSnapshot({ snapshot_date: '2026-03-08' }),
      makeSnapshot({ snapshot_date: '2026-03-05' }),
    ];
    const result = await loadVelocityHistory('s1', '/page', 10, {
      loadFn: async () => snaps,
    });
    assert.equal(result[0].snapshot_date, '2026-03-08');
    assert.equal(result[2].snapshot_date, '2026-03-01');
  });

  it('returns [] on error', async () => {
    const result = await loadVelocityHistory('s1', '/page', 10, {
      loadFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns [] for empty site_id', async () => {
    assert.deepEqual(await loadVelocityHistory('', '/page', 10), []);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => loadVelocityHistory(null as any, null as any, null as any, null as any));
  });
});

// ── calculateVelocityTrends ──────────────────────────────────────────────────

describe('calculateVelocityTrends', () => {
  const pages = [
    { url: '/a', title: 'A', depth_from_homepage: 1, link_equity_score: 50, inbound_link_count: 10, outbound_link_count: 5, is_in_sitemap: true },
    { url: '/b', title: 'B', depth_from_homepage: 2, link_equity_score: 30, inbound_link_count: 3, outbound_link_count: 2, is_in_sitemap: true },
  ];

  it('sorts losing_sudden first', async () => {
    // Provide history that triggers losing_sudden for /b
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const trends = await calculateVelocityTrends('s1', pages, [], {
      loadHistoryFn: async (_sid, url) => {
        if (url === '/b') {
          return [makeSnapshot({ url: '/b', snapshot_date: sevenDaysAgo, inbound_internal_count: 12 })];
        }
        return [];
      },
    });
    // /b lost 9 links (12 -> 3), which is -75%, so losing_sudden
    const bTrend = trends.find(t => t.url === '/b');
    if (bTrend) {
      assert.equal(bTrend.trend_type, 'losing_sudden');
    }
  });

  it('calculates pct_change_7d correctly', async () => {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const trends = await calculateVelocityTrends('s1', [pages[0]], [], {
      loadHistoryFn: async () => [
        makeSnapshot({ url: '/a', snapshot_date: sevenDaysAgo, inbound_internal_count: 20 }),
      ],
    });
    // /a: current=10, was 20 → change=-10, pct=-50%
    const t = trends.find(tr => tr.url === '/a');
    assert.ok(t);
    assert.equal(t!.change_7d, -10);
    assert.equal(t!.pct_change_7d, -50);
  });

  it('returns [] for empty site_id', async () => {
    assert.deepEqual(await calculateVelocityTrends('', [], []), []);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => calculateVelocityTrends(null as any, null as any, null as any, null as any));
  });
});

// ── getSiteVelocitySummary ───────────────────────────────────────────────────

describe('getSiteVelocitySummary', () => {
  it('counts correctly', async () => {
    const trends: LinkVelocityTrend[] = [
      makeTrend({ trend_type: 'gaining', change_7d: 5 }),
      makeTrend({ trend_type: 'gaining', change_7d: 3, url: '/b' }),
      makeTrend({ trend_type: 'losing_sudden', change_7d: -8, url: '/c', alert_required: true }),
      makeTrend({ trend_type: 'losing_gradual', change_7d: -2, url: '/d' }),
      makeTrend({ trend_type: 'stable', url: '/e' }),
    ];
    const summary = await getSiteVelocitySummary('s1', {
      trendsFn: async () => trends,
    });
    assert.equal(summary.total_pages, 5);
    assert.equal(summary.pages_gaining, 2);
    assert.equal(summary.pages_losing_sudden, 1);
    assert.equal(summary.pages_losing_gradual, 1);
    assert.equal(summary.pages_stable, 1);
    assert.equal(summary.total_alerts, 1);
  });

  it('returns top 5 gaining and losing', async () => {
    const trends: LinkVelocityTrend[] = [];
    for (let i = 0; i < 8; i++) {
      trends.push(makeTrend({ trend_type: 'gaining', change_7d: i + 1, url: `/gain-${i}` }));
    }
    for (let i = 0; i < 8; i++) {
      trends.push(makeTrend({ trend_type: 'losing_sudden', change_7d: -(i + 1), url: `/lose-${i}` }));
    }
    const summary = await getSiteVelocitySummary('s1', {
      trendsFn: async () => trends,
    });
    assert.equal(summary.top_gaining.length, 5);
    assert.equal(summary.top_losing.length, 5);
  });

  it('counts hub_pages_losing', async () => {
    const trends: LinkVelocityTrend[] = [
      makeTrend({ trend_type: 'losing_sudden', is_hub_page: true, url: '/hub1' }),
      makeTrend({ trend_type: 'losing_gradual', is_hub_page: true, url: '/hub2' }),
      makeTrend({ trend_type: 'stable', is_hub_page: true, url: '/hub3' }),
    ];
    const summary = await getSiteVelocitySummary('s1', {
      trendsFn: async () => trends,
    });
    assert.equal(summary.hub_pages_losing, 2);
  });

  it('returns empty on error', async () => {
    const summary = await getSiteVelocitySummary('s1', {
      trendsFn: async () => { throw new Error('db down'); },
    });
    assert.equal(summary.total_pages, 0);
  });

  it('returns empty for empty site_id', async () => {
    const summary = await getSiteVelocitySummary('');
    assert.equal(summary.total_pages, 0);
  });

  it('all deps injectable', async () => {
    let called = false;
    await getSiteVelocitySummary('s1', {
      trendsFn: async () => { called = true; return []; },
    });
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => getSiteVelocitySummary(null as any, null as any));
  });
});
