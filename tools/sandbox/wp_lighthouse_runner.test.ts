/**
 * tools/sandbox/wp_lighthouse_runner.test.ts
 *
 * Tests for mobile-first WordPress Lighthouse runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_LIGHTHOUSE_CONFIG,
  DESKTOP_LIGHTHOUSE_CONFIG,
  runWPLighthouse,
  runWPLighthouseFull,
  runWPLighthouseDelta,
  type WPLighthouseScore,
  type WPLighthouseFullResult,
} from './wp_lighthouse_runner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeScore(performance: number, form_factor: 'mobile' | 'desktop' = 'mobile'): WPLighthouseScore {
  return {
    url:            'https://shop.com/',
    performance,
    accessibility:  90,
    best_practices: 85,
    seo:            95,
    lcp:            2500,
    fid:            80,
    cls:            0.05,
    form_factor,
    is_primary:     form_factor === 'mobile',
    measured_at:    new Date().toISOString(),
  };
}

function makeFull(mobilePerf: number, desktopPerf: number | null = null): WPLighthouseFullResult {
  const mobile  = makeScore(mobilePerf, 'mobile');
  const desktop = desktopPerf !== null ? makeScore(desktopPerf, 'desktop') : null;
  return {
    url:                'https://shop.com/',
    mobile,
    desktop,
    primary_score:      mobile,
    mobile_desktop_gap: desktop !== null ? desktop.performance - mobile.performance : null,
    measured_at:        new Date().toISOString(),
  };
}

// ── MOBILE_LIGHTHOUSE_CONFIG ──────────────────────────────────────────────────

describe('MOBILE_LIGHTHOUSE_CONFIG', () => {
  it('has correct formFactor', () => {
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.formFactor, 'mobile');
  });

  it('has correct mobile screen dimensions', () => {
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.screenEmulation.width, 375);
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.screenEmulation.height, 812);
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.screenEmulation.deviceScaleFactor, 3);
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.screenEmulation.mobile, true);
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.screenEmulation.disabled, false);
  });

  it('has correct mobile throttling (slow 4G)', () => {
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.throttling.rttMs, 150);
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.throttling.throughputKbps, 1638.4);
    assert.equal(MOBILE_LIGHTHOUSE_CONFIG.throttling.cpuSlowdownMultiplier, 4);
  });

  it('includes all 4 categories', () => {
    assert.ok(MOBILE_LIGHTHOUSE_CONFIG.categories.includes('performance'));
    assert.ok(MOBILE_LIGHTHOUSE_CONFIG.categories.includes('seo'));
    assert.ok(MOBILE_LIGHTHOUSE_CONFIG.categories.includes('accessibility'));
    assert.ok(MOBILE_LIGHTHOUSE_CONFIG.categories.includes('best-practices'));
  });
});

// ── DESKTOP_LIGHTHOUSE_CONFIG ─────────────────────────────────────────────────

describe('DESKTOP_LIGHTHOUSE_CONFIG', () => {
  it('has correct formFactor', () => {
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.formFactor, 'desktop');
  });

  it('has correct desktop screen dimensions', () => {
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.screenEmulation.width, 1350);
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.screenEmulation.height, 940);
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.screenEmulation.deviceScaleFactor, 1);
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.screenEmulation.mobile, false);
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.screenEmulation.disabled, false);
  });

  it('has correct desktop throttling (fast cable)', () => {
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.throttling.rttMs, 40);
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.throttling.throughputKbps, 10240);
    assert.equal(DESKTOP_LIGHTHOUSE_CONFIG.throttling.cpuSlowdownMultiplier, 1);
  });
});

// ── runWPLighthouse — default mobile ─────────────────────────────────────────

describe('runWPLighthouse — mobile default', () => {
  it('uses mobile config by default (form_factor=mobile)', async () => {
    let receivedFormFactor = '';
    const score = await runWPLighthouse('https://shop.com/', undefined, {
      lighthouseFn: async (url, ff) => { receivedFormFactor = ff; return makeScore(85, ff); },
    });
    assert.equal(receivedFormFactor, 'mobile');
  });

  it('sets form_factor=mobile on returned score', async () => {
    const score = await runWPLighthouse('https://shop.com/', undefined, {
      lighthouseFn: async (url, ff) => makeScore(88, ff),
    });
    assert.equal(score.form_factor, 'mobile');
  });

  it('sets is_primary=true for mobile score', async () => {
    const score = await runWPLighthouse('https://shop.com/', undefined, {
      lighthouseFn: async (url, ff) => makeScore(85, ff),
    });
    assert.equal(score.is_primary, true);
  });

  it('returns performance from injected lighthouseFn', async () => {
    const score = await runWPLighthouse('https://shop.com/', undefined, {
      lighthouseFn: async () => makeScore(92),
    });
    assert.equal(score.performance, 92);
  });
});

describe('runWPLighthouse — desktop override', () => {
  it('uses desktop when form_factor=desktop', async () => {
    let receivedFormFactor = '';
    await runWPLighthouse('https://shop.com/', { form_factor: 'desktop' }, {
      lighthouseFn: async (url, ff) => { receivedFormFactor = ff; return makeScore(95, ff); },
    });
    assert.equal(receivedFormFactor, 'desktop');
  });

  it('sets is_primary=false for desktop score', async () => {
    const score = await runWPLighthouse('https://shop.com/', { form_factor: 'desktop' }, {
      lighthouseFn: async (url, ff) => makeScore(95, ff),
    });
    assert.equal(score.is_primary, false);
    assert.equal(score.form_factor, 'desktop');
  });
});

describe('runWPLighthouse — never throws', () => {
  it('never throws when lighthouseFn throws', async () => {
    const score = await runWPLighthouse('https://shop.com/', undefined, {
      lighthouseFn: async () => { throw new Error('PSI down'); },
    });
    assert.equal(score.performance, 0);
    assert.ok(score.error);
  });
});

// ── runWPLighthouseFull ───────────────────────────────────────────────────────

describe('runWPLighthouseFull — mobile result', () => {
  it('returns mobile result', async () => {
    const result = await runWPLighthouseFull('https://shop.com/', {}, {
      lighthouseFn: async (url, ff) => makeScore(ff === 'mobile' ? 78 : 95, ff),
    });
    assert.equal(result.mobile.performance, 78);
    assert.equal(result.mobile.form_factor, 'mobile');
  });

  it('primary_score equals mobile result', async () => {
    const result = await runWPLighthouseFull('https://shop.com/', {}, {
      lighthouseFn: async (url, ff) => makeScore(82, ff),
    });
    assert.equal(result.primary_score.performance, result.mobile.performance);
    assert.equal(result.primary_score.form_factor, 'mobile');
  });

  it('mobile.is_primary is true', async () => {
    const result = await runWPLighthouseFull('https://shop.com/', {}, {
      lighthouseFn: async (url, ff) => makeScore(80, ff),
    });
    assert.equal(result.mobile.is_primary, true);
  });
});

describe('runWPLighthouseFull — desktop secondary', () => {
  it('returns desktop result when run_desktop_secondary=true', async () => {
    const result = await runWPLighthouseFull(
      'https://shop.com/',
      { run_desktop_secondary: true },
      { lighthouseFn: async (url, ff) => makeScore(ff === 'mobile' ? 75 : 92, ff) },
    );
    assert.ok(result.desktop !== null);
    assert.equal(result.desktop!.performance, 92);
    assert.equal(result.desktop!.form_factor, 'desktop');
    assert.equal(result.desktop!.is_primary, false);
  });

  it('skips desktop when run_desktop_secondary=false', async () => {
    const calls: string[] = [];
    const result = await runWPLighthouseFull(
      'https://shop.com/',
      { run_desktop_secondary: false },
      { lighthouseFn: async (url, ff) => { calls.push(ff); return makeScore(85, ff); } },
    );
    assert.equal(result.desktop, null);
    assert.ok(!calls.includes('desktop'));
  });

  it('calculates mobile_desktop_gap correctly', async () => {
    const result = await runWPLighthouseFull(
      'https://shop.com/',
      { run_desktop_secondary: true },
      { lighthouseFn: async (url, ff) => makeScore(ff === 'mobile' ? 70 : 90, ff) },
    );
    assert.equal(result.mobile_desktop_gap, 20); // 90 - 70 = 20pts
  });

  it('mobile_desktop_gap is null when no desktop', async () => {
    const result = await runWPLighthouseFull(
      'https://shop.com/',
      { run_desktop_secondary: false },
      { lighthouseFn: async (url, ff) => makeScore(80, ff) },
    );
    assert.equal(result.mobile_desktop_gap, null);
  });
});

describe('runWPLighthouseFull — never throws', () => {
  it('never throws when lighthouseFn throws', async () => {
    const result = await runWPLighthouseFull('https://shop.com/', {}, {
      lighthouseFn: async () => { throw new Error('boom'); },
    });
    assert.ok(result);
    assert.equal(result.mobile.performance, 0);
  });
});

// ── runWPLighthouseDelta ──────────────────────────────────────────────────────

describe('runWPLighthouseDelta — mobile-based regression', () => {
  it('regression_detected based on mobile (primary) score drop', () => {
    const before = makeFull(85, 95);
    const after  = makeFull(70, 95); // mobile drops 15pts
    const delta  = runWPLighthouseDelta(before, after, 5);
    assert.equal(delta.regression_detected, true);
    assert.equal(delta.mobile_performance_delta, -15);
  });

  it('regression_detected=false when mobile drop is within threshold', () => {
    const before = makeFull(85, 95);
    const after  = makeFull(82, 95); // only 3pt drop
    const delta  = runWPLighthouseDelta(before, after, 5);
    assert.equal(delta.regression_detected, false);
  });

  it('does not use desktop for regression detection', () => {
    const before = makeFull(85, 95);
    const after  = makeFull(85, 60); // desktop drops massively — mobile unchanged
    const delta  = runWPLighthouseDelta(before, after, 5);
    assert.equal(delta.regression_detected, false);
  });
});

describe('runWPLighthouseDelta — includes both deltas', () => {
  it('includes mobile_performance_delta', () => {
    const before = makeFull(80, 90);
    const after  = makeFull(88, 92);
    const delta  = runWPLighthouseDelta(before, after);
    assert.equal(delta.mobile_performance_delta, 8);
  });

  it('includes desktop_performance_delta', () => {
    const before = makeFull(80, 90);
    const after  = makeFull(88, 92);
    const delta  = runWPLighthouseDelta(before, after);
    assert.equal(delta.desktop_performance_delta, 2);
  });

  it('desktop_performance_delta is null when no desktop', () => {
    const before = makeFull(80);
    const after  = makeFull(88);
    const delta  = runWPLighthouseDelta(before, after);
    assert.equal(delta.desktop_performance_delta, null);
  });

  it('primary_delta equals mobile_performance_delta', () => {
    const before = makeFull(75, 90);
    const after  = makeFull(82, 88);
    const delta  = runWPLighthouseDelta(before, after);
    assert.equal(delta.primary_delta, delta.mobile_performance_delta);
  });

  it('before_score and after_score come from mobile', () => {
    const before = makeFull(72, 95);
    const after  = makeFull(80, 92);
    const delta  = runWPLighthouseDelta(before, after);
    assert.equal(delta.before_score, 72);
    assert.equal(delta.after_score, 80);
  });
});

describe('runWPLighthouseDelta — never throws', () => {
  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => runWPLighthouseDelta(null as never, null as never));
  });

  it('returns safe zero values on error', () => {
    const delta = runWPLighthouseDelta(null as never, null as never);
    assert.equal(delta.regression_detected, false);
    assert.equal(delta.before_score, 0);
    assert.equal(delta.after_score, 0);
  });
});
