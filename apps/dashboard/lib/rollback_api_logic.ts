/**
 * apps/dashboard/lib/rollback_api_logic.ts
 *
 * Pure helpers for rollback UI and API layer.
 * Never throws.
 */

import { isRollbackAllowed } from '../../../tools/rollback/rollback_history.js';
import type { RollbackResult } from '../../../tools/rollback/rollback_engine.js';

const MAX_ROLLBACK_AGE_HOURS = 48;

// ── buildRollbackRequest ──────────────────────────────────────────────────────

/**
 * Builds the POST body for /api/sites/{siteId}/rollback.
 * Omits fix_id when null (triggers rollback of last fix).
 */
export function buildRollbackRequest(fix_id: string | null): { fix_id?: string } {
  try {
    if (fix_id === null || fix_id === undefined) return {};
    return { fix_id };
  } catch {
    return {};
  }
}

// ── getRollbackStatusMessage ──────────────────────────────────────────────────

export function getRollbackStatusMessage(result: RollbackResult): string {
  try {
    if (result.success) return 'Fix successfully rolled back';
    return `Rollback failed: ${result.error ?? 'Unknown error'}`;
  } catch {
    return 'Rollback failed: Unknown error';
  }
}

// ── canShowRollbackButton ─────────────────────────────────────────────────────

/**
 * Returns true only when the fix is within rollback window AND has an original value.
 */
export function canShowRollbackButton(
  fix: { applied_at: string; original_value: string | null },
): boolean {
  try {
    if (fix.original_value === null) return false;
    return isRollbackAllowed(fix, MAX_ROLLBACK_AGE_HOURS);
  } catch {
    return false;
  }
}
