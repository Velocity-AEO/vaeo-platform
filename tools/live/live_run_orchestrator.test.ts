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
