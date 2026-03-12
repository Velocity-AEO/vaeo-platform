/**
 * tools/detect/vehicle_detect.test.ts
 *
 * Tests for vehicle schema detection — inventory pages, VIN, make/model, schema presence.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectVehicleSignals } from './vehicle_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(body: string, title = ''): string {
  return `<html><head><title>${title}</title></head><body>${body}</body></html>`;
}

const SAMPLE_VIN = '1HGCM82633A004352';

// ── is_inventory_page ─────────────────────────────────────────────────────────

describe('detectVehicleSignals — inventory detection', () => {
  it('detects /inventory/ URL as inventory page', () => {
    const r = detectVehicleSignals(wrap('car page'), 'https://dealer.com/inventory/123');
    assert.equal(r.is_inventory_page, true);
  });

  it('detects /vehicle/ URL as inventory page', () => {
    const r = detectVehicleSignals(wrap('car page'), 'https://dealer.com/vehicle/456');
    assert.equal(r.is_inventory_page, true);
  });

  it('detects /vdp/ URL as inventory page', () => {
    const r = detectVehicleSignals(wrap('car'), 'https://dealer.com/vdp/789');
    assert.equal(r.is_inventory_page, true);
  });

  it('detects /used/ URL as inventory page', () => {
    const r = detectVehicleSignals(wrap('car'), 'https://dealer.com/used/sedan');
    assert.equal(r.is_inventory_page, true);
  });

  it('detects page with VIN as inventory page', () => {
    const r = detectVehicleSignals(wrap(`<p>VIN: ${SAMPLE_VIN}</p>`), 'https://dealer.com/about');
    assert.equal(r.is_inventory_page, true);
  });

  it('does not flag homepage as inventory', () => {
    const r = detectVehicleSignals(wrap('Welcome'), 'https://dealer.com/');
    assert.equal(r.is_inventory_page, false);
  });
});

// ── VIN detection ─────────────────────────────────────────────────────────────

describe('detectVehicleSignals — VIN', () => {
  it('extracts 17-char VIN', () => {
    const r = detectVehicleSignals(wrap(`VIN: ${SAMPLE_VIN}`), 'https://dealer.com/inventory/1');
    assert.equal(r.detected_vin, SAMPLE_VIN);
  });

  it('does not match short strings as VIN', () => {
    const r = detectVehicleSignals(wrap('VIN: ABC123'), 'https://dealer.com/inventory/1');
    assert.equal(r.detected_vin, undefined);
  });
});

// ── Schema detection ──────────────────────────────────────────────────────────

describe('detectVehicleSignals — existing schema', () => {
  it('detects existing Car schema', () => {
    const html = wrap(`<script type="application/ld+json">{"@type": "Car", "@context": "https://schema.org"}</script>`);
    const r = detectVehicleSignals(html, 'https://dealer.com/inventory/1');
    assert.equal(r.has_vehicle_schema, true);
  });

  it('detects existing Vehicle schema', () => {
    const html = wrap(`<script type="application/ld+json">{"@type": "Vehicle"}</script>`);
    const r = detectVehicleSignals(html, 'https://dealer.com/inventory/1');
    assert.equal(r.has_vehicle_schema, true);
  });

  it('detects Offer schema with price', () => {
    const html = wrap(`<script type="application/ld+json">{"@type": "Offer", "price": "25000"}</script>`);
    const r = detectVehicleSignals(html, 'https://dealer.com/inventory/1');
    assert.equal(r.has_price_schema, true);
  });

  it('reports no schema when absent', () => {
    const r = detectVehicleSignals(wrap('plain page'), 'https://dealer.com/inventory/1');
    assert.equal(r.has_vehicle_schema, false);
    assert.equal(r.has_price_schema, false);
  });
});

// ── Make/model/year extraction ────────────────────────────────────────────────

describe('detectVehicleSignals — make/model/year', () => {
  it('extracts year, make, and model from title', () => {
    const html = wrap('', '2024 Toyota Camry - Best Price');
    const r = detectVehicleSignals(html, 'https://dealer.com/inventory/1');
    assert.equal(r.detected_year, '2024');
    assert.equal(r.detected_make, 'Toyota');
    assert.equal(r.detected_model, 'Camry');
  });

  it('extracts make from h1', () => {
    const html = wrap('<h1>2023 Honda Accord EX-L</h1>');
    const r = detectVehicleSignals(html, 'https://dealer.com/inventory/1');
    assert.equal(r.detected_make, 'Honda');
    assert.ok(r.detected_model?.startsWith('Accord'));
  });
});

// ── Price extraction ──────────────────────────────────────────────────────────

describe('detectVehicleSignals — price', () => {
  it('extracts price from HTML', () => {
    const r = detectVehicleSignals(wrap('<span class="price">$32,995</span>'), 'https://dealer.com/inventory/1');
    assert.equal(r.detected_price, '32995');
  });
});

// ── Issues ────────────────────────────────────────────────────────────────────

describe('detectVehicleSignals — issues', () => {
  it('reports MISSING_VEHICLE_SCHEMA on inventory page without schema', () => {
    const r = detectVehicleSignals(wrap('<p>Nice car</p>'), 'https://dealer.com/inventory/1');
    assert.ok(r.issues.includes('MISSING_VEHICLE_SCHEMA'));
  });

  it('reports MISSING_VIN when no VIN on inventory page', () => {
    const r = detectVehicleSignals(wrap('<p>Nice car</p>'), 'https://dealer.com/inventory/1');
    assert.ok(r.issues.includes('MISSING_VIN'));
  });

  it('does not report issues on non-inventory pages', () => {
    const r = detectVehicleSignals(wrap('About us'), 'https://dealer.com/about');
    assert.equal(r.issues.length, 0);
  });

  it('never throws on malformed HTML', () => {
    const r = detectVehicleSignals('<<<not html>>>', 'not-a-url');
    assert.ok(r);
    assert.equal(r.is_inventory_page, false);
  });
});
