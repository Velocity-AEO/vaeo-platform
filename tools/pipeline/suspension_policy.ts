/**
 * tools/pipeline/suspension_policy.ts
 *
 * Pure constants and logic for pipeline suspension decisions.
 * Never throws.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const SUSPENSION_POLICY = {
  MAX_CONSECUTIVE_FAILURES:       3,
  SUSPENSION_DURATION_HOURS:      24,
  HARD_SUSPENSION_THRESHOLD:      10,
  HARD_SUSPENSION_DURATION_HOURS: 168,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuspensionReason =
  | 'consecutive_failures'
  | 'credential_invalid'
  | 'theme_conflict'
  | 'api_quota_exceeded'
  | 'manual';

export interface SuspensionRecord {
  site_id:              string;
  reason:               SuspensionReason;
  consecutive_failures: number;
  suspended_at:         string;
  resume_at:            string;
  is_hard_suspension:   boolean;
  last_error:           string | null;
  auto_resume:          boolean;
}

// ── shouldSuspend ─────────────────────────────────────────────────────────────

/**
 * Returns true if the site should be suspended based on consecutive failure count.
 * Never throws.
 */
export function shouldSuspend(consecutive_failures: number): boolean {
  try {
    return (consecutive_failures ?? 0) >= SUSPENSION_POLICY.MAX_CONSECUTIVE_FAILURES;
  } catch {
    return false;
  }
}

// ── getSuspensionDuration ─────────────────────────────────────────────────────

/**
 * Returns the suspension duration in hours.
 * Hard suspension (168h) when failures >= HARD_SUSPENSION_THRESHOLD.
 * Soft suspension (24h) otherwise.
 * Never throws.
 */
export function getSuspensionDuration(consecutive_failures: number): number {
  try {
    if ((consecutive_failures ?? 0) >= SUSPENSION_POLICY.HARD_SUSPENSION_THRESHOLD) {
      return SUSPENSION_POLICY.HARD_SUSPENSION_DURATION_HOURS;
    }
    return SUSPENSION_POLICY.SUSPENSION_DURATION_HOURS;
  } catch {
    return SUSPENSION_POLICY.SUSPENSION_DURATION_HOURS;
  }
}

// ── buildSuspensionRecord ─────────────────────────────────────────────────────

/**
 * Builds a SuspensionRecord from the given inputs.
 * Computes resume_at from now + duration.
 * Never throws.
 */
export function buildSuspensionRecord(
  site_id:              string,
  consecutive_failures: number,
  reason:               SuspensionReason,
  last_error:           string | null,
): SuspensionRecord {
  try {
    const now        = new Date();
    const durationH  = getSuspensionDuration(consecutive_failures ?? 0);
    const resumeMs   = now.getTime() + durationH * 60 * 60 * 1000;
    const resume_at  = new Date(resumeMs).toISOString();
    const is_hard    = (consecutive_failures ?? 0) >= SUSPENSION_POLICY.HARD_SUSPENSION_THRESHOLD;

    return {
      site_id:              site_id    ?? '',
      reason:               reason     ?? 'consecutive_failures',
      consecutive_failures: consecutive_failures ?? 0,
      suspended_at:         now.toISOString(),
      resume_at,
      is_hard_suspension:   is_hard,
      last_error:           last_error ?? null,
      auto_resume:          (reason ?? 'consecutive_failures') !== 'manual',
    };
  } catch {
    const fallback = new Date();
    return {
      site_id:              site_id ?? '',
      reason:               'consecutive_failures',
      consecutive_failures: 0,
      suspended_at:         fallback.toISOString(),
      resume_at:            new Date(fallback.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      is_hard_suspension:   false,
      last_error:           null,
      auto_resume:          true,
    };
  }
}
