import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeGraphHealth,
  calculateBuildAgeHours,
  isSiteStale,
  getPlatformGraphStatus,
  STALE_THRESHOLD_HOURS,
} from './admin_graph_status.js';

// ── gradeGraphHealth ────────────────────────────────────────────────────────

describe('gradeGraphHealth', () => {
  it('returns A when issue rate <= 2%', () => {
    assert.equal(gradeGraphHealth({ orphaned_count: 1, dead_end_count: 0, canonical_conflict_count: 0, link_limit_violation_count: 0, redirect_chain_count: 0, page_count: 100 }), 'A');
  });

  it('returns B when issue rate <= 5%', () => {
    assert.equal(gradeGraphHealth({ orphaned_count: 3, dead_end_count: 1, canonical_conflict_count: 1, link_limit_violation_count: 0, redirect_chain_count: 0, page_count: 100 }), 'B');
  });

  it('returns C when issue rate <= 10%', () => {
    assert.equal(gradeGraphHealth({ orphaned_count: 5, dead_end_count: 3, canonical_conflict_count: 2, link_limit_violation_count: 0, redirect_chain_count: 0, page_count: 100 }), 'C');
  });

  it('returns D when issue rate <= 20%', () => {
    assert.equal(gradeGraphHealth({ orphaned_count: 10, dead_end_count: 5, canonical_conflict_count: 3, link_limit_violation_count: 2, redirect_chain_count: 0, page_count: 100 }), 'D');
  });

  it('returns F when issue rate > 20%', () => {
    assert.equal(gradeGraphHealth({ orphaned_count: 15, dead_end_count: 10, canonical_conflict_count: 5, link_limit_violation_count: 2, redirect_chain_count: 0, page_count: 100 }), 'F');
  });

  it('returns F for zero pages', () => {
    assert.equal(gradeGraphHealth({ orphaned_count: 0, dead_end_count: 0, canonical_conflict_count: 0, link_limit_violation_count: 0, redirect_chain_count: 0, page_count: 0 }), 'F');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => gradeGraphHealth(null as any));
  });
});

// ── calculateBuildAgeHours ──────────────────────────────────────────────────

describe('calculateBuildAgeHours', () => {
  it('returns hours since build', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = calculateBuildAgeHours(twoHoursAgo);
    assert.ok(result !== null && result >= 1 && result <= 3);
  });

  it('returns null for null input', () => {
    assert.equal(calculateBuildAgeHours(null), null);
  });

  it('returns null for invalid date', () => {
    assert.equal(calculateBuildAgeHours('not-a-date'), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateBuildAgeHours(null as any));
  });
});

// ── isSiteStale ─────────────────────────────────────────────────────────────

describe('isSiteStale', () => {
  it('returns true for null age', () => {
    assert.equal(isSiteStale(null), true);
  });

  it('returns false within threshold', () => {
    assert.equal(isSiteStale(12), false);
  });

  it('returns true above threshold', () => {
    assert.equal(isSiteStale(STALE_THRESHOLD_HOURS + 1), true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isSiteStale(null as any));
  });
});

// ── STALE_THRESHOLD_HOURS ───────────────────────────────────────────────────

describe('STALE_THRESHOLD_HOURS', () => {
  it('equals 24', () => {
    assert.equal(STALE_THRESHOLD_HOURS, 24);
  });
});

// ── getPlatformGraphStatus ──────────────────────────────────────────────────

describe('getPlatformGraphStatus', () => {
  it('returns empty for no sites', async () => {
    const result = await getPlatformGraphStatus({
      loadAllSitesFn: async () => [],
    });
    assert.equal(result.total_sites, 0);
  });

  it('aggregates page counts', async () => {
    const result = await getPlatformGraphStatus({
      loadAllSitesFn: async () => [
        { site_id: 's1', domain: 'a.com' },
        { site_id: 's2', domain: 'b.com' },
      ],
      loadGraphStatusFn: async (sid) => ({
        page_count: sid === 's1' ? 100 : 50,
        internal_link_count: 500,
        external_link_count: 20,
        orphaned_count: 2,
        dead_end_count: 1,
        redirect_chain_count: 0,
        canonical_conflict_count: 1,
        link_limit_violation_count: 0,
        equity_leak_count: 0,
        last_built_at: new Date().toISOString(),
        build_age_hours: 1,
      }),
    });
    assert.equal(result.total_pages, 150);
    assert.equal(result.total_sites, 2);
  });

  it('identifies stale sites', async () => {
    const result = await getPlatformGraphStatus({
      loadAllSitesFn: async () => [{ site_id: 's1', domain: 'a.com' }],
      loadGraphStatusFn: async () => ({
        page_count: 50,
        internal_link_count: 200,
        external_link_count: 10,
        orphaned_count: 0,
        dead_end_count: 0,
        redirect_chain_count: 0,
        canonical_conflict_count: 0,
        link_limit_violation_count: 0,
        equity_leak_count: 0,
        last_built_at: null,
        build_age_hours: null,
      }),
    });
    assert.ok(result.stale_sites.length > 0);
  });

  it('identifies worst sites', async () => {
    const result = await getPlatformGraphStatus({
      loadAllSitesFn: async () => [{ site_id: 's1', domain: 'bad.com' }],
      loadGraphStatusFn: async () => ({
        page_count: 10,
        internal_link_count: 50,
        external_link_count: 5,
        orphaned_count: 5,
        dead_end_count: 5,
        redirect_chain_count: 3,
        canonical_conflict_count: 3,
        link_limit_violation_count: 2,
        equity_leak_count: 4,
        last_built_at: new Date().toISOString(),
        build_age_hours: 1,
      }),
    });
    assert.ok(result.worst_sites.length > 0);
  });

  it('all deps injectable', async () => {
    let calledLoad = false;
    await getPlatformGraphStatus({
      loadAllSitesFn: async () => { calledLoad = true; return []; },
    });
    assert.equal(calledLoad, true);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => getPlatformGraphStatus(null as any));
  });
});
