/**
 * tools/rollback/rollback_window_matrix.ts
 *
 * Per-fix-type rollback window configuration.
 * High SEO impact fixes get longer windows. Never throws.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_ROLLBACK_WINDOW_HOURS: number = 48;

/**
 * Rollback window in hours per issue type.
 *
 * 168 hours (7 days) — high SEO impact, slow to manifest
 * 120 hours (5 days) — medium impact, moderate observation
 *  48 hours          — safe, fast to verify
 */
export const ROLLBACK_WINDOWS: Record<string, number> = {
  // 7 days — high SEO impact
  SCHEMA_MISSING:   168,
  SCHEMA_INVALID:   168,
  CANONICAL_MISSING: 168,
  CANONICAL_WRONG:  168,
  ROBOTS_NOINDEX:   168,
  HREFLANG_MISSING: 168,
  HREFLANG_WRONG:   168,

  // 5 days — medium impact
  OG_MISSING: 120,
  OG_TITLE:   120,
  OG_DESC:    120,

  // 48 hours — safe, fast to verify
  TITLE_MISSING:      48,
  TITLE_LONG:         48,
  TITLE_SHORT:        48,
  META_DESC_MISSING:  48,
  META_DESC_LONG:     48,
  ALT_MISSING:        48,
  SPEAKABLE_MISSING:  48,
  ORPHANED_PAGE:      48,
};

// ── Functions ────────────────────────────────────────────────────────────────

export function getRollbackWindowHours(issue_type: string): number {
  try {
    const key = (issue_type ?? '').toUpperCase();
    return ROLLBACK_WINDOWS[key] ?? DEFAULT_ROLLBACK_WINDOW_HOURS;
  } catch {
    return DEFAULT_ROLLBACK_WINDOW_HOURS;
  }
}

export function getRollbackWindowLabel(issue_type: string): string {
  try {
    const hours = getRollbackWindowHours(issue_type);
    if (hours === 168) return '7 days';
    if (hours === 120) return '5 days';
    if (hours === 48)  return '48 hours';
    return `${hours} hours`;
  } catch {
    return '48 hours';
  }
}

export function calculateRollbackDeadline(
  applied_at: string,
  issue_type: string,
): string {
  try {
    const ms = Date.parse(applied_at);
    if (isNaN(ms)) return new Date().toISOString();
    const hours = getRollbackWindowHours(issue_type);
    return new Date(ms + hours * 60 * 60 * 1000).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function isWithinRollbackWindow(
  applied_at: string,
  issue_type: string,
  now?: string,
): boolean {
  try {
    const appliedMs = Date.parse(applied_at);
    if (isNaN(appliedMs)) return false;
    const nowMs = now ? Date.parse(now) : Date.now();
    if (isNaN(nowMs)) return false;
    const hours = getRollbackWindowHours(issue_type);
    const deadlineMs = appliedMs + hours * 60 * 60 * 1000;
    return nowMs <= deadlineMs;
  } catch {
    return false;
  }
}

export interface TimeRemaining {
  hours:   number;
  minutes: number;
  expired: boolean;
  label:   string;
}

export function getTimeRemainingInWindow(
  applied_at: string,
  issue_type: string,
  now?: string,
): TimeRemaining {
  try {
    const appliedMs = Date.parse(applied_at);
    if (isNaN(appliedMs)) return { hours: 0, minutes: 0, expired: true, label: 'Rollback window expired' };
    const nowMs = now ? Date.parse(now) : Date.now();
    if (isNaN(nowMs)) return { hours: 0, minutes: 0, expired: true, label: 'Rollback window expired' };

    const hours = getRollbackWindowHours(issue_type);
    const deadlineMs = appliedMs + hours * 60 * 60 * 1000;
    const remainingMs = deadlineMs - nowMs;

    if (remainingMs <= 0) {
      return { hours: 0, minutes: 0, expired: true, label: 'Rollback window expired' };
    }

    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const remainingHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    let label: string;
    if (remainingHours >= 24) {
      const days = Math.floor(remainingHours / 24);
      const leftoverHours = remainingHours % 24;
      label = leftoverHours > 0
        ? `${days} day${days !== 1 ? 's' : ''}, ${leftoverHours} hour${leftoverHours !== 1 ? 's' : ''} remaining`
        : `${days} day${days !== 1 ? 's' : ''} remaining`;
    } else if (remainingHours > 0) {
      label = `${remainingHours} hour${remainingHours !== 1 ? 's' : ''} remaining`;
    } else {
      label = `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} remaining`;
    }

    return { hours: remainingHours, minutes: remainingMinutes, expired: false, label };
  } catch {
    return { hours: 0, minutes: 0, expired: true, label: 'Rollback window expired' };
  }
}
