/**
 * tools/notifications/digest_white_label.test.ts
 *
 * Tests for white label email config.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWhiteLabelToDigest,
  buildFromAddress,
  loadWhiteLabelConfig,
  type WhiteLabelEmailConfig,
} from './digest_white_label.js';
import type { DigestEmailData } from './digest_email_template.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<DigestEmailData> = {}): DigestEmailData {
  return {
    site_domain: 'example.com',
    period_label: 'This Week',
    health_score: 85,
    health_score_change: 3,
    fixes_applied: 5,
    fixes_failed: 0,
    open_issues: 2,
    top_fixes: [],
    biggest_ranking_gain: null,
    gsc_connected: true,
    agency_name: null,
    white_label_color: null,
    unsubscribe_url: '',
    dashboard_url: '',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WhiteLabelEmailConfig> = {}): WhiteLabelEmailConfig {
  return {
    agency_name: null,
    primary_color: null,
    reply_to: null,
    from_name: null,
    ...overrides,
  };
}

// ── applyWhiteLabelToDigest ──────────────────────────────────────────────────

describe('applyWhiteLabelToDigest', () => {
  it('sets agency_name', () => {
    const result = applyWhiteLabelToDigest(makeData(), makeConfig({ agency_name: 'Acme SEO' }));
    assert.equal(result.agency_name, 'Acme SEO');
  });

  it('sets color', () => {
    const result = applyWhiteLabelToDigest(makeData(), makeConfig({ primary_color: '#ff0000' }));
    assert.equal(result.white_label_color, '#ff0000');
  });

  it('does not overwrite when config values are null', () => {
    const data = makeData({ agency_name: 'Original' });
    const result = applyWhiteLabelToDigest(data, makeConfig());
    assert.equal(result.agency_name, 'Original');
  });

  it('handles null config', () => {
    const data = makeData();
    const result = applyWhiteLabelToDigest(data, null as any);
    assert.equal(result.site_domain, 'example.com');
  });

  it('handles null data', () => {
    const result = applyWhiteLabelToDigest(null as any, makeConfig());
    assert.equal(result, null);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => applyWhiteLabelToDigest(null as any, null as any));
  });
});

// ── buildFromAddress ─────────────────────────────────────────────────────────

describe('buildFromAddress', () => {
  it('uses from_name when provided', () => {
    const addr = buildFromAddress(makeConfig({ from_name: 'Acme Agency' }));
    assert.equal(addr, 'Acme Agency <mail@vaeo.app>');
  });

  it('returns default when null', () => {
    const addr = buildFromAddress(makeConfig());
    assert.equal(addr, 'VAEO SEO Autopilot <mail@vaeo.app>');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildFromAddress(null as any));
  });
});

// ── loadWhiteLabelConfig ─────────────────────────────────────────────────────

describe('loadWhiteLabelConfig', () => {
  it('returns config from loadFn', async () => {
    const config = await loadWhiteLabelConfig('site-1', {
      loadFn: async () => makeConfig({ agency_name: 'Test Agency' }),
    });
    assert.equal(config.agency_name, 'Test Agency');
  });

  it('returns null config when loadFn returns null', async () => {
    const config = await loadWhiteLabelConfig('site-1', {
      loadFn: async () => null,
    });
    assert.equal(config.agency_name, null);
  });

  it('returns null config on error', async () => {
    const config = await loadWhiteLabelConfig('site-1', {
      loadFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(config.agency_name, null);
  });

  it('returns null config with no deps', async () => {
    const config = await loadWhiteLabelConfig('site-1');
    assert.equal(config.agency_name, null);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => loadWhiteLabelConfig(null as any, {
      loadFn: async () => { throw new Error('fail'); },
    }));
  });
});
