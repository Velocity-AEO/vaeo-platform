/**
 * tools/apply/vehicle_apply.ts
 *
 * Vehicle schema fix applicator — generates schema.org/Car JSON-LD
 * from extracted vehicle data and writes it to the Shopify theme
 * as a Liquid snippet.
 *
 * Injectable deps for testing. Never throws.
 */

import type { ApprovedItem } from './apply_engine.js';
import type { VehicleData } from '../schema/vehicle_schema_generator.js';
import type { VehicleSignals } from '../detect/vehicle_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VehicleApplyResult {
  success:      boolean;
  action?:      string;
  schema_type?: string;
  snippet?:     string;
  error?:       string;
}

export interface VehicleApplyDeps {
  /** Fetch page HTML for data extraction. */
  fetchHTML: (url: string) => Promise<string>;
  /** Detect vehicle signals from HTML. */
  detectSignals: (html: string, url: string) => VehicleSignals;
  /** Extract vehicle data from HTML + signals. */
  extractData: (html: string, signals: VehicleSignals) => VehicleData;
  /** Generate schema.org/Car JSON-LD. */
  generateSchema: (data: VehicleData, url: string) => Record<string, unknown>;
  /** Write a Liquid snippet to the Shopify theme. */
  writeSnippet: (
    creds: { access_token: string; store_url: string },
    snippet: string,
    snippetName: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

// ── Snippet builder ─────────────────────────────────────────────────────────

export function buildVehicleSnippet(schema: Record<string, unknown>): string {
  const json = JSON.stringify(schema, null, 2);
  return `{% comment %}VAEO Vehicle Schema — auto-generated{% endcomment %}\n<script type="application/ld+json">\n${json}\n</script>`;
}

// ── Applicable issue types ──────────────────────────────────────────────────

const VEHICLE_ISSUE_TYPES = new Set([
  'MISSING_VEHICLE_SCHEMA',
  'VEHICLE_SCHEMA_MISSING',
  'MISSING_PRICE_SCHEMA',
  'VEHICLE_VIN_MISSING',
  'VEHICLE_PRICE_MISSING',
]);

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Apply a vehicle schema fix.
 *
 * 1. Fetch page HTML
 * 2. Detect signals + extract vehicle data
 * 3. Merge any proposed_fix overrides
 * 4. Generate schema.org/Car JSON-LD
 * 5. Build Liquid snippet
 * 6. Write to Shopify theme
 *
 * Never throws.
 */
export async function applyVehicleFix(
  item: ApprovedItem,
  creds: { access_token: string; store_url: string },
  deps: VehicleApplyDeps,
): Promise<VehicleApplyResult> {
  try {
    if (!VEHICLE_ISSUE_TYPES.has(item.issue_type)) {
      return { success: false, error: `Not a vehicle issue type: ${item.issue_type}` };
    }

    // 1. Fetch page HTML
    let html: string;
    try {
      html = await deps.fetchHTML(item.url);
    } catch (err) {
      return { success: false, error: `Failed to fetch ${item.url}: ${err instanceof Error ? err.message : String(err)}` };
    }

    // 2. Detect signals + extract data
    const signals = deps.detectSignals(html, item.url);
    const extracted = deps.extractData(html, signals);

    // 3. Merge proposed_fix overrides
    const data: VehicleData = { ...extracted };
    const fix = item.proposed_fix;
    if (fix['vin'])          data.vin          = fix['vin'] as string;
    if (fix['make'])         data.make         = fix['make'] as string;
    if (fix['model'])        data.model        = fix['model'] as string;
    if (fix['year'])         data.year         = fix['year'] as string;
    if (fix['price'])        data.price        = fix['price'] as string;
    if (fix['condition'])    data.condition     = fix['condition'] as VehicleData['condition'];
    if (fix['mileage'])      data.mileage      = fix['mileage'] as string;
    if (fix['trim'])         data.trim         = fix['trim'] as string;
    if (fix['dealer_name'])  data.dealer_name  = fix['dealer_name'] as string;
    if (fix['dealer_url'])   data.dealer_url   = fix['dealer_url'] as string;

    // 4. Generate schema
    const schema = deps.generateSchema(data, item.url);

    // 5. Build snippet
    const snippet = buildVehicleSnippet(schema);

    // 6. Write to Shopify
    const writeResult = await deps.writeSnippet(creds, snippet, 'vaeo-vehicle-schema');
    if (!writeResult.success) {
      return { success: false, action: 'vehicle_schema', error: writeResult.error };
    }

    return {
      success:     true,
      action:      'vehicle_schema',
      schema_type: 'Car',
      snippet,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
