/**
 * tools/pipeline/failure_tracker.ts
 *
 * Tracks consecutive fix failures per site and triggers suspension
 * when the threshold is crossed.
 * Never throws.
 */

import {
  shouldSuspend,
  buildSuspensionRecord,
  type SuspensionRecord,
} from './suspension_policy.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FailureTrackerDeps {
  getFailureCountFn?: (site_id: string) => Promise<number>;
  incrementFn?:       (site_id: string, error: string) => Promise<number>;
  suspendFn?:         (record: SuspensionRecord) => Promise<boolean>;
  notifyFn?:          (site_id: string, record: SuspensionRecord) => Promise<void>;
}

export interface SuccessTrackerDeps {
  resetFn?: (site_id: string) => Promise<void>;
}

export interface QueryDeps {
  queryFn?: (site_id: string) => Promise<number>;
}

export interface RecordFixFailureResult {
  consecutive_failures: number;
  suspended:            boolean;
  suspension?:          SuspensionRecord;
}

// ── In-memory fallback store (used when deps not injected) ────────────────────

const _memFailures = new Map<string, number>();

// ── recordFixFailure ──────────────────────────────────────────────────────────

/**
 * Increments the consecutive failure count for a site.
 * If shouldSuspend threshold reached, suspends the site and sends notification.
 * Never throws.
 */
export async function recordFixFailure(
  site_id: string,
  error:   string,
  deps?:   FailureTrackerDeps,
): Promise<RecordFixFailureResult> {
  try {
    const id = site_id ?? '';

    // Increment failure count
    let count: number;
    if (deps?.incrementFn) {
      count = await deps.incrementFn(id, error ?? '').catch(() => 1);
    } else {
      const prev = _memFailures.get(id) ?? 0;
      count = prev + 1;
      _memFailures.set(id, count);
    }

    if (!shouldSuspend(count)) {
      return { consecutive_failures: count, suspended: false };
    }

    // Build and persist suspension record
    const record = buildSuspensionRecord(id, count, 'consecutive_failures', error ?? null);

    if (deps?.suspendFn) {
      await deps.suspendFn(record).catch(() => false);
    }

    if (deps?.notifyFn) {
      await deps.notifyFn(id, record).catch(() => {});
    }

    return { consecutive_failures: count, suspended: true, suspension: record };
  } catch {
    return { consecutive_failures: 0, suspended: false };
  }
}

// ── recordFixSuccess ──────────────────────────────────────────────────────────

/**
 * Resets the consecutive failure count for a site to 0.
 * Clears any active auto-resume suspension.
 * Never throws.
 */
export async function recordFixSuccess(
  site_id: string,
  deps?:   SuccessTrackerDeps,
): Promise<void> {
  try {
    const id = site_id ?? '';

    if (deps?.resetFn) {
      await deps.resetFn(id).catch(() => {});
    } else {
      _memFailures.delete(id);
    }
  } catch {
    // non-fatal
  }
}

// ── getSiteFailureCount ───────────────────────────────────────────────────────

/**
 * Returns the current consecutive failure count for a site.
 * Returns 0 on any error.
 * Never throws.
 */
export async function getSiteFailureCount(
  site_id: string,
  deps?:   QueryDeps,
): Promise<number> {
  try {
    const id = site_id ?? '';

    if (deps?.queryFn) {
      return await deps.queryFn(id).catch(() => 0);
    }
    return _memFailures.get(id) ?? 0;
  } catch {
    return 0;
  }
}
