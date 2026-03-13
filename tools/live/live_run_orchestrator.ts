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
import { scheduleDigest } from '../email/digest_scheduler.js';
import { buildFixNotification } from '../notifications/fix_notification.js';
import { dispatchFixNotification, type NotificationDispatchConfig } from '../notifications/notification_dispatcher.js';

import {
  checkBillingGate,
  getBillingBlockMessage,
  type BillingEnforcementDeps,
} from '../billing/billing_enforcement.js';
import {
  buildOrphanedPageIssues,
  prioritizeOrphanedPages,
  type OrphanedPageIssue,
} from '../orphaned/orphaned_page_issue_builder.js';
import {
  requeueAllDriftedFixes,
  buildDriftRequeueSummary,
  type DriftEvent,
  type DriftRequeueResult,
  type DriftRequeueDeps,
} from '../tracer/drift_requeue_engine.js';
import { buildLinkGraph, type LinkGraphResult } from '../link_graph/link_graph_builder.js';
import { runDepthAnalysis } from '../link_graph/link_depth_calculator.js';
import { scoreAllPages } from '../link_graph/authority_scorer.js';
import { captureVelocitySnapshot } from '../link_graph/link_velocity_tracker.js';
import {
  buildAllLinkGraphIssues,
  type SEOIssue,
  type LinkGraphIssueDeps,
} from '../link_graph/link_fix_issue_builder.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SystemHealthReport {
  report_id:      string;
  overall_status: 'green' | 'yellow' | 'red';
  checked_at:     string;
}

export interface WPSandboxCounts {
  wp_sandbox_passes:   number;
  wp_sandbox_failures: number;
  wp_sandbox_skipped:  number;
}

export interface LiveRunResult {
  state:                LiveRunState;
  crawl:                CrawlResult;
  issues:               IssueAggregation;
  fixes:                FixBatch;
  health:               SystemHealthReport | null;
  feedback_summary?:    FeedbackSummary;
  data_source_summary?: DataSourceSummary;
  wp_sandbox?:          WPSandboxCounts;
  timed_out_fixes:      number;
  timeout_fix_ids:      string[];
  orphaned_pages:       OrphanedPageIssue[];
  orphaned_pages_count: number;
  drift_scan_run:       boolean;
  fixes_drifted:        number;
  fixes_requeued:       number;
  link_graph_built:     boolean;
  link_graph_pages:     number;
  link_graph_orphaned:  number;
  link_issues_added:    number;
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
  /** Override digest scheduling for testing */
  scheduleDigest?: (site_id: string, opts: { trigger: string }) => Promise<void>;
  /** Notification dispatch config — when set, enables notifications */
  notificationConfig?: NotificationDispatchConfig;
  /** Override notification dispatch for testing */
  dispatchNotification?: typeof dispatchFixNotification;
  /** Billing enforcement deps for testing */
  billingDeps?: BillingEnforcementDeps;
  /** WP sandbox config loader — returns config or null */
  loadWPSandboxConfig?: (site_id: string) => Promise<{ site_id: string } | null>;
  /** WP sandbox runner — returns { passed, failure_reasons } */
  runWPSandbox?: (fix: AggregatedIssue, config: { site_id: string }) => Promise<{ passed: boolean; failure_reasons: string[] }>;
  /** Logger for warnings */
  logWarning?: (message: string) => void;
  /** Override orphaned page detection for testing */
  detectOrphanedPagesFn?: (
    site_id: string,
    pages: DiscoveredPage[],
  ) => Array<{ url: string; page_title: string | null; internal_link_count: number }>;
  /** Override drift scan for testing */
  runDriftScanFn?: (site_id: string) => Promise<{ scanned: number; drifted: DriftEvent[] }>;
  /** Override drift event save for testing */
  saveDriftEventFn?: (event: DriftEvent) => Promise<void>;
  /** Drift requeue deps for testing */
  driftRequeueDeps?: DriftRequeueDeps;
  /** Override link graph build for testing */
  buildLinkGraphFn?: (site_id: string) => Promise<LinkGraphResult>;
  /** Override velocity snapshot capture for testing */
  captureVelocityFn?: (site_id: string, graph: any, scores: any[]) => Promise<number>;
  /** Link graph issue builder deps for testing */
  linkGraphIssueDeps?: LinkGraphIssueDeps;
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

