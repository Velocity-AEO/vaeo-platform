/**
 * apps/dashboard/lib/fix_explanation_display.test.ts
 *
 * Tests for fix explanation display helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCategoryBadgeConfig,
  formatExplanationPreview,
} from './fix_explanation_display.js';
import { getFixExplanation } from '../../../tools/explanations/fix_explanation_registry.js';

// ── getCategoryBadgeConfig ───────────────────────────────────────────────────

describe('getCategoryBadgeConfig', () => {
  it('returns correct for seo', () => {
    const cfg = getCategoryBadgeConfig('seo');
    assert.equal(cfg.label, 'SEO');
    assert.ok(cfg.color.includes('blue'));
  });

  it('returns correct for aeo', () => {
    const cfg = getCategoryBadgeConfig('aeo');
    assert.equal(cfg.label, 'AEO');
    assert.ok(cfg.color.includes('purple'));
  });

  it('returns correct for technical', () => {
    const cfg = getCategoryBadgeConfig('technical');
    assert.equal(cfg.label, 'Technical');
    assert.ok(cfg.color.includes('gray'));
  });

  it('returns correct for accessibility', () => {
    const cfg = getCategoryBadgeConfig('accessibility');
    assert.equal(cfg.label, 'Accessibility');
    assert.ok(cfg.color.includes('green'));
  });

  it('returns correct for social', () => {
    const cfg = getCategoryBadgeConfig('social');
    assert.equal(cfg.label, 'Social');
    assert.ok(cfg.color.includes('orange'));
  });

  it('returns fallback for unknown category', () => {
    const cfg = getCategoryBadgeConfig('nonsense' as any);
    assert.ok(cfg.label);
    assert.ok(cfg.color);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getCategoryBadgeConfig(null as any));
  });
});

// ── formatExplanationPreview ─────────────────────────────────────────────────

describe('formatExplanationPreview', () => {
  it('truncates at 80 chars', () => {
    const exp = getFixExplanation('SPEAKABLE_MISSING');
    const preview = formatExplanationPreview(exp);
    assert.ok(preview.length <= 81); // 80 chars + ellipsis character
  });

  it('adds ellipsis when truncated', () => {
    const exp = getFixExplanation('SPEAKABLE_MISSING');
    const preview = formatExplanationPreview(exp);
    // what_we_did is > 80 chars
    assert.ok(preview.endsWith('…'));
  });

  it('returns full string when under 80 chars', () => {
    const exp = {
      ...getFixExplanation('TITLE_MISSING'),
      what_we_did: 'Short text here.',
    };
    const preview = formatExplanationPreview(exp);
    assert.equal(preview, 'Short text here.');
    assert.ok(!preview.endsWith('…'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatExplanationPreview(null as any));
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => formatExplanationPreview(undefined as any));
  });
});
