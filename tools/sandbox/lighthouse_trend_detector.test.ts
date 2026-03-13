import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeeklyAverageChange,
  projectFutureScore,
  detectTrendType,
  shouldAlert,
  analyzeLighthouseTrends,
  analyzeSiteTrends,
  GRADUAL_DEGRADATION_THRESHOLD,
  SUDDEN_DEGRADATION_THRESHOLD,
  type LighthouseTrend,
} from './lighthouse_trend_detector.js';
import type { LighthouseHistoryEntry } from './lighthouse_history_store.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeScores(values: number[], startDaysAgo = 28): Array<{ score: number; measured_at: string }> {
  return values.map((score, i) => ({
    score,
    measured_at: new Date(Date.now() - (startDaysAgo - i * 7) * 86_400_000).toISOString(),
  }));
}

function makeHistoryEntry(metric: string, score: number, daysAgo: number): LighthouseHistoryEntry {
  return {
    id: `e_${daysAgo}`,
    site_id: 'site_1',
    url: 'https://example.com/',
    fix_id: null,
    form_factor: 'mobile',
    performance: metric === 'performance' ? score : null,
    seo: metric === 'seo' ? score : null,
    accessibility: metric === 'accessibility' ? score : null,
    best_practices: metric === 'best_practices' ? score : null,
    measured_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    trigger: 'scheduled',
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('GRADUAL_DEGRADATION_THRESHOLD equals 2', () => {
    assert.equal(GRADUAL_DEGRADATION_THRESHOLD, 2);
  });

  it('SUDDEN_DEGRADATION_THRESHOLD equals 10', () => {
    assert.equal(SUDDEN_DEGRADATION_THRESHOLD, 10);
  });
});

// ── calculateWeeklyAverageChange ─────────────────────────────────────────────

describe('calculateWeeklyAverageChange', () => {
  it('returns null for fewer than 3 points', () => {
    assert.equal(calculateWeeklyAverageChange([]), null);
    assert.equal(calculateWeeklyAverageChange(makeScores([80, 78])), null);
  });

  it('calculates negative slope for declining scores', () => {
    // 90, 85, 80, 75 — declining ~5 points per week
    const slope = calculateWeeklyAverageChange(makeScores([90, 85, 80, 75]));
    assert.ok(slope !== null);
    assert.ok(slope! < 0, `Expected negative slope, got ${slope}`);
  });

  it('calculates positive slope for improving scores', () => {
    const slope = calculateWeeklyAverageChange(makeScores([70, 75, 80, 85]));
    assert.ok(slope !== null);
    assert.ok(slope! > 0, `Expected positive slope, got ${slope}`);
  });

  it('returns ~0 for stable scores', () => {
    const slope = calculateWeeklyAverageChange(makeScores([80, 80, 80, 80]));
    assert.ok(slope !== null);
    assert.ok(Math.abs(slope!) < 0.5, `Expected ~0, got ${slope}`);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateWeeklyAverageChange(null as any));
  });
});

// ── projectFutureScore ───────────────────────────────────────────────────────

describe('projectFutureScore', () => {
  it('calculates correctly', () => {
    assert.equal(projectFutureScore(80, -2, 4), 72);
  });

  it('caps at 100', () => {
    assert.equal(projectFutureScore(90, 5, 10), 100);
  });

  it('floors at 0', () => {
    assert.equal(projectFutureScore(10, -5, 10), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => projectFutureScore(null as any, null as any, null as any));
  });
});

// ── detectTrendType ──────────────────────────────────────────────────────────

describe('detectTrendType', () => {
  it('returns insufficient_data for < 3 points', () => {
    assert.equal(detectTrendType(null, null, 2), 'insufficient_data');
  });

  it('returns degrading_sudden for large 7d drop', () => {
    assert.equal(detectTrendType(-1, -15, 5), 'degrading_sudden');
  });

  it('returns degrading_gradual for consistent small drops', () => {
    assert.equal(detectTrendType(-3, -3, 5), 'degrading_gradual');
  });

  it('returns improving for consistent gains', () => {
    assert.equal(detectTrendType(3, 3, 5), 'improving');
  });

  it('returns stable within threshold', () => {
    assert.equal(detectTrendType(0.5, 1, 5), 'stable');
  });

  it('returns volatile for high std dev', () => {
    assert.equal(detectTrendType(0, 0, 5, [90, 60, 95, 55, 88]), 'volatile');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectTrendType(null as any, null as any, null as any));
  });
});

