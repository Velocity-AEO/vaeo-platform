/**
 * apps/dashboard/lib/badge_display_logic.ts
 *
 * Display helpers for QA status badges. Never throws.
 */

import type { QAStatusDisplay } from './qa_status_logic.js';

// ── getFailedViewportsList ────────────────────────────────────────────────────

export function getFailedViewportsList(failed_viewports: string[]): string {
  try {
    const list = failed_viewports ?? [];
    if (list.length === 0) return 'none';
    return list.join(', ');
  } catch {
    return 'none';
  }
}

// ── getBadgeAriaLabel ─────────────────────────────────────────────────────────

export function getBadgeAriaLabel(display: QAStatusDisplay): string {
  try {
    if (!display) return 'QA status unknown';
    if (!display.qa_run) return 'QA not yet run';
    if (display.passed) return 'All viewports passed QA';
    const count = display.failed_viewports?.length ?? 0;
    return `${count} viewport${count !== 1 ? 's' : ''} failed QA`;
  } catch {
    return 'QA status unknown';
  }
}
