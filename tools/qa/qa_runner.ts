// tools/qa/qa_runner.ts — QA suite runner
// Runs all QA checks concurrently and builds a report. Never throws.

import type { QACheck, QACheckResult, QAReport } from './qa_check.js';
import { buildQAReport } from './qa_check.js';
import { QA_CHECKS } from './qa_checks_library.js';

// ── Runner ──────────────────────────────────────────────────────────────────

export async function runQASuite(
  site_id?: string,
  deps?: {
    checks?: QACheck[];
    storeReport?: (report: QAReport) => Promise<void>;
  },
): Promise<QAReport> {
  const checks = deps?.checks ?? QA_CHECKS;
  const startedAt = Date.now();
  const reportId = `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const settled = await Promise.allSettled(
    checks.map((check) => check.run()),
  );

  const results: QACheckResult[] = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      return outcome.value;
    }
    // Rejected check → treat as failure
    const check = checks[i];
    return {
      check_id: check.check_id,
      name: check.name,
      category: check.category,
      severity: check.severity,
      passed: false,
      message: `Check threw: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`,
      checked_at: new Date().toISOString(),
    };
  });

  const report = buildQAReport(results, reportId, startedAt, site_id);

  if (deps?.storeReport) {
    try {
      await deps.storeReport(report);
    } catch {
      // non-fatal
    }
  }

  return report;
}

export async function runQAForSite(
  site_id: string,
  deps?: Parameters<typeof runQASuite>[1],
): Promise<QAReport> {
  return runQASuite(site_id, deps);
}
