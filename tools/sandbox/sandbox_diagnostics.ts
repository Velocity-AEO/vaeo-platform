/**
 * tools/sandbox/sandbox_diagnostics.ts
 *
 * Loads and summarizes response classifications for a site's sandbox runs.
 * Provides diagnostic insights for the dashboard API.
 *
 * Never throws.
 */

import {
  buildClassificationSummary,
  type ResponseClassification,
  type ClassificationSummary,
} from './response_classifier.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SandboxDiagnosticRecord {
  fix_id:                   string;
  url:                      string;
  run_date:                 string;
  response_classifications: ResponseClassification[];
}

export interface SiteDiagnosticReport {
  site_id:            string;
  period_days:        number;
  total_runs:         number;
  classification_summary: ClassificationSummary;
  recent_failures:    DiagnosticFailure[];
  generated_at:       string;
}

export interface DiagnosticFailure {
  fix_id:             string;
  url:                string;
  run_date:           string;
  response_type:      string;
  diagnostic_message: string;
  sandbox_action:     string;
}

export interface SandboxDiagnosticsDeps {
  loadRunsFn?: (site_id: string, period_days: number) => Promise<SandboxDiagnosticRecord[]>;
}

// ── loadSiteDiagnostics ──────────────────────────────────────────────────────

export async function loadSiteDiagnostics(
  site_id:     string,
  period_days: number,
  deps?:       SandboxDiagnosticsDeps,
): Promise<SiteDiagnosticReport> {
  const empty: SiteDiagnosticReport = {
    site_id:     site_id ?? '',
    period_days: period_days ?? 7,
    total_runs:  0,
    classification_summary: {
      total: 0, by_type: {} as any, retriable: 0, actionable: 0, top_diagnostic: '',
    },
    recent_failures: [],
    generated_at: new Date().toISOString(),
  };

  try {
    if (!site_id) return empty;

    const loadFn = deps?.loadRunsFn ?? (async () => []);
    const runs = await loadFn(site_id, period_days ?? 7);
    if (!Array.isArray(runs) || runs.length === 0) return { ...empty, generated_at: new Date().toISOString() };

    // Flatten all classifications
    const allClassifications: ResponseClassification[] = [];
    const failures: DiagnosticFailure[] = [];

    for (const run of runs) {
      if (!Array.isArray(run.response_classifications)) continue;
      for (const c of run.response_classifications) {
        allClassifications.push(c);
        if (c.response_type !== 'success') {
          failures.push({
            fix_id:             run.fix_id,
            url:                run.url,
            run_date:           run.run_date,
            response_type:      c.response_type,
            diagnostic_message: c.diagnostic_message,
            sandbox_action:     c.sandbox_action,
          });
        }
      }
    }

    // Sort failures by date desc, take top 20
    failures.sort((a, b) => (b.run_date ?? '').localeCompare(a.run_date ?? ''));
    const recent_failures = failures.slice(0, 20);

    return {
      site_id,
      period_days: period_days ?? 7,
      total_runs:  runs.length,
      classification_summary: buildClassificationSummary(allClassifications),
      recent_failures,
      generated_at: new Date().toISOString(),
    };
  } catch {
    return { ...empty, generated_at: new Date().toISOString() };
  }
}
