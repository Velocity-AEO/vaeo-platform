/**
 * apps/dashboard/lib/banner_logic.test.ts
 *
 * Tests for simulated data banner logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getBannerState, getBannerMessage } from './banner_logic.js';

// ── getBannerState ───────────────────────────────────────────────────────────

describe('getBannerState', () => {
  it('returns no_banner for gsc_live', () => {
    assert.equal(getBannerState('gsc_live', true), 'no_banner');
  });

  it('returns no_banner for gsc_live even when not connected', () => {
    assert.equal(getBannerState('gsc_live', false), 'no_banner');
  });

  it('returns gsc_not_connected when simulated and not connected', () => {
    assert.equal(getBannerState('simulated', false), 'gsc_not_connected');
  });

  it('returns gsc_syncing when simulated and connected', () => {
    assert.equal(getBannerState('simulated', true), 'gsc_syncing');
  });

  it('returns gsc_not_connected for unknown source and not connected', () => {
    assert.equal(getBannerState('unknown', false), 'gsc_not_connected');
  });

  it('returns gsc_syncing for unknown source and connected', () => {
    assert.equal(getBannerState('unknown', true), 'gsc_syncing');
  });
});

// ── getBannerMessage ─────────────────────────────────────────────────────────

describe('getBannerMessage', () => {
  it('returns empty string for no_banner', () => {
    assert.equal(getBannerMessage('no_banner'), '');
  });

  it('returns non-empty for gsc_not_connected', () => {
    const msg = getBannerMessage('gsc_not_connected');
    assert.ok(msg.length > 0);
    assert.ok(msg.includes('Connect Google Search Console'));
  });

  it('returns non-empty for gsc_syncing', () => {
    const msg = getBannerMessage('gsc_syncing');
    assert.ok(msg.length > 0);
    assert.ok(msg.includes('syncing'));
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('banner_logic — never throws', () => {
  it('getBannerState with empty string', () => {
    const r = getBannerState('', false);
    assert.ok(typeof r === 'string');
  });

  it('getBannerMessage with no_banner', () => {
    assert.equal(getBannerMessage('no_banner'), '');
  });
});
