/**
 * tools/reports/vehicle_report.ts
 *
 * Aggregates vehicle schema detection results across all pages
 * of a dealership site into a site-level report.
 *
 * Pure function. Never throws.
 */

import { detectVehicleSignals } from '../detect/vehicle_detect.js';
import { extractVehicleDataFromHtml, type VehicleData } from '../schema/vehicle_schema_generator.js';
import { classifyVehicleIssues, type VehicleIssue } from '../detect/vehicle_issue_classifier.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VehiclePageReport {
  url:                string;
  is_inventory_page:  boolean;
  has_vehicle_schema: boolean;
  issues:             VehicleIssue[];
  vehicle_data:       VehicleData;
  schema_generated:   boolean;
}

export interface VehicleSiteReport {
  site_id:              string;
  total_inventory_pages: number;
  pages_with_schema:    number;
  pages_missing_schema: number;
  schema_coverage_pct:  number;
  top_issues:           { type: string; count: number }[];
  pages:                VehiclePageReport[];
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Build a vehicle schema report for an entire site.
 *
 * Runs detectVehicleSignals and classifyVehicleIssues on each page,
 * aggregates results into site-level summary.
 *
 * Never throws — errors in individual pages are swallowed.
 */
export function buildVehicleSiteReport(
  site_id: string,
  pages: { url: string; html: string }[],
): VehicleSiteReport {
  const pageReports: VehiclePageReport[] = [];

  for (const page of pages) {
    try {
      const signals = detectVehicleSignals(page.html, page.url);
      const vehicleData = extractVehicleDataFromHtml(page.html, signals);
      const schemaExists = signals.has_vehicle_schema;
      const issues = signals.is_inventory_page
        ? classifyVehicleIssues(vehicleData, schemaExists, page.url)
        : [];

      pageReports.push({
        url:                page.url,
        is_inventory_page:  signals.is_inventory_page,
        has_vehicle_schema: schemaExists,
        issues,
        vehicle_data:       vehicleData,
        schema_generated:   false,
      });
    } catch {
      // Non-fatal — skip this page
      pageReports.push({
        url:                page.url,
        is_inventory_page:  false,
        has_vehicle_schema: false,
        issues:             [],
        vehicle_data:       emptyVehicleData(),
        schema_generated:   false,
      });
    }
  }

  // Filter to inventory pages for summary stats
  const inventoryPages = pageReports.filter((p) => p.is_inventory_page);
  const totalInventory = inventoryPages.length;
  const withSchema     = inventoryPages.filter((p) => p.has_vehicle_schema).length;
  const missingSchema  = totalInventory - withSchema;
  const coveragePct    = totalInventory > 0
    ? Math.round((withSchema / totalInventory) * 100)
    : 0;

  // Aggregate top issues
  const issueCounts = new Map<string, number>();
  for (const page of inventoryPages) {
    for (const issue of page.issues) {
      issueCounts.set(issue.issue_type, (issueCounts.get(issue.issue_type) ?? 0) + 1);
    }
  }
  const topIssues = [...issueCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    site_id,
    total_inventory_pages: totalInventory,
    pages_with_schema:     withSchema,
    pages_missing_schema:  missingSchema,
    schema_coverage_pct:   coveragePct,
    top_issues:            topIssues,
    pages:                 pageReports,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyVehicleData(): VehicleData {
  return {};
}
