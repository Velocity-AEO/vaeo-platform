import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultWhiteLabel,
  applyWhiteLabel,
  isValidHexColor,
} from './whitelabel_config.js';

// ── buildDefaultWhiteLabel ──────────────────────────────────────────────────

describe('buildDefaultWhiteLabel', () => {
  it('sets agency_id', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'Agency').agency_id, 'a1');
  });

  it('sets brand_name to agency_name', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'My Agency').brand_name, 'My Agency');
  });

  it('sets primary_color to #6366f1', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'A').primary_color, '#6366f1');
  });

  it('sets support_email to support@vaeo.app', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'A').support_email, 'support@vaeo.app');
  });

  it('sets hide_vaeo_branding to false', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'A').hide_vaeo_branding, false);
  });

  it('sets logo_url to null', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'A').logo_url, null);
  });

  it('sets custom_domain to null', () => {
    assert.equal(buildDefaultWhiteLabel('a1', 'A').custom_domain, null);
  });

  it('never throws on null args', () => {
    assert.doesNotThrow(() => buildDefaultWhiteLabel(null as any, null as any));
  });
});

// ── applyWhiteLabel ─────────────────────────────────────────────────────────

describe('applyWhiteLabel', () => {
  const config = buildDefaultWhiteLabel('a1', 'Test Agency');
  const defaults = { brand_name: 'VAEO', logo_url: null, primary_color: '#3b82f6' };

  it('returns config brand_name over default', () => {
    assert.equal(applyWhiteLabel(config, defaults).brand_name, 'Test Agency');
  });

  it('returns default brand_name when config brand is empty', () => {
    const c = { ...config, brand_name: '' };
    assert.equal(applyWhiteLabel(c, defaults).brand_name, 'VAEO');
  });

  it('show_vaeo_badge is true when hide_vaeo_branding is false', () => {
    assert.equal(applyWhiteLabel(config, defaults).show_vaeo_badge, true);
  });

  it('show_vaeo_badge is false when hide_vaeo_branding is true', () => {
    const c = { ...config, hide_vaeo_branding: true };
    assert.equal(applyWhiteLabel(c, defaults).show_vaeo_badge, false);
  });

  it('returns config primary_color', () => {
    assert.equal(applyWhiteLabel(config, defaults).primary_color, '#6366f1');
  });

  it('never throws on null config', () => {
    assert.doesNotThrow(() => applyWhiteLabel(null as any, defaults));
  });
});

// ── isValidHexColor ─────────────────────────────────────────────────────────

describe('isValidHexColor', () => {
  it('accepts #fff', () => {
    assert.equal(isValidHexColor('#fff'), true);
  });

  it('accepts #ffffff', () => {
    assert.equal(isValidHexColor('#ffffff'), true);
  });

  it('accepts #6366f1', () => {
    assert.equal(isValidHexColor('#6366f1'), true);
  });

  it('accepts #ABC', () => {
    assert.equal(isValidHexColor('#ABC'), true);
  });

  it('rejects "red"', () => {
    assert.equal(isValidHexColor('red'), false);
  });

  it('rejects "#gggggg"', () => {
    assert.equal(isValidHexColor('#gggggg'), false);
  });

  it('rejects empty string', () => {
    assert.equal(isValidHexColor(''), false);
  });

  it('rejects "#ff" (2 digits)', () => {
    assert.equal(isValidHexColor('#ff'), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isValidHexColor(null as any));
  });
});
