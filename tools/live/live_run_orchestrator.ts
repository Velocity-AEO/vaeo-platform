/**
 * tools/live/live_run_orchestrator.ts
 *
 * Orchestrates a full live production fix run:
 * crawl → detect → triage → apply → verify → learn → complete.
 *
 * Never throws at outer level.
 */

import {
  createLiveRun,
  transitionPhase,
  type LiveRunTarget,
  type LiveRunState,
} from './live_run_config.js';
import {
  discoverPages,
  type CrawlResult,
  type DiscoveredPage,
} from './page_discovery.js';
import {
  aggregateIssues as defaultAggregateIssues,
  type AggregatedIssue,
  type IssueAggregation,
} from './issue_aggregator.js';
import {
  executeFixBatch as defaultExecuteFixBatch,
  type FixBatch,
} from './live_fix_executor.js';
import {
  processFeedbackBatch,
  type FeedbackSummary,
  type FeedbackDeps,
} from './feedback_loop.js';
import {
  summarizeDataSource,
  type DataSourceSummary,
} from './data_source_flag.js';
import { fetchRankings } from '../rankings/rankings_service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SystemHealthReport {
  report_id:      string;
  overall_status: 'green' | 'yellow' | 'red';
  checked_at:     string;
}

export interface LiveRunResult {
  state:                LiveRunState;
  crawl:                CrawlResult;
  issues:               IssueAggregation;
  fixes:                FixBatch;
  health:               SystemHealthReport | null;
  feedback_summary?:    FeedbackSummary;
  data_source_summary?: DataSourceSummary;
}

export interface OrchestratorDeps {
  discoverPages?: (
    site_id: string,
    domain: string,
    max_pages: number,
  ) => Promise<CrawlResult>;
  aggregateIssues?: (
    site_id: string,
    run_id: string,
    pages: DiscoveredPage[],
    fix_types: string[],
  ) => IssueAggregation;
  executeFixBatch?: (
    issues: AggregatedIssue[],
    site_id: string,
    run_id: string,
    dry_run: boolean,
  ) => Promise<FixBatch>;
  runHealthMonitor?: () => Promise<SystemHealthReport>;
  feedbackDeps?: FeedbackDeps;
  /** Resolved data_source from rankings; when set, propagated to all fix records */
  data_source?: 'gsc_live' | 'simulated';
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function runLiveProduction(
  target: LiveRunTarget,
  deps?: OrchestratorDeps,
): Promise<LiveRunResult> {
  let state = createLiveRun(target);

  const emptyCrawl: CrawlResult = {
    site_id: target.site_id,
    domain: target.domain,
    pages: [],
    total_discovered: 0,
    crawl_duration_ms: 0,
    errors: [],
    crawled_at: new Date().toISOString(),
  };

  const emptyIssues: IssueAggregation = {
    site_id: target.site_id,
    run_id: state.run_id,
    total_issues: 0,
    by_severity: {},
    by_fix_type: {},
    auto_fixable_count: 0,
    requires_review_count: 0,
    issues: [],
    aggregated_at: new Date().toISOString(),
  };

  const emptyFixes: FixBatch = {
    batch_id: 'bat_empty',
    run_id: state.run_id,
    site_id: target.site_id,
    attempts: [],
    success_count: 0,
    failure_count: 0,
    sandbox_pass_count: 0,
    deploy_count: 0,
    executed_at: new Date().toISOString(),
    dry_run: target.dry_run,
  };

  let crawl = emptyCrawl;
  let issues = emptyIssues;
  let fixes = emptyFixes;
  let health: SystemHealthReport | null = null;

  try {
    // Phase 1: Crawling
    state = transitionPhase(state, 'crawling', 'Discovering pages');
    const discover = deps?.discoverPages ?? discoverPages;
    crawl = await discover(target.site_id, target.domain, target.max_pages);
    state = { ...state, pages_crawled: crawl.pages.length };

    // Phase 2: Detecting
    state = transitionPhase(state, 'detecting', 'Detecting issues');
    const aggregate = deps?.aggregateIssues ?? defaultAggregateIssues;
    issues = aggregate(target.site_id, state.run_id, crawl.pages, target.fix_types);
    state = {
      ...state,
      issues_detected: issues.total_issues,
      issues_triaged: issues.auto_fixable_count,
    };

    // Resolve data_source from rankings (best-effort, non-fatal)
    let resolved_data_source: 'gsc_live' | 'simulated' | undefined = deps?.data_source;
    if (!resolved_data_source) {
      try {
        const rankingEntries = await fetchRankings({
          site_id:               target.site_id,
          domain:                target.domain,
          use_simulator_fallback: true,
        });
        if (rankingEntries.length > 0) {
          resolved_data_source = rankingEntries[0]?.data_source;
        }
      } catch {
        // non-fatal
      }
    }

    // Phase 3: Applying
    state = transitionPhase(state, 'applying', 'Applying fixes');
    const autoFixable = issues.issues.filter((i) => i.auto_fixable);
    const executeBatch = deps?.executeFixBatch ?? defaultExecuteFixBatch;
    fixes = await executeBatch(autoFixable, target.site_id, state.run_id, target.dry_run);
    state = {
      ...state,
      fixes_applied:    fixes.success_count,
      fixes_failed:     fixes.failure_count,
      sandbox_passes:   fixes.sandbox_pass_count,
      sandbox_failures: fixes.failure_count,
    };

    // Phase 4: Verifying
    state = transitionPhase(state, 'verifying', 'Verifying deployments');
    state = { ...state, fixes_verified: fixes.deploy_count };

    // Phase 5: Learning
    state = transitionPhase(state, 'learning', 'Recording learnings');
    let feedback_summary: FeedbackSummary | undefined;
    try {
      feedback_summary = await processFeedbackBatch(
        target.site_id,
        state.run_id,
        fixes,
        deps?.feedbackDeps,
      );
    } catch {
      // non-fatal
    }

    // Phase 6: Complete
    state = transitionPhase(state, 'complete', 'Run complete');

    // Health monitor
    if (deps?.runHealthMonitor) {
      try {
        health = await deps.runHealthMonitor();
      } catch {
        // non-fatal
      }
    }

    const data_source_summary = summarizeDataSource(
      fixes.attempts.map(a => ({ data_source: a.data_source ?? resolved_data_source })),
    );
    return { state, crawl, issues, fixes, health, feedback_summary, data_source_summary };
  } catch (err) {
    state = transitionPhase(
      state,
      'failed',
      err instanceof Error ? err.message : String(err),
    );
    return { state, crawl, issues, fixes, health };
  }
}
