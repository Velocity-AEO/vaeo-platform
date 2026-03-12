/**
 * apps/dashboard/lib/whitelabel_preview_logic.test.ts
 *
 * Tests for white-label preview logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreviewFormState,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  meetsWCAGAA,
  getTextColorForBg,
  buildPreviewTheme,
  isValidHexColor,
  isValidEmail,
  validatePreviewForm,
  hasPreviewErrors,
  type PreviewFormState,
} from './whitelabel_preview_logic.js';

// ── buildPreviewFormState ────────────────────────────────────────────────────

describe('buildPreviewFormState', () => {
  it('builds from config', () => {
    const state = buildPreviewFormState({
      agency_id: 'ag_1', agency_name: 'Test', brand_name: 'Acme',
      logo_url: null, primary_color: '#ff0000', support_email: 'a@b.com',
      hide_vaeo_branding: true, custom_domain: null,
    });
    assert.equal(state.brand_name, 'Acme');
    assert.equal(state.primary_color, '#ff0000');
    assert.equal(state.hide_vaeo_branding, true);
  });

  it('returns defaults for null config', () => {
    const state = buildPreviewFormState(null);
    assert.equal(state.primary_color, '#6366f1');
    assert.equal(state.brand_name, '');
  });
});

// ── hexToRgb ─────────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    const rgb = hexToRgb('#ff0000');
    assert.deepEqual(rgb, { r: 255, g: 0, b: 0 });
  });

  it('parses 3-digit hex', () => {
    const rgb = hexToRgb('#f00');
    assert.deepEqual(rgb, { r: 255, g: 0, b: 0 });
  });

  it('returns null for invalid', () => {
    assert.equal(hexToRgb('not-a-color'), null);
  });

  it('returns null for null', () => {
    assert.equal(hexToRgb(null as any), null);
  });
});

// ── relativeLuminance ────────────────────────────────────────────────────────

describe('relativeLuminance', () => {
  it('returns ~1 for white', () => {
    const l = relativeLuminance(255, 255, 255);
    assert.ok(l > 0.99);
  });

  it('returns 0 for black', () => {
    assert.equal(relativeLuminance(0, 0, 0), 0);
  });
});

// ── contrastRatio ────────────────────────────────────────────────────────────

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    assert.ok(ratio > 20 && ratio < 22);
  });

  it('returns 1 for same color', () => {
    assert.equal(contrastRatio('#ff0000', '#ff0000'), 1);
  });

  it('returns 1 for invalid colors', () => {
    assert.equal(contrastRatio('bad', 'bad'), 1);
  });
});

// ── meetsWCAGAA ──────────────────────────────────────────────────────────────

describe('meetsWCAGAA', () => {
  it('passes for black on white', () => {
    assert.equal(meetsWCAGAA('#000000', '#ffffff'), true);
  });

  it('fails for light gray on white', () => {
    assert.equal(meetsWCAGAA('#cccccc', '#ffffff'), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => meetsWCAGAA(null as any, null as any));
  });
});

// ── getTextColorForBg ────────────────────────────────────────────────────────

describe('getTextColorForBg', () => {
  it('returns black for light backgrounds', () => {
    assert.equal(getTextColorForBg('#ffffff'), '#000000');
  });

  it('returns white for dark backgrounds', () => {
    assert.equal(getTextColorForBg('#000000'), '#ffffff');
  });

  it('returns white for null', () => {
    assert.equal(getTextColorForBg(null as any), '#ffffff');
  });
});

// ── buildPreviewTheme ────────────────────────────────────────────────────────

describe('buildPreviewTheme', () => {
  it('builds theme from form', () => {
    const form: PreviewFormState = {
      brand_name: 'Acme', primary_color: '#000000', support_email: '',
      hide_vaeo_branding: false, logo_url: '', custom_domain: '',
    };
    const theme = buildPreviewTheme(form);
    assert.equal(theme.bg_color, '#000000');
    assert.equal(theme.text_color, '#ffffff');
    assert.equal(theme.brand_name, 'Acme');
    assert.equal(theme.show_badge, true);
  });

  it('uses fallback brand name', () => {
    const form: PreviewFormState = {
      brand_name: '', primary_color: '#6366f1', support_email: '',
      hide_vaeo_branding: true, logo_url: '', custom_domain: '',
    };
    const theme = buildPreviewTheme(form);
    assert.equal(theme.brand_name, 'Your Brand');
    assert.equal(theme.show_badge, false);
  });
});

// ── isValidHexColor ──────────────────────────────────────────────────────────

describe('isValidHexColor', () => {
  it('accepts #6366f1', () => {
    assert.equal(isValidHexColor('#6366f1'), true);
  });

  it('accepts 3-digit hex', () => {
    assert.equal(isValidHexColor('#f00'), true);
  });

  it('rejects missing hash', () => {
    assert.equal(isValidHexColor('6366f1'), false);
  });

  it('rejects empty', () => {
    assert.equal(isValidHexColor(''), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isValidHexColor(null as any));
  });
});

// ── isValidEmail ─────────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    assert.equal(isValidEmail('a@b.com'), true);
  });

  it('rejects no @', () => {
    assert.equal(isValidEmail('abc.com'), false);
  });

  it('rejects empty', () => {
    assert.equal(isValidEmail(''), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isValidEmail(null as any));
  });
});

// ── validatePreviewForm ──────────────────────────────────────────────────────

describe('validatePreviewForm', () => {
  const valid: PreviewFormState = {
    brand_name: 'Acme', primary_color: '#6366f1', support_email: 'a@b.com',
    hide_vaeo_branding: false, logo_url: '', custom_domain: '',
  };

  it('returns no errors for valid form', () => {
    const errs = validatePreviewForm(valid);
    assert.equal(errs.brand_name, null);
    assert.equal(errs.primary_color, null);
    assert.equal(errs.support_email, null);
  });

  it('flags empty brand name', () => {
    assert.ok(validatePreviewForm({ ...valid, brand_name: '' }).brand_name);
  });

  it('flags invalid color', () => {
    assert.ok(validatePreviewForm({ ...valid, primary_color: 'nope' }).primary_color);
  });

  it('flags invalid email', () => {
    assert.ok(validatePreviewForm({ ...valid, support_email: 'bad' }).support_email);
  });

  it('allows empty email', () => {
    assert.equal(validatePreviewForm({ ...valid, support_email: '' }).support_email, null);
  });
});

// ── hasPreviewErrors ─────────────────────────────────────────────────────────

describe('hasPreviewErrors', () => {
  it('returns false when no errors', () => {
    assert.equal(hasPreviewErrors({ brand_name: null, primary_color: null, support_email: null }), false);
  });

  it('returns true when any error', () => {
    assert.equal(hasPreviewErrors({ brand_name: 'bad', primary_color: null, support_email: null }), true);
  });
});
