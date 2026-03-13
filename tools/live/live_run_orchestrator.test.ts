/**
 * tools/live/live_run_orchestrator.test.ts
 *
 * Tests for live run orchestrator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runLiveProduction,
  type OrchestratorDeps,
  type SystemHealthReport,
} from './live_run_orchestrator.js';
import { defaultTarget, type LiveRunTarget } from './live_run_config.js';
import type { CrawlResult, DiscoveredPage } from './page_discovery.js';
import type { IssueAggregation, AggregatedIssue } from './issue_aggregator.js';
import type { FixBatch } from './live_fix_executor.js';

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockPages(): DiscoveredPage[] {
  return [
    { url: 'https://x.com/', status_code: 200, depth: 0, page_type: 'homepage', priority: 'high' },
    { url: 'https://x.com/products/a', status_code: 200, depth: 1, page_type: 'product', priority: 'high' },
    { url: 'https://x.com/products/b', status_code: 200, depth: 1, page_type: 'product', priority: 'high' },
  ];
}

function mockCrawl(): CrawlResult {
  return {
    site_id: 'site_1', domain: 'x.com', pages: mockPages(),
    total_discovered: 3, crawl_duration_ms: 100, errors: [],
    crawled_at: new Date().toISOString(),
  };
}

function mockIssue(fix_type: string): AggregatedIssue {
  return {
    issue_id: 'iss_1', site_id: 'site_1', url: 'https://x.com/',
    fix_type, severity: 'high', title: fix_type, description: fix_type,
    auto_fixable: true, confidence: 0.9, detected_at: new Date().toISOString(),
  };
}

function mockAggregation(): IssueAggregation {
  const issues = [mockIssue('title_missing'), mockIssue('lang_missing')];
  return {
    site_id: 'site_1', run_id: 'run_1', total_issues: 2,
    by_severity: { high: 1, low: 1 }, by_fix_type: { title_missing: 1, lang_missing: 1 },
    auto_fixable_count: 2, requires_review_count: 0, issues,
    aggregated_at: new Date().toISOString(),
  };
}

function mockBatch(dry_run: boolean): FixBatch {
  return {
    batch_id: 'bat_1', run_id: 'run_1', site_id: 'site_1',
    attempts: [], success_count: 2, failure_count: 0,
    sandbox_pass_count: 2, deploy_count: dry_run ? 0 : 2,
    executed_at: new Date().toISOString(), dry_run,
  };
}

function mockHealth(): SystemHealthReport {
  return { report_id: 'rpt_1', overall_status: 'green', checked_at: new Date().toISOString() };
}

function mockDeps(overrides?: Partial<OrchestratorDeps>): OrchestratorDeps {
  return {
    discoverPages: async () => mockCrawl(),
    aggregateIssues: () => mockAggregation(),
    executeFixBatch: async (_issues, _sid, _rid, dry_run) => mockBatch(dry_run),
    runHealthMonitor: async () => mockHealth(),
    ...overrides,
  };
}

function target(overrides?: Partial<LiveRunTarget>): LiveRunTarget {
  return { ...defaultTarget('site_1', 'x.com', 'shopify'), ...overrides };
}

// ── Full happy path ──────────────────────────────────────────────────────────

describe('runLiveProduction — happy path', () => {
  it('completes with status complete', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.state.phase, 'complete');
  });

  it('returns crawl result', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.crawl.total_discovered, 3);
  });

  it('returns issues aggregation', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.issues.total_issues, 2);
  });

  it('returns fix batch', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.fixes.success_count, 2);
  });

  it('returns health report', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.ok(result.health);
    assert.equal(result.health!.overall_status, 'green');
  });

  it('sets run_id on state', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.ok(result.state.run_id.startsWith('lr_'));
  });
});

// ── Phase log ────────────────────────────────────────────────────────────────

describe('runLiveProduction — phase_log', () => {
  it('logs all phases in order', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    const phases = result.state.phase_log.map((e) => e.phase);
    assert.ok(phases.includes('crawling'));
    assert.ok(phases.includes('detecting'));
    assert.ok(phases.includes('applying'));
    assert.ok(phases.includes('verifying'));
    assert.ok(phases.includes('learning'));
    assert.ok(phases.includes('complete'));
  });

  it('has at least 6 phase entries', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.ok(result.state.phase_log.length >= 6);
  });

  it('each entry has entered_at timestamp', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    for (const entry of result.state.phase_log) {
      assert.ok(entry.entered_at.includes('T'));
    }
  });
});

// ── Counts flow ──────────────────────────────────────────────────────────────

describe('runLiveProduction — counts', () => {
  it('sets pages_crawled from crawl', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.state.pages_crawled, 3);
  });

  it('sets issues_detected from aggregation', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.state.issues_detected, 2);
  });

  it('sets issues_triaged from auto_fixable_count', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.state.issues_triaged, 2);
  });

  it('sets fixes_applied from batch success_count', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.state.fixes_applied, 2);
  });

  it('sets fixes_verified from batch deploy_count', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.state.fixes_verified, 2);
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('runLiveProduction — error handling', () => {
  it('transitions to failed on crawl error', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      discoverPages: async () => { throw new Error('crawl failed'); },
    }));
    assert.equal(result.state.phase, 'failed');
    assert.ok(result.state.error!.includes('crawl failed'));
  });

  it('transitions to failed on aggregation error', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      aggregateIssues: () => { throw new Error('agg failed'); },
    }));
    assert.equal(result.state.phase, 'failed');
  });

  it('sets completed_at on failure', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      discoverPages: async () => { throw new Error('boom'); },
    }));
    assert.ok(result.state.completed_at);
  });
});

// ── Dry run ──────────────────────────────────────────────────────────────────

describe('runLiveProduction — dry_run', () => {
  it('passes dry_run to fix batch', async () => {
    const result = await runLiveProduction(target({ dry_run: true }), mockDeps());
    assert.equal(result.fixes.deploy_count, 0);
    assert.equal(result.state.fixes_verified, 0);
  });

  it('preserves dry_run on state', async () => {
    const result = await runLiveProduction(target({ dry_run: true }), mockDeps());
    assert.equal(result.state.dry_run, true);
  });
});

// ── Health monitor ───────────────────────────────────────────────────────────

describe('runLiveProduction — health', () => {
  it('returns null health when no monitor provided', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runHealthMonitor: undefined,
    }));
    assert.equal(result.health, null);
  });

  it('does not fail if health monitor throws', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runHealthMonitor: async () => { throw new Error('health fail'); },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.equal(result.health, null);
  });
});

// ── Digest trigger ────────────────────────────────────────────────────────────

describe('runLiveProduction — digest trigger', () => {
  it('calls scheduleDigest after successful live run', async () => {
    const called: string[] = [];
    const result = await runLiveProduction(target(), mockDeps({
      scheduleDigest: async (site_id) => { called.push(site_id); },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(called.includes('site_1'));
  });

  it('calls scheduleDigest with trigger=live_run', async () => {
    const triggers: string[] = [];
    await runLiveProduction(target(), mockDeps({
      scheduleDigest: async (_sid, opts) => { triggers.push(opts.trigger); },
    }));
    assert.ok(triggers.includes('live_run'));
  });

  it('calls scheduleDigest after partial/failed live run', async () => {
    const called: string[] = [];
    await runLiveProduction(target(), mockDeps({
      discoverPages: async () => { throw new Error('crawl fail'); },
      scheduleDigest: async (site_id) => { called.push(site_id); },
    }));
    assert.ok(called.includes('site_1'));
  });

  it('digest failure does not throw or abort the run', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      scheduleDigest: async () => { throw new Error('digest boom'); },
    }));
    assert.equal(result.state.phase, 'complete');
  });

  it('data_source_summary is included in live run result', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.ok(result.data_source_summary !== undefined);
    assert.ok(typeof result.data_source_summary!.total_fixes === 'number');
  });

  it('live run result includes fix count (success_count)', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.fixes.success_count, 2);
  });

  it('never throws when deps are all undefined', async () => {
    await assert.doesNotReject(() => runLiveProduction(target(), {}));
  });
});

// ── Notification wiring ─────────────────────────────────────────────────────

describe('runLiveProduction — notifications', () => {
  const notifConfig = {
    site_id: 'site_1',
    user_email: 'test@test.com',
    domain: 'x.com',
    digest_enabled: true,
    immediate_alerts_enabled: true,
  };

  it('dispatches live_run_complete notification after live run', async () => {
    const dispatched: string[] = [];
    const result = await runLiveProduction(target(), mockDeps({
      notificationConfig: notifConfig,
      dispatchNotification: async (payload) => {
        dispatched.push(payload.event);
        return { event: payload.event, dispatched: true, method: 'digest' };
      },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(dispatched.includes('live_run_complete'));
  });

  it('notification dispatch does not block run when dispatcher throws', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      notificationConfig: notifConfig,
      dispatchNotification: async () => { throw new Error('notif fail'); },
    }));
    assert.equal(result.state.phase, 'complete');
  });

  it('dispatches fix_failed notification when fix failures exist', async () => {
    const dispatched: string[] = [];
    const failBatch = (dry_run: boolean): FixBatch => ({
      batch_id: 'bat_1', run_id: 'run_1', site_id: 'site_1',
      attempts: [], success_count: 1, failure_count: 1,
      sandbox_pass_count: 1, deploy_count: dry_run ? 0 : 1,
      executed_at: new Date().toISOString(), dry_run,
    });
    const result = await runLiveProduction(target(), mockDeps({
      executeFixBatch: async (_issues, _sid, _rid, dry_run) => failBatch(dry_run),
      notificationConfig: notifConfig,
      dispatchNotification: async (payload) => {
        dispatched.push(payload.event);
        return { event: payload.event, dispatched: true, method: 'immediate' };
      },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(dispatched.includes('fix_failed'));
  });

  it('does not dispatch fix_failed when no failures', async () => {
    const dispatched: string[] = [];
    const result = await runLiveProduction(target(), mockDeps({
      notificationConfig: notifConfig,
      dispatchNotification: async (payload) => {
        dispatched.push(payload.event);
        return { event: payload.event, dispatched: true, method: 'digest' };
      },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(!dispatched.includes('fix_failed'));
  });

  it('does not dispatch when notificationConfig is absent', async () => {
    let called = false;
    const result = await runLiveProduction(target(), mockDeps({
      dispatchNotification: async () => {
        called = true;
        return { event: 'live_run_complete', dispatched: true, method: 'digest' };
      },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.equal(called, false);
  });

  it('never throws on notification error with failed run', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      discoverPages: async () => { throw new Error('crawl boom'); },
      notificationConfig: notifConfig,
      dispatchNotification: async () => { throw new Error('notif boom'); },
    }));
    assert.equal(result.state.phase, 'failed');
  });
});

// ── WP sandbox wiring ───────────────────────────────────────────────────────

describe('runLiveProduction — WP sandbox', () => {
  function wpTarget(overrides?: Partial<import('./live_run_config.js').LiveRunTarget>) {
    return { ...defaultTarget('site_1', 'x.com', 'wordpress'), ...overrides };
  }

  it('routes WP fixes through sandbox when config loaded', async () => {
    const sandboxed: string[] = [];
    const result = await runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => ({ site_id: 'site_1' }),
      runWPSandbox: async (fix) => { sandboxed.push(fix.fix_type); return { passed: true, failure_reasons: [] }; },
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(sandboxed.length > 0);
    assert.equal(result.wp_sandbox!.wp_sandbox_passes, sandboxed.length);
  });

  it('sandbox failure marks fix as failed', async () => {
    const result = await runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => ({ site_id: 'site_1' }),
      runWPSandbox: async () => ({ passed: false, failure_reasons: ['delta_verify_failed'] }),
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(result.wp_sandbox!.wp_sandbox_failures > 0);
  });

  it('sandbox pass marks fix as applied', async () => {
    const result = await runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => ({ site_id: 'site_1' }),
      runWPSandbox: async () => ({ passed: true, failure_reasons: [] }),
      logWarning: () => {},
    }));
    assert.equal(result.wp_sandbox!.wp_sandbox_passes, 2);
    assert.equal(result.wp_sandbox!.wp_sandbox_failures, 0);
  });

  it('sandbox skipped when config not loaded', async () => {
    const warnings: string[] = [];
    const result = await runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => null,
      logWarning: (msg) => { warnings.push(msg); },
    }));
    assert.equal(result.wp_sandbox!.wp_sandbox_skipped, 2);
  });

  it('warning logged when sandbox skipped', async () => {
    const warnings: string[] = [];
    const result = await runLiveProduction(wpTarget(), mockDeps({
      logWarning: (msg) => { warnings.push(msg); },
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(warnings.some(w => w.includes('WP sandbox config not loaded')));
  });

  it('live run summary includes sandbox counts', async () => {
    const result = await runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => ({ site_id: 'site_1' }),
      runWPSandbox: async () => ({ passed: true, failure_reasons: [] }),
      logWarning: () => {},
    }));
    assert.ok(result.wp_sandbox);
    assert.equal(typeof result.wp_sandbox!.wp_sandbox_passes, 'number');
    assert.equal(typeof result.wp_sandbox!.wp_sandbox_failures, 'number');
    assert.equal(typeof result.wp_sandbox!.wp_sandbox_skipped, 'number');
  });

  it('sandbox counts correct for mixed results', async () => {
    let callCount = 0;
    const result = await runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => ({ site_id: 'site_1' }),
      runWPSandbox: async () => {
        callCount++;
        if (callCount === 1) return { passed: true, failure_reasons: [] };
        return { passed: false, failure_reasons: ['regression'] };
      },
      logWarning: () => {},
    }));
    assert.equal(result.wp_sandbox!.wp_sandbox_passes, 1);
    assert.equal(result.wp_sandbox!.wp_sandbox_failures, 1);
  });

  it('never throws when sandbox throws', async () => {
    await assert.doesNotReject(() => runLiveProduction(wpTarget(), mockDeps({
      loadWPSandboxConfig: async () => ({ site_id: 'site_1' }),
      runWPSandbox: async () => { throw new Error('sandbox boom'); },
      logWarning: () => {},
    })));
  });
});

// ── Drift scan wiring ───────────────────────────────────────────────────────

describe('runLiveProduction — drift scan', () => {
  const driftEvent = {
    fix_id: 'fix-1',
    site_id: 'site_1',
    url: 'https://x.com/products/a',
    issue_type: 'title_missing',
    expected_value: 'My Title',
    current_value: '',
    probable_cause: 'theme_update',
    detected_at: new Date().toISOString(),
  };

  it('drift scan runs after fix pipeline', async () => {
    let scanCalled = false;
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => { scanCalled = true; return { scanned: 10, drifted: [] }; },
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
    assert.equal(scanCalled, true);
    assert.equal(result.drift_scan_run, true);
  });

  it('drifted fixes are requeued', async () => {
    const requeued: string[] = [];
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => ({ scanned: 10, drifted: [driftEvent] }),
      driftRequeueDeps: {
        createFixFn: async (fix) => { requeued.push(fix.fix_id as string); return fix.fix_id as string; },
        loadOriginalFn: async () => ({}),
      },
      logWarning: () => {},
    }));
    assert.equal(result.fixes_drifted, 1);
    assert.ok(requeued.length > 0);
  });

  it('drift scan failure does not block pipeline', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => { throw new Error('drift boom'); },
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
  });

  it('live run summary includes drift counts', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => ({ scanned: 5, drifted: [driftEvent] }),
      driftRequeueDeps: {
        createFixFn: async (fix) => fix.fix_id as string,
        loadOriginalFn: async () => ({}),
      },
      logWarning: () => {},
    }));
    assert.equal(typeof result.drift_scan_run, 'boolean');
    assert.equal(typeof result.fixes_drifted, 'number');
    assert.equal(typeof result.fixes_requeued, 'number');
  });

  it('drift_scan_run=true when scan runs', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => ({ scanned: 0, drifted: [] }),
      logWarning: () => {},
    }));
    assert.equal(result.drift_scan_run, true);
  });

  it('drift_scan_run=false when no scan dep', async () => {
    const result = await runLiveProduction(target(), mockDeps());
    assert.equal(result.drift_scan_run, false);
  });

  it('fixes_drifted count correct', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => ({
        scanned: 10,
        drifted: [driftEvent, { ...driftEvent, fix_id: 'fix-2' }],
      }),
      logWarning: () => {},
    }));
    assert.equal(result.fixes_drifted, 2);
  });

  it('fixes_requeued count correct', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => ({ scanned: 10, drifted: [driftEvent] }),
      driftRequeueDeps: {
        createFixFn: async (fix) => fix.fix_id as string,
        loadOriginalFn: async () => ({}),
      },
      logWarning: () => {},
    }));
    assert.equal(result.fixes_requeued, 1);
  });

  it('drift notification triggered when drifted > 0', async () => {
    const dispatched: string[] = [];
    const notifConfig = {
      site_id: 'site_1', user_email: 'test@test.com', domain: 'x.com',
      digest_enabled: true, immediate_alerts_enabled: true,
    };
    const result = await runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => ({ scanned: 10, drifted: [driftEvent] }),
      notificationConfig: notifConfig,
      dispatchNotification: async (payload) => {
        dispatched.push(payload.event);
        return { event: payload.event, dispatched: true, method: 'immediate' };
      },
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
    assert.ok(dispatched.includes('drift_detected'));
  });

  it('never throws when drift scan throws', async () => {
    await assert.doesNotReject(() => runLiveProduction(target(), mockDeps({
      runDriftScanFn: async () => { throw new Error('drift scan explodes'); },
      logWarning: () => {},
    })));
  });
});

// ── Link graph rebuild wiring ────────────────────────────────────────────────

describe('runLiveProduction — link graph rebuild', () => {
  it('link graph rebuilds after fix pipeline', async () => {
    let graphBuilt = false;
    const result = await runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => {
        graphBuilt = true;
        return { site_id: 'site_1', pages: [{ url: '/', title: 'Home', depth_from_homepage: 0, link_equity_score: 50, inbound_link_count: 10, outbound_link_count: 5, is_in_sitemap: true }], depth_results: new Map(), authority_scores: [], anchor_profiles: [], equity_leaks: [], built_at: '', analysis_errors: [] };
      },
      captureVelocityFn: async () => 1,
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
    assert.equal(graphBuilt, true);
    assert.equal(result.link_graph_built, true);
  });

  it('depth analysis runs after graph build', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => ({
        site_id: 'site_1',
        pages: [{ url: '/', title: 'Home', depth_from_homepage: 0, link_equity_score: 50, inbound_link_count: 10, outbound_link_count: 5, is_in_sitemap: true }],
        depth_results: new Map([['/', { url: '/', depth: 0, parent: null }]]),
        authority_scores: [], anchor_profiles: [], equity_leaks: [], built_at: '', analysis_errors: [],
      }),
      logWarning: () => {},
    }));
    assert.equal(result.link_graph_pages, 1);
  });

  it('velocity snapshot captured after rebuild', async () => {
    let captured = false;
    await runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => ({
        site_id: 'site_1', pages: [], depth_results: new Map(),
        authority_scores: [], anchor_profiles: [], equity_leaks: [], built_at: '', analysis_errors: [],
      }),
      captureVelocityFn: async () => { captured = true; return 5; },
      logWarning: () => {},
    }));
    assert.equal(captured, true);
  });

  it('live run summary includes link_graph_built', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => ({
        site_id: 'site_1', pages: [], depth_results: new Map(),
        authority_scores: [], anchor_profiles: [], equity_leaks: [], built_at: '', analysis_errors: [],
      }),
      logWarning: () => {},
    }));
    assert.equal(typeof result.link_graph_built, 'boolean');
  });

  it('live run summary includes orphaned count', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => ({
        site_id: 'site_1',
        pages: [
          { url: '/a', title: 'A', depth_from_homepage: 1, link_equity_score: 10, inbound_link_count: 1, outbound_link_count: 0, is_in_sitemap: true },
          { url: '/b', title: 'B', depth_from_homepage: null, link_equity_score: 0, inbound_link_count: 0, outbound_link_count: 0, is_in_sitemap: true },
        ],
        depth_results: new Map([
          ['/a', { url: '/a', depth: 1, parent: '/' }],
        ]),
        authority_scores: [], anchor_profiles: [], equity_leaks: [], built_at: '', analysis_errors: [],
      }),
      logWarning: () => {},
    }));
    assert.equal(result.link_graph_orphaned, 1);
  });

  it('graph rebuild failure does not block pipeline', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => { throw new Error('graph boom'); },
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
    assert.equal(result.link_graph_built, false);
  });

  it('link graph issues added to fix queue', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      linkGraphIssueDeps: {
        loadChainsFn: async () => [{
          source_url: '/a', link_url: '/old', final_url: '/new',
          hop_count: 1, chain: ['/old', '/new'], fix_action: 'update_link_to_final' as const,
        }],
      },
      logWarning: () => {},
    }));
    assert.ok(result.link_issues_added >= 1);
  });

  it('redirect chain issues counted in link_issues_added', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      linkGraphIssueDeps: {
        loadChainsFn: async () => [
          { source_url: '/a', link_url: '/old1', final_url: '/new1', hop_count: 1, chain: ['/old1', '/new1'], fix_action: 'update_link_to_final' as const },
          { source_url: '/b', link_url: '/old2', final_url: '/new2', hop_count: 2, chain: ['/old2', '/mid', '/new2'], fix_action: 'update_link_to_final' as const },
        ],
      },
      logWarning: () => {},
    }));
    assert.ok(result.link_issues_added >= 2);
  });

  it('broken external issues counted', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      linkGraphIssueDeps: {
        loadChecksFn: async () => [{
          url: '/page', destination_url: 'https://broken.com', destination_domain: 'broken.com',
          status_code: 404, is_broken: true, is_redirect: false, final_url: null,
          redirect_hops: 0, response_time_ms: 100, is_nofollow: false,
          domain_reputation: 'unknown' as const, check_error: null, checked_at: new Date().toISOString(),
        }],
      },
      logWarning: () => {},
    }));
    assert.ok(result.link_issues_added >= 1);
  });

  it('link issue failure does not block pipeline', async () => {
    const result = await runLiveProduction(target(), mockDeps({
      linkGraphIssueDeps: {
        loadChainsFn: async () => { throw new Error('issue boom'); },
      },
      logWarning: () => {},
    }));
    assert.equal(result.state.phase, 'complete');
  });

  it('never throws when all link graph deps fail', async () => {
    await assert.doesNotReject(() => runLiveProduction(target(), mockDeps({
      buildLinkGraphFn: async () => { throw new Error('graph boom'); },
      captureVelocityFn: async () => { throw new Error('vel boom'); },
      linkGraphIssueDeps: {
        loadChainsFn: async () => { throw new Error('chain boom'); },
      },
      logWarning: () => {},
    })));
  });
});
