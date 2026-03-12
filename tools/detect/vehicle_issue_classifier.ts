/**
 * tools/detect/vehicle_issue_classifier.ts
 *
 * Classifies vehicle-specific SEO issues for automotive
 * inventory pages. Checks for missing schema fields,
 * incomplete vehicle data, and optimization opportunities.
 *
 * Pure function. Never throws.
 */

import { type VehicleData } from '../schema/vehicle_schema_generator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type VehicleIssueType =
  | 'VEHICLE_SCHEMA_MISSING'
  | 'VEHICLE_VIN_MISSING'
  | 'VEHICLE_PRICE_MISSING'
  | 'VEHICLE_MAKE_MISSING'
  | 'VEHICLE_MODEL_MISSING'
  | 'VEHICLE_YEAR_MISSING'
  | 'VEHICLE_MILEAGE_MISSING'
  | 'VEHICLE_CONDITION_MISSING'
  | 'VEHICLE_IMAGE_MISSING'
  | 'VEHICLE_OFFERS_MISSING';

export type VehicleIssueSeverity = 'critical' | 'major' | 'minor';

export interface VehicleIssue {
  issue_type: VehicleIssueType;
  severity:   VehicleIssueSeverity;
  url:        string;
  details:    string;
  fix_hint:   string;
}

// ── Issue definitions ───────────────────────────────────────────────────────

interface IssueDef {
  type:     VehicleIssueType;
  severity: VehicleIssueSeverity;
  check:    (data: VehicleData, hasSchema: boolean) => boolean;
  details:  string;
  fix_hint: string;
}

const ISSUE_DEFS: IssueDef[] = [
  {
    type: 'VEHICLE_SCHEMA_MISSING',
    severity: 'critical',
    check: (_data, hasSchema) => !hasSchema,
    details: 'No Vehicle schema found — search engines cannot identify this as a vehicle listing',
    fix_hint: 'Add <script type="application/ld+json"> with @type: Vehicle schema',
  },
  {
    type: 'VEHICLE_VIN_MISSING',
    severity: 'major',
    check: (data) => !data.vin,
    details: 'Vehicle Identification Number (VIN) not detected — limits Google vehicle rich results',
    fix_hint: 'Include the 17-character VIN in the page content and Vehicle schema',
  },
  {
    type: 'VEHICLE_PRICE_MISSING',
    severity: 'major',
    check: (data) => !data.price,
    details: 'No price detected — vehicle listings without price have lower click-through rates',
    fix_hint: 'Add price to the page content and include Offer schema with price',
  },
  {
    type: 'VEHICLE_MAKE_MISSING',
    severity: 'major',
    check: (data) => !data.make,
    details: 'Vehicle make not detected — search engines need brand for rich results',
    fix_hint: 'Include the vehicle make (e.g. Toyota, Ford) in page title and content',
  },
  {
    type: 'VEHICLE_MODEL_MISSING',
    severity: 'major',
    check: (data) => !data.model,
    details: 'Vehicle model not detected — model name is required for vehicle rich results',
    fix_hint: 'Include the vehicle model name in page title and content',
  },
  {
    type: 'VEHICLE_YEAR_MISSING',
    severity: 'minor',
    check: (data) => !data.year,
    details: 'Vehicle year not detected — year helps searchers find specific model years',
    fix_hint: 'Include the model year in the page title and Vehicle schema',
  },
  {
    type: 'VEHICLE_MILEAGE_MISSING',
    severity: 'minor',
    check: (data) => !data.mileage && (data.condition === 'used' || data.condition === 'certified'),
    details: 'Mileage not detected on used vehicle — mileage is a key factor for used car shoppers',
    fix_hint: 'Include mileage in page content and mileageFromOdometer in Vehicle schema',
  },
  {
    type: 'VEHICLE_CONDITION_MISSING',
    severity: 'minor',
    check: (data) => !data.condition,
    details: 'Vehicle condition (new/used/certified) not detected',
    fix_hint: 'Include condition in page content and itemCondition in Vehicle schema',
  },
  {
    type: 'VEHICLE_IMAGE_MISSING',
    severity: 'minor',
    check: (data) => !data.image_url,
    details: 'No vehicle image detected — listings with images get significantly more engagement',
    fix_hint: 'Add vehicle photos and include image URL in Vehicle schema',
  },
  {
    type: 'VEHICLE_OFFERS_MISSING',
    severity: 'major',
    check: (data) => !!data.price && !data.vin,
    details: 'Price found but incomplete Offer schema — add VIN and availability for rich results',
    fix_hint: 'Add complete Offer schema with price, availability, and VIN',
  },
];

// ── Main classifier ─────────────────────────────────────────────────────────

/**
 * Classify vehicle-specific issues for an inventory page.
 *
 * @param data - Extracted vehicle data from the page
 * @param hasSchema - Whether the page already has Vehicle JSON-LD
 * @param url - Page URL for issue reporting
 * @returns Array of issues sorted by severity (critical > major > minor)
 */
export function classifyVehicleIssues(
  data: VehicleData,
  hasSchema: boolean,
  url: string,
): VehicleIssue[] {
  const severityOrder: Record<VehicleIssueSeverity, number> = {
    critical: 3,
    major: 2,
    minor: 1,
  };

  const issues: VehicleIssue[] = [];

  for (const def of ISSUE_DEFS) {
    if (def.check(data, hasSchema)) {
      issues.push({
        issue_type: def.type,
        severity:   def.severity,
        url,
        details:    def.details,
        fix_hint:   def.fix_hint,
      });
    }
  }

  issues.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  return issues;
}
