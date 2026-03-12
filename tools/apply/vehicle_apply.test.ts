/**
 * tools/apply/vehicle_apply.test.ts
 *
 * Tests for vehicle schema apply — snippet building, fix routing, error handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVehicleFix,
  buildVehicleSnippet,
  type VehicleApplyDeps,
  type VehicleApplyResult,
} from './vehicle_apply.js';
import type { ApprovedItem } from './apply_engine.js';
import type { VehicleData } from '../schema/vehicle_schema_generator.js';
import type { VehicleSignals } from '../detect/vehicle_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ApprovedItem> = {}): ApprovedItem {
  return {
    id:               'item-1',
    run_id:           'run-1',
    tenant_id:        'tenant-1',
    site_id:          'site-1',
    issue_type:       'MISSING_VEHICLE_SCHEMA',
    url:              'https://dealer.com/inventory/123',
    risk_score:       1,
    priority:         1,
    proposed_fix:     {},
    execution_status: 'approved',
    ...overrides,
  };
}

function makeSignals(overrides: Partial<VehicleSignals> = {}): VehicleSignals {
  return {
    has_vehicle_schema: false,
    has_price_schema:   false,
    is_inventory_page:  true,
    issues:             ['MISSING_VEHICLE_SCHEMA'],
    detected_make:      'Toyota',
    detected_model:     'Camry',
    detected_year:      '2024',
    detected_price:     '32000',
    detected_vin:       '1HGCM82633A004352',
    ...overrides,
  };
}

function makeData(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    make:  'Toyota',
    model: 'Camry',
    year:  '2024',
    price: '32000',
    vin:   '1HGCM82633A004352',
    ...overrides,
  };
}

const CREDS = { access_token: 'token-123', store_url: 'https://myshop.myshopify.com' };

function makeDeps(overrides: Partial<VehicleApplyDeps> = {}): VehicleApplyDeps {
  return {
    fetchHTML:       async () => '<html><body>car page</body></html>',
    detectSignals:   () => makeSignals(),
    extractData:     () => makeData(),
    generateSchema:  (data, url) => ({ '@type': 'Car', '@context': 'https://schema.org', url, name: `${data.year} ${data.make} ${data.model}` }),
    writeSnippet:    async () => ({ success: true }),
    ...overrides,
  };
}

// ── buildVehicleSnippet ──────────────────────────────────────────────────────

describe('buildVehicleSnippet', () => {
  it('wraps schema in ld+json script tag', () => {
    const snippet = buildVehicleSnippet({ '@type': 'Car' });
    assert.ok(snippet.includes('<script type="application/ld+json">'));
    assert.ok(snippet.includes('</script>'));
  });

  it('includes VAEO comment', () => {
    const snippet = buildVehicleSnippet({ '@type': 'Car' });
    assert.ok(snippet.includes('VAEO Vehicle Schema'));
  });

  it('serializes schema as pretty JSON', () => {
    const snippet = buildVehicleSnippet({ '@type': 'Car', name: 'Test' });
    assert.ok(snippet.includes('"@type": "Car"'));
    assert.ok(snippet.includes('"name": "Test"'));
  });
});

// ── applyVehicleFix — success path ──────────────────────────────────────────

describe('applyVehicleFix — success', () => {
  it('returns success with schema_type Car', async () => {
    const result = await applyVehicleFix(makeItem(), CREDS, makeDeps());
    assert.equal(result.success, true);
    assert.equal(result.schema_type, 'Car');
    assert.equal(result.action, 'vehicle_schema');
  });

  it('returns snippet in result', async () => {
    const result = await applyVehicleFix(makeItem(), CREDS, makeDeps());
    assert.ok(result.snippet);
    assert.ok(result.snippet.includes('application/ld+json'));
  });

  it('calls writeSnippet with vaeo-vehicle-schema name', async () => {
    let capturedName = '';
    const deps = makeDeps({
      writeSnippet: async (_creds, _snippet, name) => {
        capturedName = name;
        return { success: true };
      },
    });
    await applyVehicleFix(makeItem(), CREDS, deps);
    assert.equal(capturedName, 'vaeo-vehicle-schema');
  });
});

// ── applyVehicleFix — proposed_fix overrides ────────────────────────────────

describe('applyVehicleFix — overrides', () => {
  it('merges proposed_fix fields into extracted data', async () => {
    let capturedData: VehicleData | undefined;
    const deps = makeDeps({
      generateSchema: (data, url) => {
        capturedData = data;
        return { '@type': 'Car', url };
      },
    });
    const item = makeItem({ proposed_fix: { make: 'Honda', model: 'Civic' } });
    await applyVehicleFix(item, CREDS, deps);
    assert.equal(capturedData?.make, 'Honda');
    assert.equal(capturedData?.model, 'Civic');
    // Extracted fields that weren't overridden remain
    assert.equal(capturedData?.year, '2024');
  });
});

// ── applyVehicleFix — error handling ────────────────────────────────────────

describe('applyVehicleFix — errors', () => {
  it('rejects non-vehicle issue types', async () => {
    const result = await applyVehicleFix(
      makeItem({ issue_type: 'title_fix' }),
      CREDS,
      makeDeps(),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Not a vehicle issue type'));
  });

  it('handles fetchHTML failure gracefully', async () => {
    const deps = makeDeps({
      fetchHTML: async () => { throw new Error('network down'); },
    });
    const result = await applyVehicleFix(makeItem(), CREDS, deps);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('network down'));
  });

  it('handles writeSnippet failure', async () => {
    const deps = makeDeps({
      writeSnippet: async () => ({ success: false, error: 'theme locked' }),
    });
    const result = await applyVehicleFix(makeItem(), CREDS, deps);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('theme locked'));
  });
});

// ── applyVehicleFix — all vehicle issue types ───────────────────────────────

describe('applyVehicleFix — issue types', () => {
  for (const issueType of [
    'MISSING_VEHICLE_SCHEMA',
    'VEHICLE_SCHEMA_MISSING',
    'MISSING_PRICE_SCHEMA',
    'VEHICLE_VIN_MISSING',
    'VEHICLE_PRICE_MISSING',
  ]) {
    it(`accepts ${issueType}`, async () => {
      const result = await applyVehicleFix(
        makeItem({ issue_type: issueType }),
        CREDS,
        makeDeps(),
      );
      assert.equal(result.success, true);
    });
  }
});
