/**
 * tools/optimize/timestamp_plan.ts
 *
 * Generates a plan of timestamp fixes for a page based on detected signals.
 *
 * Rules:
 *   - Missing signal → inject fix
 *   - Present but stale (> 7 days) → update fix
 *   - Present and recent → no fix
 *
 * Pure function — never throws.
 */

import type { TimestampSignals } from '../detect/timestamp_detect.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimestampFix {
  type:            'inject_jsonld_date_modified'
                 | 'update_jsonld_date_modified'
                 | 'inject_og_modified_time'
                 | 'update_og_modified_time';
  current_value?:  string;
  new_value:       string;
  target:          'jsonld' | 'og';
}

export interface TimestampPlan {
  site_id:   string;
  url:       string;
  fixes:     TimestampFix[];
  timestamp: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  // YYYY-MM-DDTHH:mm:ssZ (no milliseconds)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isStale(isoValue: string, now: Date): boolean {
  try {
    const t = Date.parse(isoValue);
    if (isNaN(t)) return true;
    return now.getTime() - t > STALE_THRESHOLD_MS;
  } catch {
    return true;
  }
}

// ── planTimestampFixes ────────────────────────────────────────────────────────

export function planTimestampFixes(
  site_id:  string,
  url:      string,
  _html:    string,
  signals:  TimestampSignals,
  now:      Date = new Date(),
): TimestampPlan {
  const fixes: TimestampFix[] = [];
  const newValue = toISO(now);
  const timestamp = toISO(now);

  try {
    // ── JSON-LD dateModified ────────────────────────────────────────────────
    if (!signals.has_jsonld_date_modified) {
      fixes.push({
        type:      'inject_jsonld_date_modified',
        new_value: newValue,
        target:    'jsonld',
      });
    } else if (
      signals.current_date_modified &&
      isStale(signals.current_date_modified, now)
    ) {
      fixes.push({
        type:          'update_jsonld_date_modified',
        current_value: signals.current_date_modified,
        new_value:     newValue,
        target:        'jsonld',
      });
    }

    // ── OG article:modified_time ────────────────────────────────────────────
    if (!signals.has_og_modified_time) {
      fixes.push({
        type:      'inject_og_modified_time',
        new_value: newValue,
        target:    'og',
      });
    } else if (
      signals.current_og_modified_time &&
      isStale(signals.current_og_modified_time, now)
    ) {
      fixes.push({
        type:          'update_og_modified_time',
        current_value: signals.current_og_modified_time,
        new_value:     newValue,
        target:        'og',
      });
    }
  } catch {
    // Non-fatal
  }

  return { site_id, url, fixes, timestamp };
}
