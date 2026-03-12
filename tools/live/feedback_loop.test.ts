import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFeedbackEvent,
  processFeedbackBatch,
  type FeedbackType,
} from './feedback_loop.js';
import type { FixBatch, FixAttempt } from './live_fix_executor.js';
import type { AggregatedIssue } from './issue_aggregator.js';

function makeIssue(fix_type: string = 'title_missing'): AggregatedIssue {
  return {
    issue_id: 'iss_1',
    site_id: 'site1',
    url: 'https://example.com',
    fix_type,
    severity: 'high',
    title: 'Missing title',
    description: 'No title tag',
    auto_fixable: true,
    confidence: 0.85,
    detected_at: new Date().toISOString(),
  };
}

function makeAttempt(overrides: Partial<FixAttempt> = {}): FixAttempt {
  return {
    attempt_id: 'att_1',
    issue: makeIssue(),
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    success: true,
    html_before: '<html></html>',
    html_after: '<html><title>X</title></html>',
    sandbox_passed: true,
    deployed: true,
    dry_run: false,
    debug_events: [],
    ...overrides,
  };
}

function makeBatch(attempts: FixAttempt[] = [makeAttempt()]): FixBatch {
  return {
    batch_id: 'bat_1',
    run_id: 'run_1',
    site_id: 'site1',
    attempts,
    success_count: attempts.filter((a) => a.success).length,
    failure_count: attempts.filter((a) => !a.success).length,
    sandbox_pass_count: attempts.filter((a) => a.sandbox_passed).length,
    deploy_count: attempts.filter((a) => a.deployed).length,
    executed_at: new Date().toISOString(),
    dry_run: false,
  };
}

describe('buildFeedbackEvent — confidence deltas', () => {
  it('deploy_success gives +0.05', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', true, 'deploy_success');
    assert.equal(e.confidence_delta, 0.05);
  });

  it('verification_pass gives +0.03', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', true, 'verification_pass');
    assert.equal(e.confidence_delta, 0.03);
  });

  it('deploy_failure gives -0.10', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', false, 'deploy_failure');
    assert.equal(e.confidence_delta, -0.10);
  });

  it('verification_fail gives -0.08', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', false, 'verification_fail');
    assert.equal(e.confidence_delta, -0.08);
  });

  it('regression_detected gives -0.15', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', false, 'regression_detected');
    assert.equal(e.confidence_delta, -0.15);
  });
});

describe('buildFeedbackEvent — fields', () => {
  it('has event_id and created_at', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', true, 'deploy_success');
    assert.ok(e.event_id.startsWith('fb_'));
    assert.ok(!isNaN(Date.parse(e.created_at)));
  });

  it('source is live_run_feedback', () => {
    const e = buildFeedbackEvent('s1', 'r1', 'title_missing', 'u', true, 'deploy_success');
    assert.equal(e.source, 'live_run_feedback');
  });

  it('passes through site_id and run_id', () => {
    const e = buildFeedbackEvent('site_abc', 'run_xyz', 'title_missing', 'u', true, 'deploy_success');
    assert.equal(e.site_id, 'site_abc');
    assert.equal(e.run_id, 'run_xyz');
  });
});

describe('processFeedbackBatch', () => {
  it('creates events for each attempt', async () => {
    const batch = makeBatch([makeAttempt(), makeAttempt({ attempt_id: 'att_2' })]);
    const summary = await processFeedbackBatch('s1', 'r1', batch);
    assert.equal(summary.total_events, 2);
  });

  it('success_rate reflects successful events', async () => {
    const batch = makeBatch([
      makeAttempt(),
      makeAttempt({ attempt_id: 'att_2', success: false, sandbox_passed: false }),
    ]);
    const summary = await processFeedbackBatch('s1', 'r1', batch);
    assert.equal(summary.success_rate, 0.5);
  });

  it('avg_confidence_delta computed correctly', async () => {
    const batch = makeBatch([makeAttempt()]); // deploy_success → +0.05
    const summary = await processFeedbackBatch('s1', 'r1', batch);
    assert.equal(summary.avg_confidence_delta, 0.05);
  });

  it('calls writeLearning per attempt', async () => {
    let calls = 0;
    const batch = makeBatch([makeAttempt(), makeAttempt({ attempt_id: 'att_2' })]);
    const summary = await processFeedbackBatch('s1', 'r1', batch, {
      writeLearning: async () => { calls++; },
    });
    assert.equal(calls, 2);
    assert.equal(summary.learning_writes, 2);
  });

  it('patterns_updated has unique fix types', async () => {
    const batch = makeBatch([
      makeAttempt(),
      makeAttempt({ attempt_id: 'att_2', issue: makeIssue('title_missing') }),
      makeAttempt({ attempt_id: 'att_3', issue: makeIssue('meta_description_missing') }),
    ]);
    const summary = await processFeedbackBatch('s1', 'r1', batch, {
      updatePattern: async () => {},
    });
    assert.ok(summary.patterns_updated.includes('title_missing'));
    assert.ok(summary.patterns_updated.includes('meta_description_missing'));
    assert.equal(summary.patterns_updated.length, 2);
  });

  it('non-fatal writeLearning failure', async () => {
    const batch = makeBatch([makeAttempt()]);
    const summary = await processFeedbackBatch('s1', 'r1', batch, {
      writeLearning: async () => { throw new Error('DB down'); },
    });
    assert.equal(summary.learning_writes, 0);
    assert.equal(summary.total_events, 1);
  });

  it('handles empty batch', async () => {
    const batch = makeBatch([]);
    const summary = await processFeedbackBatch('s1', 'r1', batch);
    assert.equal(summary.total_events, 0);
    assert.equal(summary.success_rate, 0);
    assert.equal(summary.avg_confidence_delta, 0);
  });

  it('summarized_at is valid ISO', async () => {
    const batch = makeBatch([makeAttempt()]);
    const summary = await processFeedbackBatch('s1', 'r1', batch);
    assert.ok(!isNaN(Date.parse(summary.summarized_at)));
  });
});
