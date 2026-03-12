/**
 * tools/schema/vehicle_schema_generator.test.ts
 *
 * Tests for vehicle schema generation and HTML extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateVehicleSchema,
  extractVehicleDataFromHtml,
  type VehicleData,
} from './vehicle_schema_generator.js';
import type { VehicleSignals } from '../detect/vehicle_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    make:  'Toyota',
    model: 'Camry',
    year:  '2024',
    vin:   '1HGCM82633A004352',
    price: '32000',
    condition: 'new',
    ...overrides,
  };
}

function makeSignals(overrides: Partial<VehicleSignals> = {}): VehicleSignals {
  return {
    has_vehicle_schema: false,
    has_price_schema:   false,
    is_inventory_page:  true,
    issues:             [],
    ...overrides,
  };
}

function wrap(body: string, head = ''): string {
  return `<html><head>${head}</head><body>${body}</body></html>`;
}

// ── generateVehicleSchema ─────────────────────────────────────────────────────

describe('generateVehicleSchema', () => {
  it('returns schema with @context and @type Car', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    assert.equal(schema['@context'], 'https://schema.org');
    assert.equal(schema['@type'], 'Car');
  });

  it('includes VIN as vehicleIdentificationNumber', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    assert.equal(schema.vehicleIdentificationNumber, '1HGCM82633A004352');
  });

  it('includes brand as Organization', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    const brand = schema.brand as Record<string, unknown>;
    assert.equal(brand['@type'], 'Organization');
    assert.equal(brand.name, 'Toyota');
  });

  it('includes model and vehicleModelDate', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    assert.equal(schema.model, 'Camry');
    assert.equal(schema.vehicleModelDate, '2024');
  });

  it('includes offers with price and currency', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    const offers = schema.offers as Record<string, unknown>;
    assert.equal(offers['@type'], 'Offer');
    assert.equal(offers.price, '32000');
    assert.equal(offers.priceCurrency, 'USD');
  });

  it('maps new condition to NewCondition in offers', () => {
    const schema = generateVehicleSchema(makeData({ condition: 'new' }), 'https://dealer.com/car/1');
    const offers = schema.offers as Record<string, unknown>;
    assert.equal(offers.itemCondition, 'https://schema.org/NewCondition');
  });

  it('maps used condition to UsedCondition', () => {
    const schema = generateVehicleSchema(makeData({ condition: 'used' }), 'https://dealer.com/car/1');
    const offers = schema.offers as Record<string, unknown>;
    assert.equal(offers.itemCondition, 'https://schema.org/UsedCondition');
  });

  it('maps certified condition to RefurbishedCondition', () => {
    const schema = generateVehicleSchema(makeData({ condition: 'certified' }), 'https://dealer.com/car/1');
    const offers = schema.offers as Record<string, unknown>;
    assert.equal(offers.itemCondition, 'https://schema.org/RefurbishedCondition');
  });

  it('includes mileageFromOdometer with SMI unit', () => {
    const schema = generateVehicleSchema(makeData({ mileage: '45000' }), 'https://dealer.com/car/1');
    const mileage = schema.mileageFromOdometer as Record<string, unknown>;
    assert.equal(mileage['@type'], 'QuantitativeValue');
    assert.equal(mileage.value, '45000');
    assert.equal(mileage.unitCode, 'SMI');
  });

  it('includes seller when dealer info provided', () => {
    const schema = generateVehicleSchema(
      makeData({ dealer_name: 'ABC Motors', dealer_url: 'https://abc.com' }),
      'https://abc.com/car/1',
    );
    const seller = schema.seller as Record<string, unknown>;
    assert.equal(seller['@type'], 'Organization');
    assert.equal(seller.name, 'ABC Motors');
  });

  it('omits undefined fields', () => {
    const schema = generateVehicleSchema({ make: 'Ford' }, 'https://dealer.com/car/1');
    assert.equal(schema.vehicleIdentificationNumber, undefined);
    assert.equal(schema.mileageFromOdometer, undefined);
    assert.equal(schema.offers, undefined);
  });

  it('includes trim as vehicleConfiguration', () => {
    const schema = generateVehicleSchema(makeData({ trim: 'XLE' }), 'https://dealer.com/car/1');
    assert.equal(schema.vehicleConfiguration, 'XLE');
  });

  it('includes fuel, transmission, body style', () => {
    const schema = generateVehicleSchema(
      makeData({ fuel_type: 'Hybrid', transmission: 'CVT', body_style: 'Sedan' }),
      'https://dealer.com/car/1',
    );
    assert.equal(schema.fuelType, 'Hybrid');
    assert.equal(schema.vehicleTransmission, 'CVT');
    assert.equal(schema.bodyType, 'Sedan');
  });

  it('builds name from year+make+model', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    assert.equal(schema.name, '2024 Toyota Camry');
  });

  it('includes page URL', () => {
    const schema = generateVehicleSchema(makeData(), 'https://dealer.com/car/1');
    assert.equal(schema.url, 'https://dealer.com/car/1');
  });
});

// ── extractVehicleDataFromHtml ────────────────────────────────────────────────

describe('extractVehicleDataFromHtml', () => {
  it('uses signals for VIN, make, model, year, price', () => {
    const signals = makeSignals({
      detected_vin:   'ABC12345678901234',
      detected_make:  'Honda',
      detected_model: 'Civic',
      detected_year:  '2023',
      detected_price: '28000',
    });
    const data = extractVehicleDataFromHtml(wrap(''), signals);
    assert.equal(data.vin, 'ABC12345678901234');
    assert.equal(data.make, 'Honda');
    assert.equal(data.model, 'Civic');
    assert.equal(data.year, '2023');
    assert.equal(data.price, '28000');
  });

  it('extracts description from meta tag', () => {
    const html = wrap('', '<meta name="description" content="Great sedan for sale">');
    const data = extractVehicleDataFromHtml(html, makeSignals());
    assert.equal(data.description, 'Great sedan for sale');
  });

  it('extracts image from og:image meta', () => {
    const html = wrap('', '<meta property="og:image" content="https://img.com/car.jpg">');
    const data = extractVehicleDataFromHtml(html, makeSignals());
    assert.equal(data.image_url, 'https://img.com/car.jpg');
  });

  it('detects used condition from body text', () => {
    const html = wrap('<p>This is a used vehicle</p>');
    const data = extractVehicleDataFromHtml(html, makeSignals());
    assert.equal(data.condition, 'used');
  });

  it('detects mileage from body text', () => {
    const html = wrap('<span>45,000 miles</span>');
    const data = extractVehicleDataFromHtml(html, makeSignals());
    assert.equal(data.mileage, '45000');
  });

  it('detects automatic transmission', () => {
    const html = wrap('<p>Automatic transmission</p>');
    const data = extractVehicleDataFromHtml(html, makeSignals());
    assert.equal(data.transmission, 'Automatic');
  });

  it('detects electric fuel type', () => {
    const html = wrap('<p>Fully electric vehicle</p>');
    const data = extractVehicleDataFromHtml(html, makeSignals());
    assert.equal(data.fuel_type, 'Electric');
  });
});