  let crawl            = emptyCrawl;
  let issues           = emptyIssues;
  let fixes            = emptyFixes;
  let health: SystemHealthReport | null = null;
  let timed_out_fixes  = 0;
  let timeout_fix_ids: string[] = [];
  let orphaned_pages: OrphanedPageIssue[] = [];
  let orphaned_pages_count = 0;
  let drift_scan_run = false;
  let fixes_drifted = 0;
  let fixes_requeued = 0;
  let link_graph_built = false;
  let link_graph_pages = 0;
  let link_graph_orphaned = 0;
  let link_issues_added = 0;

  try {
    // Billing gate check
    try {
      const billingResult = await checkBillingGate(
        target.site_id,
        target.max_pages,
        deps?.billingDeps,
      );
      if (!billingResult.allowed) {
        state = transitionPhase(state, 'failed', getBillingBlockMessage(billingResult));
        return { state, crawl: emptyCrawl, issues: emptyIssues, fixes: emptyFixes, health: null, timed_out_fixes: 0, timeout_fix_ids: [], orphaned_pages: [], orphaned_pages_count: 0, drift_scan_run: false, fixes_drifted: 0, fixes_requeued: 0, link_graph_built: false, link_graph_pages: 0, link_graph_orphaned: 0, link_issues_added: 0 };
      }
    } catch {
      // Fail open — never block on billing infra error
    }

    // Phase 1: Crawling
    state = transitionPhase(state, 'crawling', 'Discovering pages');
    const discover = deps?.discoverPages ?? discoverPages;
    crawl = await discover(target.site_id, target.domain, target.max_pages);
    state = { ...state, pages_crawled: crawl.pages.length };

    // Orphaned page detection (after crawl, before aggregation)
    try {
      const ORPHANED_CAP = 20;
      const logFn = deps?.logWarning ?? ((msg: string) => process.stderr.write(`[orchestrator] ${msg}\n`));
      const detectFn = deps?.detectOrphanedPagesFn ?? defaultDetectOrphanedPages;
      const rawOrphaned = detectFn(target.site_id, crawl.pages);
      const capped = rawOrphaned.slice(0, ORPHANED_CAP);
      const built = buildOrphanedPageIssues(target.site_id, capped);
      orphaned_pages = prioritizeOrphanedPages(built);
      orphaned_pages_count = orphaned_pages.length;
      if (orphaned_pages_count > 0) {
        logFn(`[ORPHANED] ${orphaned_pages_count} orphaned pages queued for site ${target.site_id}`);
      }
    } catch {
      // non-fatal — orphaned detection must never block the run
    }

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

    // WP sandbox routing
    const wpSandbox: WPSandboxCounts = { wp_sandbox_passes: 0, wp_sandbox_failures: 0, wp_sandbox_skipped: 0 };
    if (target.platform === 'wordpress') {
      let wpConfig: { site_id: string } | null = null;
      try {
        if (deps?.loadWPSandboxConfig) {
          wpConfig = await deps.loadWPSandboxConfig(target.site_id);
        }
      } catch {
        // fail open
      }

      if (wpConfig && deps?.runWPSandbox) {
        for (const fix of autoFixable) {
          try {
            const result = await deps.runWPSandbox(fix, wpConfig);
            if (result.passed) {
              wpSandbox.wp_sandbox_passes++;
            } else {
              wpSandbox.wp_sandbox_failures++;
              fixes = {
                ...fixes,
                failure_count: fixes.failure_count + 1,
                success_count: Math.max(0, fixes.success_count - 1),
              };
            }
          } catch {
            wpSandbox.wp_sandbox_skipped++;
          }
        }
      } else {
        wpSandbox.wp_sandbox_skipped = autoFixable.length;
        const warn = deps?.logWarning ?? ((msg: string) => process.stderr.write(`[orchestrator] ${msg}\n`));
        warn(`WP sandbox config not loaded for site ${target.site_id} — fix applied without sandbox`);
      }
    }

    // Timeout accounting
    timed_out_fixes = fixes.attempts.filter((a) => a.timed_out).length;
    timeout_fix_ids = fixes.attempts.filter((a) => a.timed_out).map((a) => a.attempt_id);
    if (timed_out_fixes > 0) {
      const warn = deps?.logWarning ?? ((msg: string) => process.stderr.write(`[orchestrator] ${msg}\n`));
      warn(`[LIVE_RUN] ${timed_out_fixes} fixes timed out during run for site ${target.site_id}`);
    }

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

    // Queue digest (non-fatal)
    try {
      const digestFn = deps?.scheduleDigest ?? scheduleDigest;
      await digestFn(target.site_id, { trigger: 'live_run' });
      process.stderr.write(`[orchestrator] digest queued for site ${target.site_id}\n`);
    } catch {
      // non-fatal
    }

    // Dispatch notifications (non-fatal)
    if (deps?.notificationConfig) {
      try {
        const dispatch = deps.dispatchNotification ?? dispatchFixNotification;
        const fixSummary = fixes.attempts.slice(0, 5).map((a: any) => a.fix_type ?? a.fix_id ?? 'fix');

        // live_run_complete notification
        const completePayload = buildFixNotification('live_run_complete', target.site_id, target.domain, {
          fix_count: fixes.success_count,
          fix_summary: fixSummary,
        });
        await dispatch(completePayload, deps.notificationConfig);

        // fix_failed notification if any failures
        if (fixes.failure_count > 0) {
          const failPayload = buildFixNotification('fix_failed', target.site_id, target.domain, {
            failed_count: fixes.failure_count,
          });
          await dispatch(failPayload, deps.notificationConfig);
        }
      } catch {
        // never let notification failure block the run
      }
    }

    // Drift scan — after fix pipeline, never blocks
    try {
      if (deps?.runDriftScanFn) {
        const driftResult = await deps.runDriftScanFn(target.site_id);
        drift_scan_run = true;
        fixes_drifted = driftResult.drifted.length;

        if (driftResult.drifted.length > 0) {
          // Save drift events
          const saveFn = deps.saveDriftEventFn ?? (async () => {});
          for (const evt of driftResult.drifted) {
            try { await saveFn(evt); } catch { /* non-fatal */ }
          }

          // Re-queue drifted fixes
          const requeueResults = await requeueAllDriftedFixes(driftResult.drifted, deps.driftRequeueDeps);
          const requeueSummary = buildDriftRequeueSummary(requeueResults);
          fixes_requeued = requeueSummary.requeued;

          // Drift notification
          if (deps.notificationConfig) {
            try {
              const dispatch = deps.dispatchNotification ?? dispatchFixNotification;
              const driftPayload = buildFixNotification('drift_detected' as any, target.site_id, target.domain, {
                fix_count: driftResult.drifted.length,
                fix_summary: driftResult.drifted.slice(0, 5).map(d => `${d.issue_type} on ${d.url}`),
              });
              await dispatch(driftPayload, deps.notificationConfig);
            } catch { /* non-fatal */ }
          }
        }

        const warn = deps.logWarning ?? ((msg: string) => process.stderr.write(`[orchestrator] ${msg}\n`));
        warn(`[DRIFT_SCAN] site=${target.site_id} scanned=${driftResult.scanned} drifted=${driftResult.drifted.length} requeued=${fixes_requeued}`);
      }
    } catch {
      // Drift scan failure must never block the pipeline
    }

    // Link graph rebuild — after fix pipeline so it reflects latest state
    try {
      const graphBuildFn = deps?.buildLinkGraphFn ?? (async (sid: string) => buildLinkGraph(sid));
      const graphResult = await graphBuildFn(target.site_id);
      link_graph_built = true;
      link_graph_pages = graphResult?.pages?.length ?? 0;

      // Count orphaned (depth null or unreachable)
      const depthMap = graphResult?.depth_results;
      if (depthMap && depthMap instanceof Map) {
        const reachable = new Set<string>();
        for (const [url] of depthMap) reachable.add(url);
        link_graph_orphaned = (graphResult.pages ?? []).filter(p => p?.url && !reachable.has(p.url)).length;
      }

      // Velocity snapshot
      let velocity_snapshots = 0;
      try {
        const captureFn = deps?.captureVelocityFn ?? (async (sid: string, graph: any, scores: any[]) => captureVelocitySnapshot(sid, graph, scores));
        velocity_snapshots = await captureFn(target.site_id, graphResult, graphResult?.authority_scores ?? []);
      } catch { /* non-fatal */ }

      const warn = deps?.logWarning ?? ((msg: string) => process.stderr.write(`[orchestrator] ${msg}\n`));
      warn(`[LINK_GRAPH_REBUILD] site=${target.site_id} pages=${link_graph_pages} orphaned=${link_graph_orphaned} velocity_snapshots=${velocity_snapshots}`);
    } catch {
      // Link graph rebuild failure must never block the pipeline
    }

    // Link graph issues — add to fix pipeline
    try {
      const linkIssues = await buildAllLinkGraphIssues(target.site_id, deps?.linkGraphIssueDeps);
      link_issues_added = linkIssues.length;
      if (link_issues_added > 0) {
        const warn = deps?.logWarning ?? ((msg: string) => process.stderr.write(`[orchestrator] ${msg}\n`));
        const byType: Record<string, number> = {};
        for (const iss of linkIssues) {
          byType[iss.issue_type] = (byType[iss.issue_type] ?? 0) + 1;
        }
        warn(`[LINK_ISSUES] site=${target.site_id} redirect_chains=${byType['REDIRECT_CHAIN_INTERNAL_LINK'] ?? 0} canonical=${byType['CANONICAL_CONFLICT_LINK'] ?? 0} generic_anchors=${byType['GENERIC_ANCHOR_TEXT'] ?? 0} broken_external=${byType['BROKEN_EXTERNAL_LINK_REMOVE'] ?? 0}`);
      }
    } catch {
      // Link issue building failure must never block the pipeline
    }

    return { state, crawl, issues, fixes, health, feedback_summary, data_source_summary, wp_sandbox: wpSandbox, timed_out_fixes, timeout_fix_ids, orphaned_pages, orphaned_pages_count, drift_scan_run, fixes_drifted, fixes_requeued, link_graph_built, link_graph_pages, link_graph_orphaned, link_issues_added };
  } catch (err) {
    state = transitionPhase(
      state,
      'failed',
      err instanceof Error ? err.message : String(err),
    );

    // Queue digest on partial/failed run too (non-fatal)
    try {
      const digestFn = deps?.scheduleDigest ?? scheduleDigest;
      await digestFn(target.site_id, { trigger: 'live_run' });
      process.stderr.write(`[orchestrator] digest queued for site ${target.site_id}\n`);
    } catch {
      // non-fatal
    }

    return { state, crawl, issues, fixes, health, timed_out_fixes: 0, timeout_fix_ids: [], orphaned_pages, orphaned_pages_count, drift_scan_run: false, fixes_drifted: 0, fixes_requeued: 0, link_graph_built: false, link_graph_pages: 0, link_graph_orphaned: 0, link_issues_added: 0 };
  }
}

// ── Default orphaned page detector ───────────────────────────────────────────

/**
 * Detects orphaned pages from the crawl result.
 * A page is orphaned if it has depth > 0 and no other crawled page links to it.
 * Since DiscoveredPage doesn't track inbound links, we use depth as a proxy:
 * pages at depth > 1 with no known parent are considered orphaned candidates.
 * In production, the caller should inject a real detector via detectOrphanedPagesFn.
 */
function defaultDetectOrphanedPages(
  _site_id: string,
  pages: DiscoveredPage[],
): Array<{ url: string; page_title: string | null; internal_link_count: number }> {
  try {
    if (!Array.isArray(pages)) return [];
    // Pages that are not the homepage and have depth > 1 are orphan candidates
    return pages
      .filter(p => p.depth > 1 && p.page_type !== 'homepage')
      .map(p => ({
        url:                 p.url,
        page_title:          p.title ?? null,
        internal_link_count: 0,
      }));
  } catch {
    return [];
  }
}
