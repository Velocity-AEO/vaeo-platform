/**
 * tools/rollback/rollback_history.ts
 *
 * Rollback record construction, eligibility checks, and summaries.
 * Pure functions. Never throws.
 */

import type { RollbackResult, RollbackTarget } from './rollback_engine.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RollbackRecord {
  rollback_id:     string;
  fix_id:          string;
  site_id:         string;
  url:             string;
  signal_type:     string;
  original_value:  string | null;
  applied_value:   string;
  rolled_back_at:  string;
  initiated_by:    'client' | 'system';
  success:         boolean;
}

// ── buildRollbackRecord ───────────────────────────────────────────────────────

export function buildRollbackRecord(
  result:       RollbackResult,
  target:       RollbackTarget,
  initiated_by: 'client' | 'system',
): RollbackRecord {
  try {
    return {
      rollback_id:    `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fix_id:         result.fix_id,
      site_id:        result.site_id,
      url:            target.url,
      signal_type:    target.signal_type,
      original_value: target.original_value,
      applied_value:  target.applied_value,
      rolled_back_at: result.rolled_back_at,
      initiated_by,
      success:        result.success,
    };
  } catch {
    return {
      rollback_id:    `rb_err_${Date.now()}`,
      fix_id:         result.fix_id ?? '',
      site_id:        result.site_id ?? '',
      url:            target.url ?? '',
      signal_type:    target.signal_type ?? '',
      original_value: null,
      applied_value:  target.applied_value ?? '',
      rolled_back_at: new Date().toISOString(),
      initiated_by,
      success:        false,
    };
  }
}

// ── isRollbackAllowed ─────────────────────────────────────────────────────────

/**
 * Returns true when the fix is within max_age_hours of now.
 */
export function isRollbackAllowed(
  fix:           { applied_at: string },
  max_age_hours: number,
  now?:          Date,
): boolean {
  try {
    const ref = now ?? new Date();
    const appliedMs  = Date.parse(fix.applied_at);
    if (isNaN(appliedMs)) return false;
    const ageMs      = ref.getTime() - appliedMs;
    const maxMs      = max_age_hours * 60 * 60 * 1000;
    return ageMs <= maxMs;
  } catch {
    return false;
  }
}

// ── getRollbackBlockReason ────────────────────────────────────────────────────

/**
 * Returns null if rollback is allowed; otherwise a human-readable reason.
 */
export function getRollbackBlockReason(
  fix:           { applied_at: string; original_value: string | null },
  max_age_hours: number,
  now?:          Date,
): string | null {
  try {
    if (fix.original_value === null) {
      return 'No original value recorded for this fix';
    }
    if (!isRollbackAllowed(fix, max_age_hours, now)) {
      return `Fix is too old to roll back (max ${max_age_hours} hours)`;
    }
    return null;
  } catch {
    return 'Unable to determine rollback eligibility';
  }
}

// ── summarizeRollbacks ────────────────────────────────────────────────────────

export function summarizeRollbacks(records: RollbackRecord[]): {
  total:            number;
  successful:       number;
  failed:           number;
  client_initiated: number;
} {
  try {
    const arr = Array.isArray(records) ? records : [];
    return {
      total:            arr.length,
      successful:       arr.filter((r) => r.success).length,
      failed:           arr.filter((r) => !r.success).length,
      client_initiated: arr.filter((r) => r.initiated_by === 'client').length,
    };
  } catch {
    return { total: 0, successful: 0, failed: 0, client_initiated: 0 };
  }
}
