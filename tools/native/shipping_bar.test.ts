/**
 * tools/native/shipping_bar.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultShippingBarConfig,
  validateShippingBarConfig,
  generateShippingBarSnippet,
  type ShippingBarConfig,
} from './shipping_bar.ts';

// ── defaultShippingBarConfig ──────────────────────────────────────────────────

describe('defaultShippingBarConfig', () => {
  it('threshold_amount is 50', () => {
    assert.equal(defaultShippingBarConfig().threshold_amount, 50);
  });

  it('currency_symbol is $', () => {
    assert.equal(defaultShippingBarConfig().currency_symbol, '$');
  });

  it('message_below_threshold contains {remaining}', () => {
    assert.ok(defaultShippingBarConfig().message_below_threshold.includes('{remaining}'));
  });

  it('message_at_threshold contains free shipping', () => {
    assert.ok(defaultShippingBarConfig().message_at_threshold.toLowerCase().includes('free shipping'));
  });

  it('background_color is valid hex', () => {
    const c = defaultShippingBarConfig().background_color;
    assert.ok(c.startsWith('#') && (c.length === 4 || c.length === 7));
  });

  it('position is top', () => {
    assert.equal(defaultShippingBarConfig().position, 'top');
  });

  it('sticky is true', () => {
    assert.equal(defaultShippingBarConfig().sticky, true);
  });

  it('show_progress_bar is true', () => {
    assert.equal(defaultShippingBarConfig().show_progress_bar, true);
  });

  it('dismissible is false', () => {
    assert.equal(defaultShippingBarConfig().dismissible, false);
  });

  it('animate_on_threshold is true', () => {
    assert.equal(defaultShippingBarConfig().animate_on_threshold, true);
  });
});

// ── validateShippingBarConfig ─────────────────────────────────────────────────

describe('validateShippingBarConfig', () => {
  it('passes valid default config', () => {
    const v = validateShippingBarConfig(defaultShippingBarConfig());
    assert.equal(v.valid, true);
    assert.equal(v.errors.length, 0);
  });

  it('fails when threshold_amount <= 0', () => {
    const cfg: ShippingBarConfig = { ...defaultShippingBarConfig(), threshold_amount: 0 };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes('threshold_amount')));
  });

  it('fails when threshold_amount is negative', () => {
    const cfg = { ...defaultShippingBarConfig(), threshold_amount: -10 };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
  });

  it('fails when bar_height_px < 20', () => {
    const cfg = { ...defaultShippingBarConfig(), bar_height_px: 10 };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes('bar_height_px')));
  });

  it('fails when bar_height_px > 120', () => {
    const cfg = { ...defaultShippingBarConfig(), bar_height_px: 200 };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
  });

  it('fails when font_size_px < 10', () => {
    const cfg = { ...defaultShippingBarConfig(), font_size_px: 8 };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
  });

  it('fails when font_size_px > 32', () => {
    const cfg = { ...defaultShippingBarConfig(), font_size_px: 40 };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
  });

  it('fails when background_color invalid format', () => {
    const cfg = { ...defaultShippingBarConfig(), background_color: 'red' };
    const v = validateShippingBarConfig(cfg);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes('background_color')));
  });

  it('accepts 4-char hex color', () => {
    const cfg = { ...defaultShippingBarConfig(), background_color: '#fff' };
    const v = validateShippingBarConfig(cfg);
    assert.ok(!v.errors.some((e) => e.includes('background_color')));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => validateShippingBarConfig(null as unknown as ShippingBarConfig));
  });
});

// ── generateShippingBarSnippet ────────────────────────────────────────────────

describe('generateShippingBarSnippet', () => {
  const cfg  = defaultShippingBarConfig();
  const name = 'vaeo-shipping-bar-abc12345';

  it('contains vaeo-shipping-bar id', () => {
    const html = generateShippingBarSnippet(cfg, name);
    assert.ok(html.includes('id="vaeo-shipping-bar"'));
  });

  it('contains style block', () => {
    const html = generateShippingBarSnippet(cfg, name);
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('</style>'));
  });

  it('contains script block', () => {
    const html = generateShippingBarSnippet(cfg, name);
    assert.ok(html.includes('<script>'));
    assert.ok(html.includes('</script>'));
  });

  it('contains threshold_amount value', () => {
    const html = generateShippingBarSnippet(cfg, name);
    assert.ok(html.includes('50'));
  });

  it('contains currency_symbol', () => {
    const html = generateShippingBarSnippet(cfg, name);
    assert.ok(html.includes('$'));
  });

  it('contains snippet_name in comment', () => {
    const html = generateShippingBarSnippet(cfg, name);
    assert.ok(html.includes(`snippet: ${name}`));
  });

  it('contains progress bar when show_progress_bar=true', () => {
    const html = generateShippingBarSnippet({ ...cfg, show_progress_bar: true }, name);
    assert.ok(html.includes('vaeo-sb-progress'));
  });

  it('no progress bar when show_progress_bar=false', () => {
    const html = generateShippingBarSnippet({ ...cfg, show_progress_bar: false }, name);
    assert.ok(!html.includes('vaeo-sb-progress'));
  });

  it('contains dismiss button when dismissible=true', () => {
    const html = generateShippingBarSnippet({ ...cfg, dismissible: true }, name);
    assert.ok(html.includes('vaeo-sb-dismiss'));
  });

  it('no dismiss button when dismissible=false', () => {
    const html = generateShippingBarSnippet({ ...cfg, dismissible: false }, name);
    assert.ok(!html.includes('vaeo-sb-dismiss'));
  });

  it('position bottom reflected in CSS', () => {
    const html = generateShippingBarSnippet({ ...cfg, position: 'bottom' }, name);
    assert.ok(html.includes('bottom: 0'));
  });

  it('position top reflected in CSS', () => {
    const html = generateShippingBarSnippet({ ...cfg, position: 'top' }, name);
    assert.ok(html.includes('top: 0'));
  });

  it('sticky true adds fixed position', () => {
    const html = generateShippingBarSnippet({ ...cfg, sticky: true }, name);
    assert.ok(html.includes('position: fixed'));
  });

  it('animate_on_threshold reflected in script', () => {
    const html = generateShippingBarSnippet({ ...cfg, animate_on_threshold: true }, name);
    assert.ok(html.includes('threshold-met') || html.includes('pulse'));
  });

  it('background_color in style block', () => {
    const html = generateShippingBarSnippet({ ...cfg, background_color: '#ff0000' }, name);
    assert.ok(html.includes('#ff0000'));
  });

  it('progress_color in style block', () => {
    const html = generateShippingBarSnippet({ ...cfg, progress_color: '#00ff00' }, name);
    assert.ok(html.includes('#00ff00'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() =>
      generateShippingBarSnippet(null as unknown as ShippingBarConfig, null as unknown as string),
    );
  });
});
