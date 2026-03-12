/**
 * tools/apps/environment_learning_writer.ts
 *
 * Persists environment scan results to the learning center
 * as site metadata. Non-fatal — never throws.
 */

import type { EnvironmentScan } from './environment_scanner.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnvironmentLearningDeps {
  upsertSiteMeta: (
    site_id: string,
    key: string,
    value: unknown,
  ) => Promise<void>;
}

export interface EnvironmentWriteResult {
  written:   boolean;
  app_count: number;
}

// ── Writer ───────────────────────────────────────────────────────────────────

export async function writeEnvironmentScanToLearning(
  scan: EnvironmentScan,
  deps?: Partial<EnvironmentLearningDeps>,
): Promise<EnvironmentWriteResult> {
  try {
    if (!scan?.detected_apps || !deps?.upsertSiteMeta) {
      return { written: false, app_count: 0 };
    }

    const summary = {
      detected_apps: scan.detected_apps.map((a) => ({
        app_id:       a.fingerprint.app_id,
        name:         a.fingerprint.name,
        category:     a.fingerprint.category,
        confidence:   a.confidence,
        monthly_cost: a.estimated_monthly_cost,
      })),
      scanned_at:   scan.scanned_at,
      total_spend:  scan.estimated_monthly_spend,
      vaeo_savings: scan.vaeo_replacement_savings,
    };

    await deps.upsertSiteMeta(scan.site_id, 'environment_scan', summary);

    return { written: true, app_count: scan.detected_apps.length };
  } catch {
    return { written: false, app_count: 0 };
  }
}
