// tools/qa/qa_check.ts — QA check interfaces and report builder
// The guidance counselor: knows what should be running, flags what isn't.
// Never throws.

// ── Types ────────────────────────────────────────────────────────────────────

export type QACheckCategory =
  | 'pipeline'
  | 'data'
  | 'integration'
  | 'configuration'
  | 'security';

export type QACheckSeverity = 'blocker' | 'warning' | 'info';

export interface QACheck {
  check_id: string;
  name: string;
  description: string;
  category: QACheckCategory;
  severity: QACheckSeverity;
  run: (deps?: Record<string, unknown>) => Promise<QACheckResult>;
}

export interface QACheckResult {
  check_id: string;
  name: string;
  category: QACheckCategory;
  severity: QACheckSeverity;
  passed: boolean;
  message: string;
  detail?: string;
  recommendation?: string;
  checked_at: string;
}

export interface QAReport {
  report_id: string;
  site_id?: string;
  passed: boolean;
  blocker_count: number;
  warning_count: number;
  info_count: number;
  passed_count: number;
  failed_count: number;
  results: QACheckResult[];
  summary: string;
  generated_at: string;
  duration_ms: number;
}

// ── Report builder ──────────────────────────────────────────────────────────

export function buildQAReport(
  results: QACheckResult[],
  report_id: string,
  started_at: number,
  site_id?: string,
): QAReport {
  const failed = results.filter((r) => !r.passed);
  const blockers = failed.filter((r) => r.severity === 'blocker');
  const warnings = failed.filter((r) => r.severity === 'warning');
  const infos = failed.filter((r) => r.severity === 'info');
  const passedResults = results.filter((r) => r.passed);

  let summary: string;
  if (failed.length === 0) {
    summary = `All ${results.length} QA checks passed.`;
  } else if (blockers.length > 0) {
    const names = blockers.map((b) => b.name).join(', ');
    summary = `${blockers.length} blocker(s) must be resolved before going live: ${names}`;
  } else {
    const names = warnings.map((w) => w.name).join(', ');
    summary = `${warnings.length} warning(s): ${names}`;
  }

  return {
    report_id,
    site_id,
    passed: blockers.length === 0,
    blocker_count: blockers.length,
    warning_count: warnings.length,
    info_count: infos.length,
    passed_count: passedResults.length,
    failed_count: failed.length,
    results,
    summary,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started_at,
  };
}
