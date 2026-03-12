/**
 * tools/live/live_fix_executor.test.ts
 *
 * Tests for live fix executor.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeFixAttempt,
  executeFixBatch,
  type FixAttempt,
  type FixBatch,
} from './live_fix_executor.js';
import type { AggregatedIssue } from './issue_aggregator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_HTML = '<html><head><title>Test</title></head><body><p>Hi</p></body></html>';

function issue(fix_type: string, overrides?: Partial<AggregatedIssue>): AggregatedIssue {
  return {
    issue_id:    'iss_test',
    site_id:     'site_1',
    url:         'https://example.com/products/a',
    fix_type,
    severity:    'high',
    title:       `Issue: ${fix_type}`,
    description: `Detected ${fix_type}`,
    auto_fixable: true,
    confidence:  0.9,
    detected_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── executeFixAttempt — happy path ───────────────────────────────────────────

describe('executeFixAttempt — happy path', () => {
  it('returns success=true with default deps', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.equal(result.success, true);
  });

  it('returns sandbox_passed=true', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.equal(result.sandbox_passed, true);
  });

  it('returns deployed=true when not dry_run', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.equal(result.deployed, true);
  });

  it('modifies html_after', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.notEqual(result.html_after, result.html_before);
  });

  it('generates attempt_id starting with att_', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.ok(result.attempt_id.startsWith('att_'));
  });

  it('sets started_at and completed_at', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.ok(result.started_at.includes('T'));
    assert.ok(result.completed_at!.includes('T'));
  });

  it('populates debug_events', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false);
    assert.ok(result.debug_events.length > 0);
    assert.ok(result.debug_events.some((e) => e.includes('[apply]')));
    assert.ok(result.debug_events.some((e) => e.includes('[sandbox]')));
  });
});

// ── executeFixAttempt — dry_run ──────────────────────────────────────────────

describe('executeFixAttempt — dry_run', () => {
  it('skips deploy when dry_run=true', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, true);
    assert.equal(result.deployed, false);
    assert.equal(result.dry_run, true);
    assert.equal(result.success, true);
  });

  it('logs deploy skip in debug_events', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, true);
    assert.ok(result.debug_events.some((e) => e.includes('dry run')));
  });
});

// ── executeFixAttempt — failures ─────────────────────────────────────────────

describe('executeFixAttempt — failures', () => {
  it('returns success=false when applyFix fails', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false, {
      applyFix: async () => ({ html: BASE_HTML, success: false }),
    });
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('returns sandbox_passed=false when sandbox fails', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false, {
      applyFix: async (html) => ({ html: html + '<fix/>', success: true }),
      sandboxValidate: async () => ({ passed: false, errors: ['regression detected'] }),
    });
    assert.equal(result.success, false);
    assert.equal(result.sandbox_passed, false);
    assert.equal(result.deployed, false);
  });

  it('does not deploy when sandbox fails', async () => {
    let deployCalled = false;
    await executeFixAttempt(issue('title_missing'), BASE_HTML, false, {
      applyFix: async (html) => ({ html, success: true }),
      sandboxValidate: async () => ({ passed: false, errors: ['fail'] }),
      deployFix: async () => { deployCalled = true; return { deployed: true }; },
    });
    assert.equal(deployCalled, false);
  });

  it('handles applyFix throwing', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false, {
      applyFix: async () => { throw new Error('boom'); },
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes('boom'));
  });
});

// ── executeFixAttempt — injected deps ────────────────────────────────────────

describe('executeFixAttempt — injected deps', () => {
  it('uses injected applyFix', async () => {
    const result = await executeFixAttempt(issue('title_missing'), BASE_HTML, false, {
      applyFix: async (html) => ({ html: html + '<!-- custom -->', success: true }),
    });
    assert.ok(result.html_after.includes('<!-- custom -->'));
  });

  it('uses injected deployFix', async () => {
    let deployUrl = '';
    await executeFixAttempt(issue('title_missing'), BASE_HTML, false, {
      deployFix: async (_sid, url) => { deployUrl = url; return { deployed: true }; },
    });
    assert.equal(deployUrl, 'https://example.com/products/a');
  });
});

// ── executeFixBatch ──────────────────────────────────────────────────────────

describe('executeFixBatch', () => {
  const issues = [
    issue('title_missing'),
    issue('meta_description_missing'),
    issue('lang_missing'),
  ];

  it('processes all issues', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false);
    assert.equal(batch.attempts.length, 3);
  });

  it('computes success_count', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false);
    assert.equal(batch.success_count, 3);
  });

  it('computes failure_count when some fail', async () => {
    let callCount = 0;
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false, {
      applyFix: async (html) => {
        callCount++;
        if (callCount === 2) return { html, success: false };
        return { html: html + '<fix/>', success: true };
      },
    });
    assert.equal(batch.failure_count, 1);
    assert.equal(batch.success_count, 2);
  });

  it('computes sandbox_pass_count', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false);
    assert.equal(batch.sandbox_pass_count, 3);
  });

  it('computes deploy_count (0 on dry_run)', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', true);
    assert.equal(batch.deploy_count, 0);
    assert.equal(batch.dry_run, true);
  });

  it('generates batch_id starting with bat_', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false);
    assert.ok(batch.batch_id.startsWith('bat_'));
  });

  it('sets executed_at', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false);
    assert.ok(batch.executed_at.includes('T'));
  });

  it('uses injected fetchPageHTML', async () => {
    const batch = await executeFixBatch(issues, 'site_1', 'run_1', false, {
      fetchPageHTML: async () => '<html><head></head><body>Custom</body></html>',
    });
    assert.ok(batch.attempts[0].html_before.includes('Custom'));
  });
});
