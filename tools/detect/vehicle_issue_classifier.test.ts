/**
 * tools/detect/vehicle_issue_classifier.test.ts
 *
 * Tests for vehicle issue classification — severity, conditions, sorting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVehicleIssues,
  type VehicleIssue,
} from './vehicle_issue_classifier.js';
import type { VehicleData } from '../schema/vehicle_schema_generator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullData(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    vin:       '1HGCM82633A004352',
    make:      'Toyota',
    model:     'Camry',
    year:      '2024',
    price:     '32000',
    condition: 'new',
    mileage:   '0',
    image_url: 'https://img.com/car.jpg',
    ...overrides,
  };
}

const URL = 'https://dealer.com/inventory/123';

function issueTypes(issues: VehicleIssue[]): string[] {
  return issues.map((i) => i.issue_type);
}

// ── No issues when data is complete ──────────────────────────────────────────

describe('classifyVehicleIssues — complete data', () => {
  it('returns no issues when all data present and schema exists', () => {
    const issues = classifyVehicleIssues(fullData(), true, URL);
    assert.equal(issues.length, 0);
  });
});

// ── Schema missing ──────────────────────────────────────────────────────────

describe('classifyVehicleIssues — schema missing', () => {
  it('reports VEHICLE_SCHEMA_MISSING when hasSchema is false', () => {
    const issues = classifyVehicleIssues(fullData(), false, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_SCHEMA_MISSING'));
  });

  it('marks schema missing as critical severity', () => {
    const issues = classifyVehicleIssues(fullData(), false, URL);
    const schema = issues.find((i) => i.issue_type === 'VEHICLE_SCHEMA_MISSING');
    assert.equal(schema?.severity, 'critical');
  });

  it('does not report VEHICLE_SCHEMA_MISSING when hasSchema is true', () => {
    const issues = classifyVehicleIssues(fullData(), true, URL);
    assert.ok(!issueTypes(issues).includes('VEHICLE_SCHEMA_MISSING'));
  });
});

// ── VIN missing ──────────────────────────────────────────────────────────────

describe('classifyVehicleIssues — VIN missing', () => {
  it('reports VEHICLE_VIN_MISSING when vin is absent', () => {
    const issues = classifyVehicleIssues(fullData({ vin: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_VIN_MISSING'));
  });

  it('marks VIN missing as major severity', () => {
    const issues = classifyVehicleIssues(fullData({ vin: undefined }), true, URL);
    const vin = issues.find((i) => i.issue_type === 'VEHICLE_VIN_MISSING');
    assert.equal(vin?.severity, 'major');
  });
});

// ── Price missing ────────────────────────────────────────────────────────────

describe('classifyVehicleIssues — price missing', () => {
  it('reports VEHICLE_PRICE_MISSING when price is absent', () => {
    const issues = classifyVehicleIssues(fullData({ price: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_PRICE_MISSING'));
  });
});

// ── Make/model missing ──────────────────────────────────────────────────────

describe('classifyVehicleIssues — make/model', () => {
  it('reports VEHICLE_MAKE_MISSING when make is absent', () => {
    const issues = classifyVehicleIssues(fullData({ make: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_MAKE_MISSING'));
  });

  it('reports VEHICLE_MODEL_MISSING when model is absent', () => {
    const issues = classifyVehicleIssues(fullData({ model: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_MODEL_MISSING'));
  });
});

// ── Year missing ─────────────────────────────────────────────────────────────

describe('classifyVehicleIssues — year', () => {
  it('reports VEHICLE_YEAR_MISSING when year is absent', () => {
    const issues = classifyVehicleIssues(fullData({ year: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_YEAR_MISSING'));
  });

  it('marks year missing as minor severity', () => {
    const issues = classifyVehicleIssues(fullData({ year: undefined }), true, URL);
    const year = issues.find((i) => i.issue_type === 'VEHICLE_YEAR_MISSING');
    assert.equal(year?.severity, 'minor');
  });
});

// ── Mileage missing (conditional) ───────────────────────────────────────────

describe('classifyVehicleIssues — mileage', () => {
  it('reports VEHICLE_MILEAGE_MISSING on used vehicle without mileage', () => {
    const issues = classifyVehicleIssues(
      fullData({ mileage: undefined, condition: 'used' }),
      true,
      URL,
    );
    assert.ok(issueTypes(issues).includes('VEHICLE_MILEAGE_MISSING'));
  });

  it('reports VEHICLE_MILEAGE_MISSING on certified vehicle without mileage', () => {
    const issues = classifyVehicleIssues(
      fullData({ mileage: undefined, condition: 'certified' }),
      true,
      URL,
    );
    assert.ok(issueTypes(issues).includes('VEHICLE_MILEAGE_MISSING'));
  });

  it('does NOT report mileage missing on new vehicle without mileage', () => {
    const issues = classifyVehicleIssues(
      fullData({ mileage: undefined, condition: 'new' }),
      true,
      URL,
    );
    assert.ok(!issueTypes(issues).includes('VEHICLE_MILEAGE_MISSING'));
  });
});

// ── Condition missing ───────────────────────────────────────────────────────

describe('classifyVehicleIssues — condition', () => {
  it('reports VEHICLE_CONDITION_MISSING when condition is absent', () => {
    const issues = classifyVehicleIssues(fullData({ condition: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_CONDITION_MISSING'));
  });
});

// ── Image missing ────────────────────────────────────────────────────────────

describe('classifyVehicleIssues — image', () => {
  it('reports VEHICLE_IMAGE_MISSING when image_url is absent', () => {
    const issues = classifyVehicleIssues(fullData({ image_url: undefined }), true, URL);
    assert.ok(issueTypes(issues).includes('VEHICLE_IMAGE_MISSING'));
  });
});

// ── Sorting ──────────────────────────────────────────────────────────────────

describe('classifyVehicleIssues — sorting', () => {
  it('sorts critical before major before minor', () => {
    // no schema (critical), no vin (major), no year (minor)
    const issues = classifyVehicleIssues(
      fullData({ vin: undefined, year: undefined }),
      false,
      URL,
    );
    assert.ok(issues.length >= 3);
    assert.equal(issues[0]!.severity, 'critical');
    const lastIssue = issues[issues.length - 1]!;
    assert.equal(lastIssue.severity, 'minor');
  });
});

// ── URL passthrough ─────────────────────────────────────────────────────────

describe('classifyVehicleIssues — metadata', () => {
  it('includes the URL in every issue', () => {
    const issues = classifyVehicleIssues({}, false, 'https://example.com/vdp/1');
    assert.ok(issues.length > 0);
    for (const issue of issues) {
      assert.equal(issue.url, 'https://example.com/vdp/1');
    }
  });

  it('includes details and fix_hint in every issue', () => {
    const issues = classifyVehicleIssues({}, false, URL);
    for (const issue of issues) {
      assert.ok(issue.details.length > 0);
      assert.ok(issue.fix_hint.length > 0);
    }
  });
});
