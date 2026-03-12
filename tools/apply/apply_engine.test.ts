/**
 * tools/apply/apply_engine.test.ts
 *
 * Tests for the apply engine with mocked Shopify API calls.
 * Run: node --test tools/apply/apply_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyFix, applyBatch, type ApprovedItem, type ApplyDeps } from './apply_engine.js';
import type { ShopifyFixRequest, ShopifyFixResult } from '../../packages/adapters/shopify/src/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ApprovedItem> = {}): ApprovedItem {
  return {
    id:               'action-001',
    run_id:           'run-001',
    tenant_id:        'tenant-001',
    site_id:          'site-001',
    issue_type:       'title_missing',
    url:              'https://example.com/pages/about',
    risk_score:       3,
    priority:         2,
    proposed_fix:     { new_title: 'About Us | Example Store' },
    execution_status: 'approved',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ApplyDeps> = {}): ApplyDeps {
  const logs: Array<Record<string, unknown>> = [];
  const marks: Array<{ type: string; id: string; error?: string }> = [];

  return {
    loadItem: async () => null,
    loadCredentials: async () => ({
      access_token: 'shpat_test_token',
      store_url:    'https://example.myshopify.com',
    }),
    shopifyApplyFix: async (req: ShopifyFixRequest): Promise<ShopifyFixResult> => ({
      action_id:    req.action_id,
      success:      true,
      fix_type:     req.fix_type,
      sandbox:      false,
      before_value: { metafield_id: 123, old_value: 'Old Title' },
    }),
    markDeployed: async (id) => { marks.push({ type: 'deployed', id }); },
    markFailed:   async (id, error) => { marks.push({ type: 'failed', id, error }); },
    writeLog:     (entry) => { logs.push(entry); },
    // Disable real schemaApply by default so schema tests fall through to shopifyApplyFix
    schemaApply:  undefined,
    ...overrides,
    // Expose for assertions
    _logs:  logs,
    _marks: marks,
  } as ApplyDeps & { _logs: unknown[]; _marks: unknown[] };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('applyFix', () => {
  it('successfully applies a title fix', async () => {
    const deps = makeDeps();
    const item = makeItem({ issue_type: 'title_missing' });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(result.fix_type, 'meta_title');
    assert.equal(result.action_id, 'action-001');
    assert.deepStrictEqual(result.before_value, { metafield_id: 123, old_value: 'Old Title' });

    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks.length, 1);
    assert.equal(marks[0].type, 'deployed');
  });

  it('successfully applies a meta description fix', async () => {
    const deps = makeDeps();
    const item = makeItem({
      issue_type:   'meta_too_short',
      proposed_fix: { new_description: 'A great meta description for this page' },
    });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(result.fix_type, 'meta_description');
  });

  it('successfully applies a schema fix', async () => {
    const deps = makeDeps();
    const item = makeItem({
      issue_type:   'schema_missing',
      proposed_fix: { schema: { '@type': 'Product' } },
    });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(result.fix_type, 'schema');
  });

  it('successfully applies a redirect fix', async () => {
    const deps = makeDeps();
    const item = makeItem({
      issue_type:   'redirect_chain',
      proposed_fix: { from: '/old', to: '/new' },
    });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(result.fix_type, 'redirect');
  });

  it('rejects item that is not approved', async () => {
    const deps = makeDeps();
    const item = makeItem({ execution_status: 'queued' });

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /not approved/);
  });

  it('fails when unknown issue_type', async () => {
    const deps = makeDeps();
    const item = makeItem({ issue_type: 'unknown_type_xyz' });

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /Unknown issue_type/);

    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks[0].type, 'failed');
  });

  it('fails when no credentials found', async () => {
    const deps = makeDeps({
      loadCredentials: async () => null,
    });
    const item = makeItem();

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /No credentials found/);
  });

  it('fails when credential loading throws', async () => {
    const deps = makeDeps({
      loadCredentials: async () => { throw new Error('DB connection failed'); },
    });
    const item = makeItem();

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /DB connection failed/);
  });

  it('fails when Shopify adapter throws', async () => {
    const deps = makeDeps({
      shopifyApplyFix: async () => { throw new Error('Network timeout'); },
    });
    const item = makeItem();

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /Network timeout/);

    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks[0].type, 'failed');
  });

  it('fails when Shopify adapter returns success=false', async () => {
    const deps = makeDeps({
      shopifyApplyFix: async (req) => ({
        action_id: req.action_id,
        success:   false,
        fix_type:  req.fix_type,
        sandbox:   false,
        error:     'Resource not found for URL',
      }),
    });
    const item = makeItem();

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /Resource not found/);

    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks[0].type, 'failed');
  });

  it('passes correct ShopifyFixRequest for title fix', async () => {
    let capturedRequest: ShopifyFixRequest | null = null;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        capturedRequest = req;
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
    });
    const item = makeItem({
      proposed_fix: { new_title: 'New SEO Title | Brand' },
    });

    await applyFix(item, deps);

    assert.ok(capturedRequest);
    assert.equal(capturedRequest!.fix_type, 'meta_title');
    assert.equal(capturedRequest!.target_url, 'https://example.com/pages/about');
    assert.equal(capturedRequest!.access_token, 'shpat_test_token');
    assert.deepStrictEqual(capturedRequest!.after_value, { new_title: 'New SEO Title | Brand' });
    assert.equal(capturedRequest!.sandbox, false);
  });

  it('passes correct ShopifyFixRequest for meta fix with generated_text', async () => {
    let capturedRequest: ShopifyFixRequest | null = null;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        capturedRequest = req;
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
    });
    const item = makeItem({
      issue_type:   'meta_too_short',
      proposed_fix: { generated_text: 'AI-generated meta description with good SEO keywords' },
    });

    await applyFix(item, deps);

    assert.ok(capturedRequest);
    assert.equal(capturedRequest!.fix_type, 'meta_description');
    assert.deepStrictEqual(capturedRequest!.after_value, {
      new_description: 'AI-generated meta description with good SEO keywords',
    });
  });

  it('writes log entries on success', async () => {
    const deps = makeDeps();
    const item = makeItem();

    await applyFix(item, deps);

    const logs = (deps as unknown as { _logs: Array<Record<string, unknown>> })._logs;
    assert.ok(logs.length >= 2);
    assert.equal(logs[0].stage, 'apply:start');
    assert.equal(logs[1].stage, 'apply:deployed');
    assert.equal(logs[1].status, 'ok');
  });

  it('writes log entries on failure', async () => {
    const deps = makeDeps({
      shopifyApplyFix: async () => { throw new Error('API error'); },
    });
    const item = makeItem();

    await applyFix(item, deps);

    const logs = (deps as unknown as { _logs: Array<Record<string, unknown>> })._logs;
    const failLog = logs.find((l) => l.stage === 'apply:failed');
    assert.ok(failLog);
    assert.equal(failLog!.status, 'failed');
    assert.match(failLog!.error as string, /API error/);
  });

  it('handles markDeployed throwing gracefully', async () => {
    const deps = makeDeps({
      markDeployed: async () => { throw new Error('DB write failed'); },
    });
    const item = makeItem();

    const result = await applyFix(item, deps);

    // Should still return success since the Shopify fix succeeded
    assert.equal(result.success, true);
  });
});

describe('applyFix — triage gate', () => {
  it('skips item with triage_recommendation=skip', async () => {
    const deps = makeDeps();
    const item = makeItem({ triage_recommendation: 'skip' });

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /Skipped by triage.*skip/);

    const logs = (deps as unknown as { _logs: Array<Record<string, unknown>> })._logs;
    assert.equal(logs[0].stage, 'apply:skipped');
  });

  it('skips item with triage_recommendation=review without override', async () => {
    const deps = makeDeps();
    const item = makeItem({ triage_recommendation: 'review' });

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /review/);
  });

  it('applies item with triage_recommendation=review when overrideReview=true', async () => {
    const deps = makeDeps();
    const item = makeItem({ triage_recommendation: 'review' });

    const result = await applyFix(item, deps, { overrideReview: true });

    assert.equal(result.success, true);
  });

  it('applies item with triage_recommendation=deploy', async () => {
    const deps = makeDeps();
    const item = makeItem({ triage_recommendation: 'deploy' });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
  });

  it('applies item with null triage_recommendation (not triaged)', async () => {
    const deps = makeDeps();
    const item = makeItem({ triage_recommendation: null });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
  });

  it('applies item with undefined triage_recommendation', async () => {
    const deps = makeDeps();
    const item = makeItem();
    // triage_recommendation is not set (undefined)

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
  });
});

describe('applyFix — schemaApply dep', () => {
  it('schema issue calls schemaApply dep, not shopifyApplyFix', async () => {
    let shopifyCallCount = 0;
    let schemaCallCount  = 0;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        shopifyCallCount++;
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
      schemaApply: async () => {
        schemaCallCount++;
        return { success: true, metafieldId: 'mf-999', schemaType: 'Product' };
      },
    });
    const item = makeItem({ issue_type: 'schema_missing', proposed_fix: {} });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(schemaCallCount,  1, 'schemaApply must be called');
    assert.equal(shopifyCallCount, 0, 'shopifyApplyFix must NOT be called');
  });

  it('schemaApply success → markDeployed called and log stage=apply:deployed', async () => {
    const deps = makeDeps({
      schemaApply: async () => ({ success: true, metafieldId: 'mf-1', schemaType: 'Product' }),
    });
    const item = makeItem({ issue_type: 'schema_missing', proposed_fix: {} });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(result.fix_type, 'schema');

    const marks = (deps as unknown as { _marks: Array<{ type: string; id: string }> })._marks;
    assert.equal(marks.length, 1);
    assert.equal(marks[0].type, 'deployed');
    assert.equal(marks[0].id,   'action-001');

    const logs = (deps as unknown as { _logs: Array<Record<string, unknown>> })._logs;
    const deployed = logs.find((l) => l.stage === 'apply:deployed');
    assert.ok(deployed, 'apply:deployed log entry must exist');
    assert.equal(deployed!.status, 'ok');
    assert.equal(deployed!.field,  'schema');
  });

  it('schemaApply failure → markFailed called and log stage=apply:failed', async () => {
    const deps = makeDeps({
      schemaApply: async () => ({ success: false, error: 'metafield write failed' }),
    });
    const item = makeItem({ issue_type: 'schema_missing', proposed_fix: {} });

    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /metafield write failed/);

    const marks = (deps as unknown as { _marks: Array<{ type: string; id: string; error?: string }> })._marks;
    assert.equal(marks.length, 1);
    assert.equal(marks[0].type, 'failed');
    assert.match(marks[0].error!, /metafield write failed/);

    const logs = (deps as unknown as { _logs: Array<Record<string, unknown>> })._logs;
    const failLog = logs.find((l) => l.stage === 'apply:failed');
    assert.ok(failLog, 'apply:failed log entry must exist');
    assert.equal(failLog!.status, 'failed');
  });

  it('schema issue falls through to shopifyApplyFix when schemaApply not provided', async () => {
    let shopifyCallCount = 0;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        shopifyCallCount++;
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
      // schemaApply intentionally not set
    });
    const item = makeItem({ issue_type: 'schema_missing', proposed_fix: {} });

    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(shopifyCallCount, 1, 'shopifyApplyFix must be called as fallback');
  });
});

describe('applyBatch', () => {
  it('applies multiple items and returns summary', async () => {
    const deps = makeDeps();
    const items = [
      makeItem({ id: 'a1', issue_type: 'title_missing' }),
      makeItem({ id: 'a2', issue_type: 'meta_too_short', proposed_fix: { new_description: 'Better meta' } }),
      makeItem({ id: 'a3', issue_type: 'schema_missing', proposed_fix: { schema: {} } }),
    ];

    const result = await applyBatch(items, deps);

    assert.equal(result.applied, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.results.length, 3);
    assert.equal(result.errors.length, 0);
  });

  it('handles mixed success and failure', async () => {
    let callCount = 0;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        callCount++;
        if (callCount === 2) {
          return { action_id: req.action_id, success: false, fix_type: req.fix_type, sandbox: false, error: 'Not found' };
        }
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
    });
    const items = [
      makeItem({ id: 'a1' }),
      makeItem({ id: 'a2' }),
      makeItem({ id: 'a3' }),
    ];

    const result = await applyBatch(items, deps);

    assert.equal(result.applied, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /a2/);
  });

  it('handles empty batch', async () => {
    const deps = makeDeps();
    const result = await applyBatch([], deps);

    assert.equal(result.applied, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.results.length, 0);
  });
});

// ── Timestamp intercept ───────────────────────────────────────────────────────

describe('applyFix — timestamp intercept', () => {
  function makeTimestampItem(overrides: Partial<ApprovedItem> = {}): ApprovedItem {
    return makeItem({
      issue_type: 'TIMESTAMP_MISSING',
      proposed_fix: { html_url: 'https://example.com/pages/about' },
      ...overrides,
    });
  }

  const FAKE_FIXES = [
    { type: 'inject_jsonld_date_modified' as const, new_value: '2026-03-11T12:00:00Z', target: 'jsonld' as const },
    { type: 'inject_og_modified_time' as const, new_value: '2026-03-11T12:00:00Z', target: 'og' as const },
  ];

  it('calls timestampApply dep for TIMESTAMP_MISSING, not shopifyApplyFix', async () => {
    let shopifyCalled = false;
    let timestampCalled = false;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        shopifyCalled = true;
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
      timestampApply: async () => {
        timestampCalled = true;
        return { success: true, timestamp_fixes: FAKE_FIXES };
      },
    });
    await applyFix(makeTimestampItem(), deps);
    assert.ok(timestampCalled, 'timestampApply should have been called');
    assert.ok(!shopifyCalled, 'shopifyApplyFix should NOT have been called');
  });

  it('timestampApply success → markDeployed + log + timestamp_fixes in result', async () => {
    const deps = makeDeps({
      timestampApply: async () => ({ success: true, timestamp_fixes: FAKE_FIXES }),
    });
    const result = await applyFix(makeTimestampItem(), deps);
    assert.ok(result.success);
    assert.deepStrictEqual(result.timestamp_fixes, FAKE_FIXES);
    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks[0]?.type, 'deployed');
    const logs = (deps as unknown as { _logs: Array<{ stage: string }> })._logs;
    assert.ok(logs.some((l) => l.stage === 'apply:deployed'));
  });

  it('timestampApply failure → markFailed + log + error in result', async () => {
    const deps = makeDeps({
      timestampApply: async () => ({ success: false, error: 'fetch failed' }),
    });
    const result = await applyFix(makeTimestampItem(), deps);
    assert.ok(!result.success);
    assert.ok(result.error?.includes('fetch failed'));
    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks[0]?.type, 'failed');
  });

  it('falls through to shopifyApplyFix when timestampApply not provided', async () => {
    let shopifyCalled = false;
    const deps = makeDeps({
      shopifyApplyFix: async (req) => {
        shopifyCalled = true;
        return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false };
      },
      timestampApply: undefined,
    });
    const result = await applyFix(makeTimestampItem(), deps);
    assert.ok(shopifyCalled, 'should fall through to shopifyApplyFix');
    assert.ok(result.success);
  });

  it('also routes TIMESTAMP_STALE, DATE_MODIFIED_MISSING, DATE_MODIFIED_STALE', async () => {
    for (const issueType of ['TIMESTAMP_STALE', 'DATE_MODIFIED_MISSING', 'DATE_MODIFIED_STALE']) {
      let timestampCalled = false;
      const deps = makeDeps({
        timestampApply: async () => { timestampCalled = true; return { success: true }; },
      });
      await applyFix(makeTimestampItem({ issue_type: issueType }), deps);
      assert.ok(timestampCalled, `${issueType} should call timestampApply`);
    }
  });
});
