/**
 * apps/dashboard/lib/qa_status_logic.ts
 *
 * Display logic for viewport QA status badges. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ViewportQARecord {
  fix_id:           string;
  site_id:          string;
  url:              string;
  passed:           boolean;
  failed_viewports: string[];
  checked_at:       string;
  screenshots:      Record<string, string>;
}

export interface QAStatusDisplay {
  fix_id:           string;
  qa_run:           boolean;
  passed:           boolean | null;
  failed_viewports: string[];
  checked_at:       string | null;
  badge_color:      'green' | 'red' | 'grey';
  badge_label:      string;
}

// ── buildQAStatusDisplay ──────────────────────────────────────────────────────

export function buildQAStatusDisplay(
  record: ViewportQARecord | null,
): QAStatusDisplay {
  try {
    if (!record) {
      return {
        fix_id: '',
        qa_run: false,
        passed: null,
        failed_viewports: [],
        checked_at: null,
        badge_color: 'grey',
        badge_label: 'Not run',
      };
    }

    const failed = record.failed_viewports ?? [];

    if (record.passed) {
      return {
        fix_id: record.fix_id ?? '',
        qa_run: true,
        passed: true,
        failed_viewports: [],
        checked_at: record.checked_at ?? null,
        badge_color: 'green',
        badge_label: 'Passed',
      };
    }

    return {
      fix_id: record.fix_id ?? '',
      qa_run: true,
      passed: false,
      failed_viewports: failed,
      checked_at: record.checked_at ?? null,
      badge_color: 'red',
      badge_label: `Failed (${failed.length} viewport${failed.length !== 1 ? 's' : ''})`,
    };
  } catch {
    return {
      fix_id: '',
      qa_run: false,
      passed: null,
      failed_viewports: [],
      checked_at: null,
      badge_color: 'grey',
      badge_label: 'Not run',
    };
  }
}

// ── getQABadgeClasses ─────────────────────────────────────────────────────────

export function getQABadgeClasses(color: 'green' | 'red' | 'grey'): string {
  try {
    switch (color) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'grey':
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  } catch {
    return 'bg-slate-100 text-slate-500 border-slate-200';
  }
}
