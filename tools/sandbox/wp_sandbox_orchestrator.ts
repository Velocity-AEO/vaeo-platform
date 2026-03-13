/**
 * tools/sandbox/wp_sandbox_orchestrator.ts
 *
 * Coordinates HTML snapshot, delta verify, regression monitor,
 * and Lighthouse into a single sandbox run for every WordPress fix.
 *
 * Mobile-first Lighthouse: mobile is primary (Google ranking signal),
 * desktop is secondary for comparison.
 *
 * Injectable deps pattern for testability. Never throws.
 */

import {
  runWPLighthouseFull,
  runWPLighthouseDelta,
  type WPLighthouseFullResult,
  type WPLighthouseScore,
  type WPLighthouseDelta,
} from './wp_lighthouse_runner.js';
import type { ResponseClassification } from './response_classifier.js';
// Re-export WPLighthouseDelta so existing importers don't break
export type { WPLighthouseDelta };

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPSandboxConfig {
  site_id:              string;
  wp_url:               string;
  username:             string;
  app_password:         string;
  run_lighthouse:       boolean;
  run_regression:       boolean;
  run_delta_verify:     boolean;
  lighthouse_threshold: number;
}

export interface WPRegressionSignal {
  signal:  string;
  was:     string;
  now:     string;
  message: string;
}

export interface WPSandboxResult {
  fix_id:                      string;
  url:                         string;
  site_id:                     string;
  passed:                      boolean;
  html_snapshot_success:       boolean;
  delta_verified:              boolean;
  regression_passed:           boolean;
  lighthouse_delta?:           WPLighthouseDelta;
  /** Mobile score (primary — Google ranking signal) */
  lighthouse_mobile?:          WPLighthouseScore;
  /** Desktop score (secondary — for comparison) */
  lighthouse_desktop?:         WPLighthouseScore;
  /** desktop.performance - mobile.performance (positive = desktop faster) */
  lighthouse_mobile_desktop_gap?: number;
  regressions?:                WPRegressionSignal[];
  failure_reasons:             string[];
  response_classifications:    ResponseClassification[];
  started_at:                  string;
  completed_at:                string;
  capture_timed_out:           boolean;
  timed_out_viewports:         number[];
}

export interface WPSandboxDeps {
  fetchHTMLFn?:       (url: string) => Promise<string | { html: string; response_classification?: ResponseClassification }>;
  deltaVerifyFn?:     (before: string, after: string, issue_type: string, expected_value: string) => Promise<{ verified: boolean; reason?: string }>;
  regressionFn?:      (before: string, after: string) => Promise<{ passed: boolean; regressions: WPRegressionSignal[] }>;
  /** Legacy single-score lighthouse (backward compat) */
  lighthouseFn?:      (url: string) => Promise<{ score: number }>;
  /** Mobile-first full lighthouse — preferred over lighthouseFn */
  lighthouseFullFn?:  (url: string) => Promise<WPLighthouseFullResult>;
  viewportCaptureFn?: (url: string) => Promise<{ any_timed_out: boolean; timed_out_viewports: number[] }>;
  logFn?:             (message: string) => void;
}

// ── Default deps ─────────────────────────────────────────────────────────────

function defaultFetchHTML(): WPSandboxDeps['fetchHTMLFn'] {
  return async () => '';
}

function defaultDeltaVerify(): NonNullable<WPSandboxDeps['deltaVerifyFn']> {
  return async () => ({ verified: true });
}

function defaultRegression(): NonNullable<WPSandboxDeps['regressionFn']> {
  return async () => ({ passed: true, regressions: [] });
}

function defaultLighthouse(): NonNullable<WPSandboxDeps['lighthouseFn']> {
  return async () => ({ score: 100 });
}

// ── runWPSandbox ─────────────────────────────────────────────────────────────

