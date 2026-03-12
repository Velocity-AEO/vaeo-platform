/**
 * tools/live/live_fix_executor.ts
 *
 * Executes fix attempts against detected issues, with sandbox
 * validation and deployment through injectable deps.
 *
 * Never throws.
 */

import type { AggregatedIssue } from './issue_aggregator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FixAttempt {
  attempt_id:      string;
  issue:           AggregatedIssue;
  started_at:      string;
  completed_at?:   string;
  success:         boolean;
  html_before:     string;
  html_after:      string;
  sandbox_passed:  boolean;
  deployed:        boolean;
  dry_run:         boolean;
  error?:          string;
  debug_events:    string[];
  data_source?:    'gsc_live' | 'simulated';
}

export interface FixBatch {
  batch_id:           string;
  run_id:             string;
  site_id:            string;
  attempts:           FixAttempt[];
  success_count:      number;
  failure_count:      number;
  sandbox_pass_count: number;
  deploy_count:       number;
  executed_at:        string;
  dry_run:            boolean;
  data_source?:       'gsc_live' | 'simulated';
}

export interface FixDeps {
  applyFix?: (html: string, fix_type: string) =>
    Promise<{ html: string; success: boolean }>;
  sandboxValidate?: (html: string) =>
    Promise<{ passed: boolean; errors: string[] }>;
  deployFix?: (site_id: string, url: string, html: string) =>
    Promise<{ deployed: boolean }>;
  data_source?: 'gsc_live' | 'simulated';
}

export interface BatchDeps extends FixDeps {
  fetchPageHTML?: (url: string) => Promise<string>;
}

// ── ID generators ────────────────────────────────────────────────────────────

function generateAttemptId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateBatchId(): string {
  return `bat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Default fix simulator ────────────────────────────────────────────────────

const FIX_TAG_MAP: Record<string, string> = {
  title_missing:            '<title>Generated Title</title>',
  meta_description_missing: '<meta name="description" content="Generated description.">',
  image_alt_missing:        '<!-- vaeo: alt text added -->',
  schema_missing:           '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
  canonical_missing:        '<link rel="canonical" href="">',
  lang_missing:             '<!-- vaeo: lang="en" added -->',
};

async function defaultApplyFix(
  html: string,
  fix_type: string,
): Promise<{ html: string; success: boolean }> {
  const tag = FIX_TAG_MAP[fix_type];
  if (!tag) return { html, success: false };

  const insertPoint = html.indexOf('</head>');
  if (insertPoint !== -1) {
    return {
      html: html.slice(0, insertPoint) + '\n' + tag + '\n' + html.slice(insertPoint),
      success: true,
    };
  }
  return { html: html + '\n' + tag, success: true };
}

async function defaultSandboxValidate(
  _html: string,
): Promise<{ passed: boolean; errors: string[] }> {
  return { passed: true, errors: [] };
}

async function defaultDeployFix(
  _site_id: string,
  _url: string,
  _html: string,
): Promise<{ deployed: boolean }> {
  return { deployed: true };
}

// ── Single fix attempt ───────────────────────────────────────────────────────

export async function executeFixAttempt(
  issue: AggregatedIssue,
  html: string,
  dry_run: boolean,
  deps?: FixDeps,
): Promise<FixAttempt> {
  const startedAt = new Date().toISOString();
  const debug_events: string[] = [];

  const data_source = deps?.data_source;

  try {
    const applyFix = deps?.applyFix ?? defaultApplyFix;
    const sandboxValidate = deps?.sandboxValidate ?? defaultSandboxValidate;
    const deployFix = deps?.deployFix ?? defaultDeployFix;

    // 1. Apply fix
    debug_events.push(`[apply] Starting fix for ${issue.fix_type} on ${issue.url}`);
    const fixResult = await applyFix(html, issue.fix_type);
    debug_events.push(`[apply] success=${fixResult.success}`);

    if (!fixResult.success) {
      return {
        attempt_id:     generateAttemptId(),
        issue,
        started_at:     startedAt,
        completed_at:   new Date().toISOString(),
        success:        false,
        html_before:    html,
        html_after:     html,
        sandbox_passed: false,
        deployed:       false,
        dry_run,
        error:          `Fix application failed for ${issue.fix_type}`,
        debug_events,
        ...(data_source ? { data_source } : {}),
      };
    }

    // 2. Sandbox validate
    debug_events.push('[sandbox] Running validation');
    const sandboxResult = await sandboxValidate(fixResult.html);
    debug_events.push(`[sandbox] passed=${sandboxResult.passed}`);

    if (!sandboxResult.passed) {
      return {
        attempt_id:     generateAttemptId(),
        issue,
        started_at:     startedAt,
        completed_at:   new Date().toISOString(),
        success:        false,
        html_before:    html,
        html_after:     fixResult.html,
        sandbox_passed: false,
        deployed:       false,
        dry_run,
        error:          `Sandbox validation failed: ${sandboxResult.errors.join(', ')}`,
        debug_events,
        ...(data_source ? { data_source } : {}),
      };
    }

    // 3. Deploy (skip if dry_run)
    let deployed = false;
    if (dry_run) {
      debug_events.push('[deploy] Skipped (dry run)');
    } else {
      debug_events.push('[deploy] Deploying fix');
      const deployResult = await deployFix(issue.site_id, issue.url, fixResult.html);
      deployed = deployResult.deployed;
      debug_events.push(`[deploy] deployed=${deployed}`);
    }

    return {
      attempt_id:     generateAttemptId(),
      issue,
      started_at:     startedAt,
      completed_at:   new Date().toISOString(),
      success:        true,
      html_before:    html,
      html_after:     fixResult.html,
      sandbox_passed: true,
      deployed,
      dry_run,
      debug_events,
      ...(data_source ? { data_source } : {}),
    };
  } catch (err) {
    debug_events.push(`[error] ${err instanceof Error ? err.message : String(err)}`);
    return {
      attempt_id:     generateAttemptId(),
      issue,
      started_at:     startedAt,
      completed_at:   new Date().toISOString(),
      success:        false,
      html_before:    html,
      html_after:     html,
      sandbox_passed: false,
      deployed:       false,
      dry_run,
      error:          err instanceof Error ? err.message : String(err),
      debug_events,
      ...(data_source ? { data_source } : {}),
    };
  }
}

// ── Batch executor ───────────────────────────────────────────────────────────

export async function executeFixBatch(
  issues: AggregatedIssue[],
  site_id: string,
  run_id: string,
  dry_run: boolean,
  deps?: BatchDeps,
): Promise<FixBatch> {
  const attempts: FixAttempt[] = [];

  try {
    const fetchPageHTML = deps?.fetchPageHTML ?? (async () =>
      '<html><head><title>Test</title></head><body><p>Content</p></body></html>'
    );

    for (const issue of issues) {
      const html = await fetchPageHTML(issue.url);
      const attempt = await executeFixAttempt(issue, html, dry_run, deps);
      attempts.push(attempt);
    }
  } catch {
    // continue with what we have
  }

  const success_count = attempts.filter((a) => a.success).length;
  const failure_count = attempts.filter((a) => !a.success).length;
  const sandbox_pass_count = attempts.filter((a) => a.sandbox_passed).length;
  const deploy_count = attempts.filter((a) => a.deployed).length;

  const batch_data_source = deps?.data_source;
  return {
    batch_id:    generateBatchId(),
    run_id,
    site_id,
    attempts,
    success_count,
    failure_count,
    sandbox_pass_count,
    deploy_count,
    executed_at: new Date().toISOString(),
    dry_run,
    ...(batch_data_source ? { data_source: batch_data_source } : {}),
  };
}
