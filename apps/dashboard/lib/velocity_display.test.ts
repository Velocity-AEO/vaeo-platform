/**
 * apps/dashboard/lib/velocity_display.test.ts
 *
 * Tests for velocity display helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getVelocityTrendConfig,
  formatVelocityChange,
  getVelocityAlertLevel,
} from './velocity_display.js';

// ── getVelocityTrendConfig ───────────────────────────────────────────────────

describe('getVelocityTrendConfig', () => {
  it('returns correct for gaining', () => {
    const cfg = getVelocityTrendConfig('gaining');
    assert.equal(cfg.label, 'Gaining');
    assert.ok(cfg.color.includes('green'));
    assert.equal(cfg.icon, '↑');
  });

  it('returns correct for losing_sudden', () => {
    const cfg = getVelocityTrendConfig('losing_sudden');
    assert.equal(cfg.label, 'Sudden Loss');
    assert.ok(cfg.color.includes('red'));
    assert.equal(cfg.icon, '↓');
  });

  it('returns correct for losing_gradual', () => {
    const cfg = getVelocityTrendConfig('losing_gradual');
    assert.equal(cfg.label, 'Gradual Loss');
    assert.ok(cfg.color.includes('orange'));
  });

  it('returns correct for stable', () => {
    const cfg = getVelocityTrendConfig('stable');
    assert.equal(cfg.label, 'Stable');
    assert.equal(cfg.icon, '→');
  });

  it('returns correct for new_page', () => {
    const cfg = getVelocityTrendConfig('new_page');
    assert.equal(cfg.label, 'New');
    assert.ok(cfg.color.includes('blue'));
    assert.equal(cfg.icon, '+');
  });

  it('returns correct for insufficient_data', () => {
    const cfg = getVelocityTrendConfig('insufficient_data');
    assert.equal(cfg.label, 'Not enough data');
    assert.equal(cfg.icon, '—');
  });

  it('returns icon for all types', () => {
    const types = ['gaining', 'losing_sudden', 'losing_gradual', 'stable', 'new_page', 'insufficient_data'] as const;
    for (const t of types) {
      const cfg = getVelocityTrendConfig(t);
      assert.ok(cfg.icon.length > 0);
    }
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getVelocityTrendConfig(null as any));
  });
});

// ── formatVelocityChange ─────────────────────────────────────────────────────

describe('formatVelocityChange', () => {
  it('returns dash for null', () => {
    assert.equal(formatVelocityChange(null, null), '—');
  });

  it('formats positive change', () => {
    const result = formatVelocityChange(5, 25);
    assert.ok(result.includes('+5'));
    assert.ok(result.includes('+25%'));
  });

  it('formats negative change', () => {
    const result = formatVelocityChange(-3, -15);
    assert.ok(result.includes('-3'));
    assert.ok(result.includes('-15%'));
  });

  it('returns no change for zero', () => {
    assert.equal(formatVelocityChange(0, 0), 'No change');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatVelocityChange(null as any, null as any));
  });
});

// ── getVelocityAlertLevel ────────────────────────────────────────────────────

describe('getVelocityAlertLevel', () => {
  it('returns critical for hub losing sudden', () => {
    assert.equal(getVelocityAlertLevel({
      trend_type: 'losing_sudden', is_hub_page: true,
      alert_required: true, current_inbound: 10,
      change_7d: -5, authority_score: 80,
    }), 'critical');
  });

  it('returns warning for alert without hub', () => {
    assert.equal(getVelocityAlertLevel({
      trend_type: 'losing_sudden', is_hub_page: false,
      alert_required: true, current_inbound: 3,
      change_7d: -2, authority_score: 20,
    }), 'warning');
  });

  it('returns none for stable', () => {
    assert.equal(getVelocityAlertLevel({
      trend_type: 'stable', is_hub_page: false,
      alert_required: false, current_inbound: 20,
      change_7d: 0, authority_score: 50,
    }), 'none');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getVelocityAlertLevel(null as any));
  });
});