// ── shouldAlert ──────────────────────────────────────────────────────────────

describe('shouldAlert', () => {
  it('returns alert for sudden drop', () => {
    const result = shouldAlert('degrading_sudden', 50);
    assert.equal(result.alert, true);
    assert.ok(result.reason?.includes('Sudden'));
  });

  it('returns alert for gradual when projected < 70', () => {
    const result = shouldAlert('degrading_gradual', 65);
    assert.equal(result.alert, true);
    assert.ok(result.reason?.includes('Gradual'));
  });

  it('returns no alert for gradual when projected >= 70', () => {
    const result = shouldAlert('degrading_gradual', 75);
    assert.equal(result.alert, false);
  });

  it('returns no alert for stable', () => {
    const result = shouldAlert('stable', 85);
    assert.equal(result.alert, false);
  });

  it('returns no alert for improving', () => {
    const result = shouldAlert('improving', 95);
    assert.equal(result.alert, false);
  });

  it('includes reason in alert', () => {
    const result = shouldAlert('degrading_sudden', 40);
    assert.ok(result.reason !== null);
    assert.ok(result.reason!.length > 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => shouldAlert(null as any, null as any));
  });
});

// ── analyzeLighthouseTrends ──────────────────────────────────────────────────

describe('analyzeLighthouseTrends', () => {
  it('returns 4 trends (one per metric)', async () => {
    const entries: LighthouseHistoryEntry[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `e${i}`,
        site_id: 'site_1',
        url: 'https://example.com/',
        fix_id: null,
        form_factor: 'mobile' as const,
        performance: 80 - i,
        seo: 90,
        accessibility: 85,
        best_practices: 88,
        measured_at: new Date(Date.now() - i * 7 * 86_400_000).toISOString(),
        trigger: 'scheduled' as const,
      })),
    ];
    const trends = await analyzeLighthouseTrends('site_1', 'https://example.com/', 'mobile', {
      loadHistoryFn: async () => entries,
    });
    assert.equal(trends.length, 4);
    const metricNames = trends.map(t => t.metric);
    assert.ok(metricNames.includes('performance'));
    assert.ok(metricNames.includes('seo'));
    assert.ok(metricNames.includes('accessibility'));
    assert.ok(metricNames.includes('best_practices'));
  });

  it('returns [] on error', async () => {
    const result = await analyzeLighthouseTrends('site_1', 'url', 'mobile', {
      loadHistoryFn: async () => { throw new Error('fail'); },
    });
    assert.deepEqual(result, []);
  });

  it('all deps injectable', async () => {
    let calledWith = '';
    await analyzeLighthouseTrends('site_x', 'https://x.com', 'desktop', {
      loadHistoryFn: async (sid) => { calledWith = sid; return []; },
    });
    assert.equal(calledWith, 'site_x');
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => analyzeLighthouseTrends(null as any, null as any, null as any));
  });
});

// ── analyzeSiteTrends ────────────────────────────────────────────────────────

describe('analyzeSiteTrends', () => {
  it('counts alerts correctly', async () => {
    const entries: LighthouseHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      site_id: 'site_1',
      url: 'https://example.com/',
      fix_id: null,
      form_factor: 'mobile' as const,
      performance: 80 - i * 5, // rapidly declining
      seo: 90,
      accessibility: 85,
      best_practices: 88,
      measured_at: new Date(Date.now() - i * 7 * 86_400_000).toISOString(),
      trigger: 'scheduled' as const,
    }));

    const result = await analyzeSiteTrends('site_1', 'mobile', {
      loadSiteUrlsFn: async () => ['https://example.com/'],
      loadHistoryFn: async () => entries,
    });
    assert.ok(result.url_trends.length > 0);
    assert.ok(typeof result.total_alerts === 'number');
  });

  it('returns empty on error', async () => {
    const result = await analyzeSiteTrends('site_1', 'mobile', {
      loadSiteUrlsFn: async () => { throw new Error('fail'); },
    });
    assert.deepEqual(result.url_trends, []);
    assert.equal(result.total_alerts, 0);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => analyzeSiteTrends(null as any, null as any));
  });
});
