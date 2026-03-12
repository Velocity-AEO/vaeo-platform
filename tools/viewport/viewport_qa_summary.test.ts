import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildViewportQASummary,
  getMostFailedViewport,
} from './viewport_qa_summary.js';
import type { ViewportQARecord } from './viewport_qa_orchestrator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ViewportQARecord> = {}): ViewportQARecord {
  return {
    fix_id: 'fix_1',
    site_id: 'site_1',
    url: 'https://example.com',
    passed: true,
    failed_viewports: [],
    checked_at: '2026-03-12T00:00:00Z',
    screenshots: {},
    ...overrides,
  };
}

// ── buildViewportQASummary ──────────────────────────────────────────────────

describe('buildViewportQASummary', () => {
  it('calculates pass_rate correctly', () => {
    const records = [
      makeRecord({ passed: true }),
      makeRecord({ passed: true }),
      makeRecord({ passed: false, failed_viewports: ['mobile'] }),
    ];
    const summary = buildViewportQASummary('site_1', records);
    assert.equal(summary.pass_rate, 67);
  });

  it('returns 0 pass_rate for empty records', () => {
    const summary = buildViewportQASummary('site_1', []);
    assert.equal(summary.pass_rate, 0);
  });

  it('returns 100 pass_rate when all pass', () => {
    const records = [makeRecord(), makeRecord()];
    const summary = buildViewportQASummary('site_1', records);
    assert.equal(summary.pass_rate, 100);
  });

  it('counts total_fixes_with_qa', () => {
    const records = [makeRecord(), makeRecord(), makeRecord()];
    const summary = buildViewportQASummary('site_1', records);
    assert.equal(summary.total_fixes_with_qa, 3);
  });

  it('counts passed and failed', () => {
    const records = [
      makeRecord({ passed: true }),
      makeRecord({ passed: false }),
    ];
    const summary = buildViewportQASummary('site_1', records);
    assert.equal(summary.passed, 1);
    assert.equal(summary.failed, 1);
  });

  it('finds most_failed_viewport', () => {
    const records = [
      makeRecord({ passed: false, failed_viewports: ['mobile'] }),
      makeRecord({ passed: false, failed_viewports: ['mobile', 'tablet'] }),
      makeRecord({ passed: false, failed_viewports: ['tablet'] }),
    ];
    const summary = buildViewportQASummary('site_1', records);
    // mobile: 2, tablet: 2 — either is acceptable, both appear twice
    assert.ok(summary.most_failed_viewport === 'mobile' || summary.most_failed_viewport === 'tablet');
  });

  it('most_failed_viewport is null when no failures', () => {
    const records = [makeRecord({ passed: true }), makeRecord({ passed: true })];
    const summary = buildViewportQASummary('site_1', records);
    assert.equal(summary.most_failed_viewport, null);
  });

  it('last_qa_at reflects most recent record', () => {
    const records = [
      makeRecord({ checked_at: '2026-01-01T00:00:00Z' }),
      makeRecord({ checked_at: '2026-03-15T00:00:00Z' }),
      makeRecord({ checked_at: '2026-02-01T00:00:00Z' }),
    ];
    const summary = buildViewportQASummary('site_1', records);
    assert.equal(summary.last_qa_at, '2026-03-15T00:00:00Z');
  });

  it('last_qa_at is null for empty records', () => {
    const summary = buildViewportQASummary('site_1', []);
    assert.equal(summary.last_qa_at, null);
  });

  it('includes site_id', () => {
    const summary = buildViewportQASummary('my_site', []);
    assert.equal(summary.site_id, 'my_site');
  });

  it('never throws on null records', () => {
    assert.doesNotThrow(() => buildViewportQASummary('s', null as unknown as ViewportQARecord[]));
  });
});

// ── getMostFailedViewport ───────────────────────────────────────────────────

describe('getMostFailedViewport', () => {
  it('returns correct viewport when one dominates', () => {
    const records = [
      makeRecord({ failed_viewports: ['mobile'] }),
      makeRecord({ failed_viewports: ['mobile'] }),
      makeRecord({ failed_viewports: ['desktop'] }),
    ];
    assert.equal(getMostFailedViewport(records), 'mobile');
  });

  it('returns null for empty array', () => {
    assert.equal(getMostFailedViewport([]), null);
  });

  it('returns null when no failures', () => {
    const records = [makeRecord({ failed_viewports: [] })];
    assert.equal(getMostFailedViewport(records), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getMostFailedViewport(null as unknown as ViewportQARecord[]));
  });
});
