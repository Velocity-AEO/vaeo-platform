/**
 * tools/live/live_run_config.test.ts
 *
 * Tests for live run config and state machine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiveRun,
  transitionPhase,
  defaultTarget,
  type LiveRunTarget,
  type LiveRunState,
} from './live_run_config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function target(overrides?: Partial<LiveRunTarget>): LiveRunTarget {
  return { ...defaultTarget('site_1', 'example.com', 'shopify'), ...overrides };
}

// ── createLiveRun ────────────────────────────────────────────────────────────

describe('createLiveRun', () => {
  it('generates run_id starting with lr_', () => {
    const state = createLiveRun(target());
    assert.ok(state.run_id.startsWith('lr_'));
  });

  it('sets phase to idle', () => {
    const state = createLiveRun(target());
    assert.equal(state.phase, 'idle');
  });

  it('sets started_at to ISO string', () => {
    const state = createLiveRun(target());
    assert.ok(state.started_at.includes('T'));
    assert.ok(!isNaN(Date.parse(state.started_at)));
  });

  it('initializes all counts to 0', () => {
    const state = createLiveRun(target());
    assert.equal(state.pages_crawled, 0);
    assert.equal(state.issues_detected, 0);
    assert.equal(state.issues_triaged, 0);
    assert.equal(state.fixes_generated, 0);
    assert.equal(state.fixes_applied, 0);
    assert.equal(state.fixes_verified, 0);
    assert.equal(state.fixes_failed, 0);
    assert.equal(state.sandbox_passes, 0);
    assert.equal(state.sandbox_failures, 0);
  });

  it('initializes empty phase_log', () => {
    const state = createLiveRun(target());
    assert.deepEqual(state.phase_log, []);
  });

  it('preserves target', () => {
    const t = target({ domain: 'myshop.com' });
    const state = createLiveRun(t);
    assert.equal(state.target.domain, 'myshop.com');
    assert.equal(state.target.site_id, 'site_1');
  });

  it('preserves dry_run from target', () => {
    const state = createLiveRun(target({ dry_run: true }));
    assert.equal(state.dry_run, true);
  });
});

// ── transitionPhase ──────────────────────────────────────────────────────────

describe('transitionPhase', () => {
  it('returns new state object (immutable)', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'crawling', 'Starting crawl');
    assert.notEqual(state, next);
    assert.equal(state.phase, 'idle');
    assert.equal(next.phase, 'crawling');
  });

  it('appends to phase_log', () => {
    const state = createLiveRun(target());
    const s1 = transitionPhase(state, 'crawling', 'Crawling');
    const s2 = transitionPhase(s1, 'detecting', 'Detecting');
    assert.equal(s2.phase_log.length, 2);
    assert.equal(s2.phase_log[0].phase, 'crawling');
    assert.equal(s2.phase_log[1].phase, 'detecting');
  });

  it('sets entered_at on phase_log entry', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'crawling', 'Go');
    assert.ok(next.phase_log[0].entered_at.includes('T'));
  });

  it('sets message on phase_log entry', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'crawling', 'Starting crawl');
    assert.equal(next.phase_log[0].message, 'Starting crawl');
  });

  it('sets completed_at when phase is complete', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'complete', 'Done');
    assert.ok(next.completed_at);
  });

  it('sets duration_ms when phase is complete', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'complete', 'Done');
    assert.ok(typeof next.duration_ms === 'number');
    assert.ok(next.duration_ms! >= 0);
  });

  it('sets completed_at when phase is failed', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'failed', 'Error occurred');
    assert.ok(next.completed_at);
    assert.ok(next.duration_ms !== undefined);
  });

  it('sets error when phase is failed', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'failed', 'Something broke');
    assert.equal(next.error, 'Something broke');
  });

  it('does not set completed_at for non-terminal phases', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'detecting', 'Detecting');
    assert.equal(next.completed_at, undefined);
  });

  it('does not mutate original phase_log array', () => {
    const state = createLiveRun(target());
    const next = transitionPhase(state, 'crawling', 'Go');
    assert.equal(state.phase_log.length, 0);
    assert.equal(next.phase_log.length, 1);
  });
});

// ── defaultTarget ────────────────────────────────────────────────────────────

describe('defaultTarget', () => {
  it('sets max_pages to 50', () => {
    const t = defaultTarget('s1', 'example.com', 'shopify');
    assert.equal(t.max_pages, 50);
  });

  it('includes 6 fix_types', () => {
    const t = defaultTarget('s1', 'example.com', 'shopify');
    assert.equal(t.fix_types.length, 6);
    assert.ok(t.fix_types.includes('title_missing'));
    assert.ok(t.fix_types.includes('lang_missing'));
  });

  it('sets dry_run to false', () => {
    const t = defaultTarget('s1', 'example.com', 'wordpress');
    assert.equal(t.dry_run, false);
  });

  it('sets notify_on_complete to true', () => {
    const t = defaultTarget('s1', 'example.com', 'shopify');
    assert.equal(t.notify_on_complete, true);
  });

  it('preserves platform', () => {
    const t = defaultTarget('s1', 'example.com', 'wordpress');
    assert.equal(t.platform, 'wordpress');
  });
});
