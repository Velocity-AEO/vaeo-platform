/**
 * tools/viewport/viewport_qa_record.ts
 *
 * Viewport QA record persistence model. Never throws.
 */

import type { ViewportQAResult } from './viewport_qa_gate.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ViewportQARecord {
  fix_id:           string;
  site_id:          string;
  url:              string;
  passed:           boolean;
  failed_viewports: string[];
  checked_at:       string;
  viewport_count:   number;
}

export interface QARecordSummary {
  total:     number;
  passed:    number;
  failed:    number;
  pass_rate: number;
}

// ── buildQARecord ────────────────────────────────────────────────────────────

export function buildQARecord(result: ViewportQAResult): ViewportQARecord {
  try {
    return {
      fix_id:           result.fix_id ?? '',
      site_id:          result.site_id ?? '',
      url:              result.pair?.url ?? '',
      passed:           result.passed ?? false,
      failed_viewports: result.failed_viewports ?? [],
      checked_at:       result.qa_at ?? new Date().toISOString(),
      viewport_count:   (result.pair?.before?.length ?? 0) + (result.pair?.after?.length ?? 0),
    };
  } catch {
    return {
      fix_id: '',
      site_id: '',
      url: '',
      passed: false,
      failed_viewports: [],
      checked_at: new Date().toISOString(),
      viewport_count: 0,
    };
  }
}

// ── isQARecordStale ──────────────────────────────────────────────────────────

export function isQARecordStale(
  record: ViewportQARecord,
  max_age_hours: number,
): boolean {
  try {
    const checked = new Date(record.checked_at).getTime();
    if (isNaN(checked)) return true;
    const age_ms = Date.now() - checked;
    return age_ms > max_age_hours * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

// ── summarizeQARecords ───────────────────────────────────────────────────────

export function summarizeQARecords(records: ViewportQARecord[]): QARecordSummary {
  try {
    const arr = records ?? [];
    const total = arr.length;
    if (total === 0) {
      return { total: 0, passed: 0, failed: 0, pass_rate: 0 };
    }
    const passed = arr.filter((r) => r.passed).length;
    const failed = total - passed;
    const pass_rate = Math.round((passed / total) * 100);
    return { total, passed, failed, pass_rate };
  } catch {
    return { total: 0, passed: 0, failed: 0, pass_rate: 0 };
  }
}
