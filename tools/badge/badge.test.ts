/**
 * tools/badge/badge.test.ts
 *
 * Tests for getBadgeState and generateBadgeSvg.
 * All Supabase I/O is replaced by injectable deps — no network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBadgeState,
  generateBadgeSvg,
} from './badge.ts';
import type { BadgeDeps, BadgeSnapshot, BadgeState } from './badge.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString();

/** Returns an ISO timestamp `days` ago (positive = past). */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeDeps(snap: BadgeSnapshot | null): BadgeDeps {
  return { getLatestSnapshot: async () => snap };
}

// ── getBadgeState ─────────────────────────────────────────────────────────────

describe('getBadgeState', () => {
  it('inactive — no snapshot (never scanned)', async () => {
    const state = await getBadgeState('site-1', makeDeps(null));
    assert.equal(state, 'inactive');
  });

  it('verified — score 80, 0 critical, 6 days old', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 80, critical_issues: 0, last_run_at: daysAgo(6),
    }));
    assert.equal(state, 'verified');
  });

  it('verified — score 100, 0 critical, exactly 7 days old', async () => {
    // 7 * 24 * 60 * 60 * 1000 - 1ms ≈ 7 days
    const sevenDaysMinus = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 1000).toISOString();
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 100, critical_issues: 0, last_run_at: sevenDaysMinus,
    }));
    assert.equal(state, 'verified');
  });

  it('monitoring — score 80, has critical issues, 3 days old', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 80, critical_issues: 2, last_run_at: daysAgo(3),
    }));
    assert.equal(state, 'monitoring');
  });

  it('monitoring — score 55 (boundary), 0 critical, 10 days old', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 55, critical_issues: 0, last_run_at: daysAgo(10),
    }));
    assert.equal(state, 'monitoring');
  });

  it('monitoring — score 79, 0 critical, 5 days old (just below verified threshold)', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 79, critical_issues: 0, last_run_at: daysAgo(5),
    }));
    assert.equal(state, 'monitoring');
  });

  it('monitoring — score 80, 0 critical, 8 days old (age > 7 but <= 14)', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 80, critical_issues: 0, last_run_at: daysAgo(8),
    }));
    assert.equal(state, 'monitoring');
  });

  it('at_risk — score 54 (below 55), recent run', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 54, critical_issues: 0, last_run_at: daysAgo(2),
    }));
    assert.equal(state, 'at_risk');
  });

  it('at_risk — score 0, critical issues, old run', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 0, critical_issues: 10, last_run_at: daysAgo(30),
    }));
    assert.equal(state, 'at_risk');
  });

  it('at_risk — score 80, 0 critical, but run is 15 days old (stale)', async () => {
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 80, critical_issues: 0, last_run_at: daysAgo(15),
    }));
    assert.equal(state, 'at_risk');
  });

  it('at_risk — run is exactly 14.01 days old', async () => {
    const justOver14 = new Date(Date.now() - 14.01 * 24 * 60 * 60 * 1000).toISOString();
    const state = await getBadgeState('site-1', makeDeps({
      health_score: 70, critical_issues: 0, last_run_at: justOver14,
    }));
    assert.equal(state, 'at_risk');
  });

  it('passes siteId to getLatestSnapshot', async () => {
    const seen: string[] = [];
    const deps: BadgeDeps = {
      getLatestSnapshot: async (id) => { seen.push(id); return null; },
    };
    await getBadgeState('abc-123', deps);
    assert.deepEqual(seen, ['abc-123']);
  });
});

// ── generateBadgeSvg ──────────────────────────────────────────────────────────

describe('generateBadgeSvg', () => {
  const STATES: BadgeState[] = ['verified', 'monitoring', 'at_risk', 'inactive'];

  it('returns a string beginning with <svg', () => {
    for (const state of STATES) {
      const svg = generateBadgeSvg(state, 'example.com');
      assert.ok(svg.startsWith('<svg'), `${state}: expected SVG element`);
    }
  });

  it('verified — green background, "Velocity Verified" label', () => {
    const svg = generateBadgeSvg('verified', 'example.com');
    assert.ok(svg.includes('#2da44e'), 'expected green bg');
    assert.ok(svg.includes('Velocity Verified'), 'expected label');
  });

  it('monitoring — blue background, "SEO Monitored" label', () => {
    const svg = generateBadgeSvg('monitoring', 'example.com');
    assert.ok(svg.includes('#0969da'), 'expected blue bg');
    assert.ok(svg.includes('SEO Monitored'), 'expected label');
  });

  it('at_risk — orange background, "Needs Attention" label', () => {
    const svg = generateBadgeSvg('at_risk', 'example.com');
    assert.ok(svg.includes('#bf8700'), 'expected orange bg');
    assert.ok(svg.includes('Needs Attention'), 'expected label');
  });

  it('inactive — grey background, "Not Connected" label', () => {
    const svg = generateBadgeSvg('inactive', 'example.com');
    assert.ok(svg.includes('#57606a'), 'expected grey bg');
    assert.ok(svg.includes('Not Connected'), 'expected label');
  });

  it('siteUrl is included in aria-label', () => {
    const svg = generateBadgeSvg('verified', 'cococabanalife.com');
    assert.ok(svg.includes('cococabanalife.com'), 'expected siteUrl in aria-label');
  });

  it('escapes < > & in siteUrl (XSS prevention)', () => {
    const svg = generateBadgeSvg('verified', '<script>alert(1)</script>');
    assert.ok(!svg.includes('<script>'), 'raw <script> must not appear');
    assert.ok(svg.includes('&lt;script&gt;'), 'must be HTML-escaped');
  });

  it('escapes double quotes in siteUrl', () => {
    const svg = generateBadgeSvg('monitoring', 'site" onload="evil()');
    assert.ok(!svg.includes('"site"'), 'raw double-quote must not appear unescaped');
    assert.ok(svg.includes('&quot;'), 'must escape double-quotes');
  });

  it('each state produces a distinct SVG', () => {
    const svgs = STATES.map((s) => generateBadgeSvg(s, 'example.com'));
    const unique = new Set(svgs);
    assert.equal(unique.size, STATES.length, 'all states should produce distinct SVG');
  });

  it('SVG contains a <title> element for accessibility', () => {
    for (const state of STATES) {
      const svg = generateBadgeSvg(state, 'example.com');
      assert.ok(svg.includes('<title>'), `${state}: missing <title>`);
    }
  });

  it('SVG contains role="img"', () => {
    const svg = generateBadgeSvg('verified', 'example.com');
    assert.ok(svg.includes('role="img"'), 'expected role="img"');
  });
});
