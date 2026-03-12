/**
 * tools/debug/html_snapshot.ts
 *
 * Captures and diffs HTML snapshots for debug events.
 * Pure — no I/O. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotDiff {
  before:         string;
  after:          string;
  changed_lines:  number;
  added_lines:    number;
  removed_lines:  number;
  change_summary: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SNAPSHOT_CHARS = 50_000;
const TRUNCATION_MARKER  = '\n<!-- [snapshot truncated] -->';

// ── captureSnapshot ───────────────────────────────────────────────────────────

/**
 * Returns a trimmed copy of html, truncated to 50,000 chars if needed.
 */
export function captureSnapshot(html: string): string {
  try {
    if (!html || typeof html !== 'string') return '';
    const trimmed = html.trim();
    if (trimmed.length <= MAX_SNAPSHOT_CHARS) return trimmed;
    return trimmed.slice(0, MAX_SNAPSHOT_CHARS) + TRUNCATION_MARKER;
  } catch {
    return '';
  }
}

// ── diffSnapshots ─────────────────────────────────────────────────────────────

/**
 * Compute a line-level diff between before and after HTML snapshots.
 */
export function diffSnapshots(before: string, after: string): SnapshotDiff {
  try {
    const beforeLines = (before ?? '').split('\n');
    const afterLines  = (after  ?? '').split('\n');

    const beforeSet = new Set(beforeLines);
    const afterSet  = new Set(afterLines);

    let added   = 0;
    let removed = 0;

    for (const line of afterLines) {
      if (!beforeSet.has(line)) added++;
    }
    for (const line of beforeLines) {
      if (!afterSet.has(line)) removed++;
    }

    const changed = added + removed;
    const change_summary = changed === 0
      ? 'No changes detected'
      : `${changed} lines changed (${added} added, ${removed} removed)`;

    return {
      before,
      after,
      changed_lines:  changed,
      added_lines:    added,
      removed_lines:  removed,
      change_summary,
    };
  } catch {
    return {
      before:        before ?? '',
      after:         after  ?? '',
      changed_lines:  0,
      added_lines:    0,
      removed_lines:  0,
      change_summary: 'No changes detected',
    };
  }
}

// ── shouldCaptureSnapshot ─────────────────────────────────────────────────────

/**
 * Returns true only when debug_mode is true AND the event_type
 * is 'fix_applied' or 'fix_failed'.
 */
export function shouldCaptureSnapshot(event_type: string, debug_mode: boolean): boolean {
  try {
    if (!debug_mode) return false;
    return event_type === 'fix_applied' || event_type === 'fix_failed';
  } catch {
    return false;
  }
}