export async function runWPSandbox(
  fix_id:         string,
  url:            string,
  issue_type:     string,
  expected_value: string,
  runFix:         () => Promise<void>,
  config:         WPSandboxConfig,
  deps?:          Partial<WPSandboxDeps>,
): Promise<WPSandboxResult> {
  const started_at = new Date().toISOString();
  const failure_reasons: string[] = [];

  const fetchHTML    = deps?.fetchHTMLFn   ?? defaultFetchHTML();
  const deltaVerify  = deps?.deltaVerifyFn ?? defaultDeltaVerify();
  const regressionFn = deps?.regressionFn  ?? defaultRegression();
  const lighthouseFn = deps?.lighthouseFn  ?? defaultLighthouse();

  const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  let beforeHTML = '';
  let afterHTML = '';
  let html_snapshot_success = true;
  let delta_verified = false;
  let regression_passed = true;
  let lighthouse_delta: WPLighthouseDelta | undefined;
  let lighthouse_mobile: WPLighthouseScore | undefined;
  let lighthouse_desktop: WPLighthouseScore | undefined;
  let lighthouse_mobile_desktop_gap: number | undefined;
  let regressions: WPRegressionSignal[] | undefined;
  let capture_timed_out = false;
  let timed_out_viewports: number[] = [];
  const response_classifications: ResponseClassification[] = [];

  // Helper to extract html string and optional classification from fetchHTMLFn
  function extractFetchResult(raw: string | { html: string; response_classification?: ResponseClassification }): { html: string; classification?: ResponseClassification } {
    if (typeof raw === 'string') return { html: raw };
    return { html: raw?.html ?? '', classification: raw?.response_classification };
  }

  try {
    // 1. Fetch before HTML snapshot
    try {
      const raw = await fetchHTML(url);
      const { html, classification } = extractFetchResult(raw);
      beforeHTML = html;
      if (classification) response_classifications.push(classification);
      if (!beforeHTML) {
        html_snapshot_success = false;
        const diag = classification?.diagnostic_message;
        failure_reasons.push(diag ? `html_snapshot_failed: ${diag}` : 'html_snapshot_failed');
      }
    } catch {
      html_snapshot_success = false;
      failure_reasons.push('html_snapshot_failed');
    }

    // 2. Run the fix
    try {
      await runFix();
    } catch {
      failure_reasons.push('fix_execution_failed');
    }

    // 3. Fetch after HTML snapshot
    try {
      const raw = await fetchHTML(url);
      const { html, classification } = extractFetchResult(raw);
      afterHTML = html;
      if (classification) response_classifications.push(classification);
      if (!afterHTML) {
        const diag = classification?.diagnostic_message;
        failure_reasons.push(diag ? `after_snapshot_failed: ${diag}` : 'after_snapshot_failed');
        html_snapshot_success = false;
      }
    } catch {
      failure_reasons.push('after_snapshot_failed');
      html_snapshot_success = false;
    }

    // 4. Delta verify
    const bothSnapshots = beforeHTML && afterHTML;
    if (config.run_delta_verify && bothSnapshots) {
      try {
        const verifyResult = await deltaVerify(beforeHTML, afterHTML, issue_type, expected_value);
        delta_verified = verifyResult.verified;
        if (!delta_verified) {
          failure_reasons.push('delta_verify_failed');
        }
      } catch {
        failure_reasons.push('delta_verify_failed');
      }
    } else if (config.run_delta_verify && !bothSnapshots) {
      delta_verified = false;
    }

    // 5. Regression monitor
    if (config.run_regression && bothSnapshots) {
      try {
        const regResult = await regressionFn(beforeHTML, afterHTML);
        regression_passed = regResult.passed;
        regressions = regResult.regressions;
        if (!regression_passed) {
          for (const r of regResult.regressions) {
            failure_reasons.push(`regression: ${r.signal} — ${r.message}`);
          }
        }
      } catch {
        regression_passed = false;
        failure_reasons.push('regression_check_failed');
      }
    }

    // 6. Lighthouse delta — mobile-first
    if (config.run_lighthouse) {
      try {
        if (deps?.lighthouseFullFn) {
          // ── Mobile-first path (preferred) ─────────────────────────────────
          const beforeFull = await deps.lighthouseFullFn(url);
          const afterFull  = await deps.lighthouseFullFn(url);

          lighthouse_mobile  = afterFull.mobile;
          lighthouse_desktop = afterFull.desktop ?? undefined;
          lighthouse_mobile_desktop_gap =
            typeof afterFull.mobile_desktop_gap === 'number'
              ? afterFull.mobile_desktop_gap
              : undefined;

          lighthouse_delta = runWPLighthouseDelta(beforeFull, afterFull, config.lighthouse_threshold);

          log(
            `[SANDBOX_LIGHTHOUSE] mobile=${afterFull.mobile.performance}` +
            ` desktop=${afterFull.desktop?.performance ?? '—'}` +
            ` gap=${afterFull.mobile_desktop_gap ?? '—'}pts url=${url}`,
          );

          if (lighthouse_delta.regression_detected) {
            failure_reasons.push('lighthouse_regression');
          }
        } else {
          // ── Legacy single-score path (backward compat) ────────────────────
          const beforeLH = await lighthouseFn(url);
          const afterLH  = await lighthouseFn(url);
          const delta    = afterLH.score - beforeLH.score;
          const regression_detected = delta < -config.lighthouse_threshold;
          lighthouse_delta = {
            before_score:              beforeLH.score,
            after_score:               afterLH.score,
            delta,
            regression_detected,
            mobile_performance_delta:  null,
            desktop_performance_delta: null,
            primary_delta:             null,
          };
          if (regression_detected) {
            failure_reasons.push('lighthouse_regression');
          }
        }
      } catch {
        failure_reasons.push('lighthouse_check_failed');
      }

    }

    // 7. Viewport capture timeout check
    if (deps?.viewportCaptureFn) {
      try {
        const captureResult = await deps.viewportCaptureFn(url);
        if (captureResult.any_timed_out) {
          capture_timed_out = true;
          timed_out_viewports = captureResult.timed_out_viewports;
          failure_reasons.push('viewport_capture_timeout');
          log(`[SANDBOX_TIMEOUT] fix=${fix_id} url=${url} viewports=${timed_out_viewports.join(',')} elapsed=timeout`);
        }
      } catch {
        // non-fatal
      }
    }
  } catch {
    failure_reasons.push('sandbox_unexpected_error');
  }

  return {
    fix_id,
    url,
    site_id:               config.site_id,
    passed:                failure_reasons.length === 0,
    html_snapshot_success,
    delta_verified,
    regression_passed,
    lighthouse_delta,
    lighthouse_mobile,
    lighthouse_desktop,
    lighthouse_mobile_desktop_gap,
    regressions,
    failure_reasons,
    response_classifications,
    started_at,
    completed_at:          new Date().toISOString(),
    capture_timed_out,
    timed_out_viewports,
  };
}
