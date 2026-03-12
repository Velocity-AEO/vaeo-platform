/**
 * tools/reports/vehicle_report.test.ts
 *
 * Tests for vehicle report aggregator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVehicleSiteReport, type VehicleSiteReport } from './vehicle_report.js';

// ── Test HTML fixtures ──────────────────────────────────────────────────────

const INVENTORY_HTML = `<html><head><title>2024 Toyota Camry SE - Smith Motors</title></head>
<body>
  <h1>2024 Toyota Camry SE</h1>
  <p>Price: $28,995</p>
  <p>Mileage: 12,500 miles</p>
  <p>VIN: 4T1BZ1HK5RU123456</p>
  <p>Condition: Used</p>
  <p>Transmission: Automatic</p>
  <p>Fuel: Gasoline</p>
  <p>Body: Sedan</p>
  <img src="https://example.com/camry.jpg" alt="Camry" />
</body></html>`;

const INVENTORY_WITH_SCHEMA = `<html><head>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Vehicle","name":"2024 Toyota Camry","brand":{"@type":"Brand","name":"Toyota"},"model":"Camry","vehicleIdentificationNumber":"4T1BZ1HK5RU123456"}</script>
</head><body>
  <h1>2024 Toyota Camry SE</h1>
  <p>Price: $28,995</p>
  <p>VIN: 4T1BZ1HK5RU123456</p>
  <p>Mileage: 12,500 miles</p>
  <p>Condition: Used</p>
</body></html>`;

const INVENTORY_MINIMAL = `<html><body>
  <h1>2023 Ford F-150</h1>
  <p>Call for pricing</p>
</body></html>`;

const NON_INVENTORY_HTML = `<html><head><title>About Us - Smith Motors</title></head>
<body><h1>About Smith Motors</h1><p>We are a family-owned dealership.</p></body></html>`;

const EMPTY_HTML = '<html><body></body></html>';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildVehicleSiteReport — basic structure', () => {
  it('returns valid report structure', () => {
    const report = buildVehicleSiteReport('site-001', []);
    assert.equal(report.site_id, 'site-001');
    assert.equal(report.total_inventory_pages, 0);
    assert.equal(report.pages_with_schema, 0);
    assert.equal(report.pages_missing_schema, 0);
    assert.equal(report.schema_coverage_pct, 0);
    assert.deepStrictEqual(report.top_issues, []);
    assert.deepStrictEqual(report.pages, []);
  });

  it('handles empty page list', () => {
    const report = buildVehicleSiteReport('site-001', []);
    assert.equal(report.total_inventory_pages, 0);
    assert.equal(report.schema_coverage_pct, 0);
  });
});

describe('buildVehicleSiteReport — inventory detection', () => {
  it('detects inventory pages from URL patterns', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/123', html: INVENTORY_HTML },
      { url: 'https://dealer.com/about', html: NON_INVENTORY_HTML },
    ]);
    assert.equal(report.total_inventory_pages, 1);
    assert.equal(report.pages.length, 2);
  });

  it('detects inventory pages from content signals', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/vehicles/camry', html: INVENTORY_HTML },
    ]);
    assert.equal(report.total_inventory_pages, 1);
    assert.ok(report.pages[0].is_inventory_page);
  });

  it('marks non-inventory pages correctly', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/about', html: NON_INVENTORY_HTML },
    ]);
    assert.equal(report.total_inventory_pages, 0);
    assert.equal(report.pages[0].is_inventory_page, false);
  });
});

describe('buildVehicleSiteReport — schema detection', () => {
  it('detects existing Vehicle schema', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/camry', html: INVENTORY_WITH_SCHEMA },
    ]);
    assert.equal(report.pages_with_schema, 1);
    assert.equal(report.pages_missing_schema, 0);
    assert.equal(report.schema_coverage_pct, 100);
  });

  it('flags pages missing Vehicle schema', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/camry', html: INVENTORY_HTML },
    ]);
    assert.equal(report.pages_with_schema, 0);
    assert.equal(report.pages_missing_schema, 1);
    assert.equal(report.schema_coverage_pct, 0);
  });

  it('calculates coverage percentage correctly', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_WITH_SCHEMA },
      { url: 'https://dealer.com/inventory/2', html: INVENTORY_HTML },
      { url: 'https://dealer.com/about', html: NON_INVENTORY_HTML },
    ]);
    // 1 with schema out of 2 inventory pages = 50%
    assert.equal(report.total_inventory_pages, 2);
    assert.equal(report.schema_coverage_pct, 50);
  });
});

describe('buildVehicleSiteReport — vehicle data extraction', () => {
  it('extracts make, model, year from content', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_HTML },
    ]);
    const data = report.pages[0].vehicle_data;
    assert.equal(data.make, 'Toyota');
    assert.equal(data.model, 'Camry SE');
    assert.equal(data.year, '2024');
  });

  it('extracts VIN from content', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_HTML },
    ]);
    assert.equal(report.pages[0].vehicle_data.vin, '4T1BZ1HK5RU123456');
  });

  it('extracts price from content', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_HTML },
    ]);
    assert.equal(report.pages[0].vehicle_data.price, '28995');
  });
});

describe('buildVehicleSiteReport — issue classification', () => {
  it('classifies issues on inventory pages', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_HTML },
    ]);
    assert.ok(report.pages[0].issues.length > 0);
    // Should flag VEHICLE_SCHEMA_MISSING at minimum
    const schemaIssue = report.pages[0].issues.find(
      (i) => i.issue_type === 'VEHICLE_SCHEMA_MISSING'
    );
    assert.ok(schemaIssue);
  });

  it('does not classify issues on non-inventory pages', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/about', html: NON_INVENTORY_HTML },
    ]);
    assert.equal(report.pages[0].issues.length, 0);
  });

  it('aggregates top issues sorted by count', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_HTML },
      { url: 'https://dealer.com/inventory/2', html: INVENTORY_MINIMAL },
    ]);
    assert.ok(report.top_issues.length > 0);
    // Should be sorted desc by count
    for (let i = 1; i < report.top_issues.length; i++) {
      assert.ok(report.top_issues[i - 1].count >= report.top_issues[i].count);
    }
  });

  it('limits top_issues to 5', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: INVENTORY_HTML },
      { url: 'https://dealer.com/inventory/2', html: INVENTORY_MINIMAL },
    ]);
    assert.ok(report.top_issues.length <= 5);
  });
});

describe('buildVehicleSiteReport — resilience', () => {
  it('handles empty HTML without crashing', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: EMPTY_HTML },
    ]);
    assert.ok(report);
    assert.equal(report.pages.length, 1);
  });

  it('handles pages with malformed HTML', () => {
    const report = buildVehicleSiteReport('site-001', [
      { url: 'https://dealer.com/inventory/1', html: '<not valid html at all<<<>>>' },
    ]);
    assert.ok(report);
    assert.equal(report.pages.length, 1);
  });
});
