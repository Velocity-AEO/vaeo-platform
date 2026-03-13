/**
 * tools/sandbox/sandbox_health_aggregator.test.ts
 *
 * Tests for sandbox health aggregator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePassRate,
  detectHealthTrend,
  getMostProblematicUrl,
  calculateSiteHealth,
  calculatePlatformHealth,
  type SandboxRunResult,
} from './sandbox_health_aggregator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(overrides?: Partial<SandboxRunResult>): SandboxRunResult {
  return {
    site_id: 'site-1',
    url: 'https://example.com/page',
    passed: true,
    run_date: new Date().toISOString(),
    ...overrides,
  };
}

// ── calculatePassRate ────────────────────────────────────────────────────────

describe('calculatePassRate', () => {
  it('returns correct percentage', () => {
    assert.equal(calculatePassRate(8, 10), 80);
  });

  it('returns 0 for zero total', () => {
    assert.equal(calculatePassRate(0, 0), 0);
  });

  it('returns 100 for perfect pass rate', () => {
    assert.equal(calculatePassRate(5, 5), 100);
  });

  it('rounds to 1 decimal', () => {
    assert.equal(calculatePassRate(1, 3), 33.3);
  });

  it('never throws on negative', () => {
    assert.doesNotThrow(() => calculatePassRate(-1, -1));
  });
});

// ── detectHealthTrend ────────────────────────────────────────────────────────

describe('detectHealthTrend', () => {
  it('returns improving when recent > older + 5', () => {
    assert.equal(detectHealthTrend(90, 80), 'improving');
  });

  it('returns degrading when recent < older - 5', () => {
    assert.equal(detectHealthTrend(70, 80), 'degrading');
  });

  it('returns stable within 5 points', () => {
    assert.equal(detectHealthTrend(82, 80), 'stable');
  });

  it('returns stable for exactly 5 point diff', () => {
    assert.equal(detectHealthTrend(85, 80), 'stable');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => detectHealthTrend(NaN, NaN));
  });
});

// ── getMostProblematicUrl ────────────────────────────────────────────────────

describe('getMostProblematicUrl', () => {
  it('returns url with most failures', () => {
    const results = [
      { url: 'https://a.com', passed: false },
      { url: 'https://a.com', passed: false },
      { url: 'https://b.com', passed: false },
      { url: 'https://c.com', passed: true },
    ];
    assert.equal(getMostProblematicUrl(results), 'https://a.com');
  });

  it('returns null when no failures', () => {
    const results = [
      { url: 'https://a.com', passed: true },
      { url: 'https://b.com', passed: true },
    ];
    assert.equal(getMostProblematicUrl(results), null);
  });

  it('returns null for empty array', () => {
    assert.equal(getMostProblematicUrl([]), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getMostProblematicUrl(null as any));
  });
});

// ── calculateSiteHealth ──────────────────────────────────────────────────────

describe('calculateSiteHealth', () => {
  it('calculates pass_rate', async () => {
    const results = [
      makeResult({ passed: true }),
      makeResult({ passed: true }),
      makeResult({ passed: false, failure_reason: 'delta_verify_failed' }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.pass_rate, 66.7);
    assert.equal(m.passed_runs, 2);
    assert.equal(m.failed_runs, 1);
  });

  it('calculates trend', async () => {
    const older = [
      makeResult({ passed: false, run_date: '2026-01-01T00:00:00Z' }),
      makeResult({ passed: false, run_date: '2026-01-02T00:00:00Z' }),
    ];
    const recent = [
      makeResult({ passed: true, run_date: '2026-01-03T00:00:00Z' }),
      makeResult({ passed: true, run_date: '2026-01-04T00:00:00Z' }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => [...older, ...recent],
    });
    assert.equal(m.trend, 'improving');
  });

  it('finds top failure reasons', async () => {
    const results = [
      makeResult({ passed: false, failure_reason: 'delta_verify_failed' }),
      makeResult({ passed: false, failure_reason: 'delta_verify_failed' }),
      makeResult({ passed: false, failure_reason: 'viewport_qa_failed' }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.top_failure_reasons[0].reason, 'delta_verify_failed');
    assert.equal(m.top_failure_reasons[0].count, 2);
  });

  it('top failure reasons sorted by count desc', async () => {
    const results = [
      makeResult({ passed: false, failure_reason: 'a' }),
      makeResult({ passed: false, failure_reason: 'b' }),
      makeResult({ passed: false, failure_reason: 'b' }),
      makeResult({ passed: false, failure_reason: 'b' }),
      makeResult({ passed: false, failure_reason: 'a' }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.top_failure_reasons[0].reason, 'b');
    assert.equal(m.top_failure_reasons[0].count, 3);
    assert.equal(m.top_failure_reasons[1].reason, 'a');
  });

  it('percentage calculated per reason', async () => {
    const results = [
      makeResult({ passed: false, failure_reason: 'a' }),
      makeResult({ passed: false, failure_reason: 'b' }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.top_failure_reasons[0].percentage, 50);
  });

  it('finds most problematic url', async () => {
    const results = [
      makeResult({ url: 'https://a.com/bad', passed: false }),
      makeResult({ url: 'https://a.com/bad', passed: false }),
      makeResult({ url: 'https://a.com/good', passed: true }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.most_problematic_url, 'https://a.com/bad');
  });

  it('calculates lighthouse averages', async () => {
    const results = [
      makeResult({ mobile_lighthouse: 80, desktop_lighthouse: 90, lighthouse_delta: 5 }),
      makeResult({ mobile_lighthouse: 70, desktop_lighthouse: 85, lighthouse_delta: -3 }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.avg_mobile_lighthouse, 75);
    assert.equal(m.avg_desktop_lighthouse, 87.5);
    assert.equal(m.avg_lighthouse_delta, 1);
  });

  it('counts special failure types', async () => {
    const results = [
      makeResult({ passed: false, timed_out: true }),
      makeResult({ passed: false, partial_capture: true }),
      makeResult({ passed: false, viewport_failed: true }),
      makeResult({ passed: false, delta_verify_failed: true }),
      makeResult({ passed: false, regression_detected: true }),
    ];
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => results,
    });
    assert.equal(m.timed_out_captures, 1);
    assert.equal(m.partial_captures, 1);
    assert.equal(m.viewport_failures, 1);
    assert.equal(m.delta_verify_failures, 1);
    assert.equal(m.regression_detections, 1);
  });

  it('returns empty on error', async () => {
    const m = await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => { throw new Error('db down'); },
    });
    assert.equal(m.total_runs, 0);
    assert.equal(m.site_id, 'site-1');
  });

  it('returns empty for empty site_id', async () => {
    const m = await calculateSiteHealth('', 7);
    assert.equal(m.total_runs, 0);
  });

  it('returns empty with default deps', async () => {
    const m = await calculateSiteHealth('site-1', 7);
    assert.equal(m.total_runs, 0);
  });

  it('all deps injectable', async () => {
    let called = false;
    await calculateSiteHealth('site-1', 7, {
      loadResultsFn: async () => { called = true; return []; },
    });
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => calculateSiteHealth(null as any, null as any, null as any));
  });
});

// ── calculatePlatformHealth ──────────────────────────────────────────────────

describe('calculatePlatformHealth', () => {
  it('aggregates correctly', async () => {
    const results = [
      makeResult({ site_id: 's1', passed: true, mobile_lighthouse: 85 }),
      makeResult({ site_id: 's1', passed: true, mobile_lighthouse: 90 }),
      makeResult({ site_id: 's2', passed: false, mobile_lighthouse: 60, failure_reason: 'viewport_qa_failed' }),
      makeResult({ site_id: 's2', passed: true, mobile_lighthouse: 75 }),
    ];
    const h = await calculatePlatformHealth(7, {
      loadAllResultsFn: async () => results,
    });
    assert.equal(h.total_sites, 2);
    assert.equal(h.total_runs, 4);
    assert.equal(h.overall_pass_rate, 75);
    assert.ok(h.avg_mobile_lighthouse != null);
    assert.equal(h.sites_below_70_mobile, 1); // s2 avg = 67.5
    assert.equal(h.healthiest_site, 's1');
    assert.equal(h.most_problematic_site, 's2');
  });

  it('finds top failure reasons', async () => {
    const results = [
      makeResult({ passed: false, failure_reason: 'a' }),
      makeResult({ passed: false, failure_reason: 'a' }),
      makeResult({ passed: false, failure_reason: 'b' }),
    ];
    const h = await calculatePlatformHealth(7, {
      loadAllResultsFn: async () => results,
    });
    assert.equal(h.top_failure_reasons[0].reason, 'a');
    assert.equal(h.top_failure_reasons[0].count, 2);
  });

  it('returns empty on error', async () => {
    const h = await calculatePlatformHealth(7, {
      loadAllResultsFn: async () => { throw new Error('db down'); },
    });
    assert.equal(h.total_runs, 0);
  });

  it('returns empty with default deps', async () => {
    const h = await calculatePlatformHealth(7);
    assert.equal(h.total_runs, 0);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => calculatePlatformHealth(null as any, null as any));
  });
});
