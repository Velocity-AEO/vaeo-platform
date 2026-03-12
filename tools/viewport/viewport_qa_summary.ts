/**
 * tools/viewport/viewport_qa_summary.ts
 *
 * Aggregates viewport QA results into a site-level summary. Never throws.
 */

import type { ViewportQARecord } from './viewport_qa_orchestrator.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ViewportQASummary {
  site_id:               string;
  total_fixes_with_qa:   number;
  passed:                number;
  failed:                number;
  pass_rate:             number;        // 0-100
  most_failed_viewport:  string | null;
  last_qa_at:            string | null;
}

// ── getMostFailedViewport ─────────────────────────────────────────────────────

export function getMostFailedViewport(records: ViewportQARecord[]): string | null {
  try {
    const list = records ?? [];
    const counts: Record<string, number> = {};

    for (const r of list) {
      for (const v of (r.failed_viewports ?? [])) {
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }

    const entries = Object.entries(counts);
    if (entries.length === 0) return null;

    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  } catch {
    return null;
  }
}

// ── buildViewportQASummary ────────────────────────────────────────────────────

export function buildViewportQASummary(
  site_id: string,
  records: ViewportQARecord[],
): ViewportQASummary {
  try {
    const list = records ?? [];
    const total = list.length;
    const passed = list.filter(r => r.passed).length;
    const failed = total - passed;
    const pass_rate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Find last QA timestamp
    let last_qa_at: string | null = null;
    for (const r of list) {
      if (r.checked_at && (!last_qa_at || r.checked_at > last_qa_at)) {
        last_qa_at = r.checked_at;
      }
    }

    return {
      site_id: site_id ?? '',
      total_fixes_with_qa: total,
      passed,
      failed,
      pass_rate,
      most_failed_viewport: getMostFailedViewport(list),
      last_qa_at,
    };
  } catch {
    return {
      site_id: site_id ?? '',
      total_fixes_with_qa: 0,
      passed: 0,
      failed: 0,
      pass_rate: 0,
      most_failed_viewport: null,
      last_qa_at: null,
    };
  }
}
