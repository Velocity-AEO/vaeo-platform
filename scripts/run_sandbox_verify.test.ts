/**
 * scripts/run_sandbox_verify.test.ts
 *
 * Tests for the sandboxVerifyAndLog wiring function.
 * Injectable deps — no real HTTP, Supabase, or file I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sandboxVerifyAndLog,
  type SandboxWiringDeps,
} from './run_sandbox_verify.ts';
import type { VerifyResult } from '../tools/sandbox/sandbox_verify.ts';
import type { LogLearningResult } from '../tools/learning/learning_logger.ts';
import type { QueueResult } from '../tools/learning/approval_queue.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVerifyResult(status: 'PASS' | 'FAIL' | 'NO_SCHEMA', overrides: Partial<VerifyResult> = {}): VerifyResult {
  return {
    url:         'https://example.com/products/widget',
    fetchedAt:   '2026-03-11T00:00:00Z',
    schemaFound: status === 'PASS',
    schemaType:  status === 'PASS' ? 'Product' : null,
    valid:       status === 'PASS',
    errors:      [],
    rawSchema:   status === 'PASS' ? '{"@type":"Product"}' : null,
    status,
    ...overrides,
  };
}

function makeDeps(overrides: {
  verifyStatus?:    'PASS' | 'FAIL' | 'NO_SCHEMA';
  verifyResult?:    VerifyResult;
  logResult?:       LogLearningResult;
  queueResult?:     QueueResult;
  capturedLog?:     object[];
  capturedQueue?:   object[];
} = {}): SandboxWiringDeps {
  const capturedLog   = overrides.capturedLog   ?? [];
  const capturedQueue = overrides.capturedQueue ?? [];
  return {
    verify: async () =>
      overrides.verifyResult ?? makeVerifyResult(overrides.verifyStatus ?? 'PASS'),
    logLearning: async (entry) => {
      capturedLog.push(entry);
      return overrides.logResult ?? { ok: true, id: 'learn-1' };
    },
    queueForApproval: async (params) => {
      capturedQueue.push(params);
      return overrides.queueResult ?? { ok: true, id: 'queue-1' };
    },
  };
}

// ── PASS path ─────────────────────────────────────────────────────────────────

describe('sandboxVerifyAndLog — PASS', () => {
  it('returns verifyResult, learningId and queueId on PASS', async () => {
    const result = await sandboxVerifyAndLog('site-1', 'https://example.com/p1', 'SCHEMA_MISSING', {}, makeDeps());
    assert.equal(result.verifyResult.status, 'PASS');
    assert.equal(result.learningId, 'learn-1');
    assert.equal(result.queueId, 'queue-1');
  });

  it('calls queueForApproval with sandbox_status=PASS', async () => {
    const capturedQueue: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {}, makeDeps({ capturedQueue }));
    assert.equal(capturedQueue.length, 1);
    assert.equal((capturedQueue[0] as { sandbox_status: string }).sandbox_status, 'PASS');
  });

  it('logs learning with approval_status=pending on PASS', async () => {
    const capturedLog: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {}, makeDeps({ capturedLog }));
    assert.equal((capturedLog[0] as { approval_status: string }).approval_status, 'pending');
  });

  it('passes learning_id to queueForApproval', async () => {
    const capturedQueue: object[] = [];
    const deps = makeDeps({ capturedQueue, logResult: { ok: true, id: 'my-learning-id' } });
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {}, deps);
    assert.equal((capturedQueue[0] as { learning_id: string }).learning_id, 'my-learning-id');
  });
});

// ── FAIL / NO_SCHEMA path ─────────────────────────────────────────────────────

describe('sandboxVerifyAndLog — FAIL', () => {
  it('does NOT call queueForApproval on FAIL', async () => {
    const capturedQueue: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {},
      makeDeps({ verifyStatus: 'FAIL', capturedQueue }));
    assert.equal(capturedQueue.length, 0);
  });

  it('logs learning with approval_status=failed_sandbox on FAIL', async () => {
    const capturedLog: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {},
      makeDeps({ verifyStatus: 'FAIL', capturedLog }));
    assert.equal((capturedLog[0] as { approval_status: string }).approval_status, 'failed_sandbox');
    assert.equal((capturedLog[0] as { sandbox_status: string }).sandbox_status, 'FAIL');
  });

  it('does NOT call queueForApproval on NO_SCHEMA', async () => {
    const capturedQueue: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {},
      makeDeps({ verifyStatus: 'NO_SCHEMA', capturedQueue }));
    assert.equal(capturedQueue.length, 0);
  });
});

// ── PASS — field forwarding ───────────────────────────────────────────────────

describe('sandboxVerifyAndLog — PASS field forwarding', () => {
  it('passes rawSchema to after_value in learning entry', async () => {
    const capturedLog: object[] = [];
    const vr = makeVerifyResult('PASS', { rawSchema: '{"@type":"Product","name":"Widget"}' });
    await sandboxVerifyAndLog('site-1', 'https://example.com/p1', 'SCHEMA_MISSING', {},
      makeDeps({ verifyResult: vr, capturedLog }));
    assert.equal((capturedLog[0] as { after_value: string }).after_value, '{"@type":"Product","name":"Widget"}');
  });

  it('passes site_id through to logLearning entry', async () => {
    const capturedLog: object[] = [];
    await sandboxVerifyAndLog('my-site-uuid', 'https://example.com/', 'SCHEMA_MISSING', {},
      makeDeps({ capturedLog }));
    assert.equal((capturedLog[0] as { site_id: string }).site_id, 'my-site-uuid');
  });

  it('passes issue_type through to logLearning entry', async () => {
    const capturedLog: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'META_TITLE_MISSING', {},
      makeDeps({ capturedLog }));
    assert.equal((capturedLog[0] as { issue_type: string }).issue_type, 'META_TITLE_MISSING');
  });

  it('sets fix_type to schema', async () => {
    const capturedLog: object[] = [];
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {},
      makeDeps({ capturedLog }));
    assert.equal((capturedLog[0] as { fix_type: string }).fix_type, 'schema');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('sandboxVerifyAndLog — errors', () => {
  it('returns logError when logLearning fails', async () => {
    const deps = makeDeps({ logResult: { ok: false, error: 'DB timeout' } });
    const result = await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {}, deps);
    assert.equal(result.logError, 'DB timeout');
    assert.equal(result.learningId, undefined);
  });

  it('returns queueError when queueForApproval fails', async () => {
    const deps = makeDeps({ queueResult: { ok: false, error: 'FK missing' } });
    const result = await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {}, deps);
    assert.equal(result.queueError, 'FK missing');
    assert.equal(result.queueId, undefined);
  });

  it('does NOT call queueForApproval when logLearning fails (even on PASS)', async () => {
    const capturedQueue: object[] = [];
    const deps = makeDeps({ logResult: { ok: false, error: 'DB timeout' }, capturedQueue });
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {}, deps);
    assert.equal(capturedQueue.length, 0, 'should not queue when learning log failed');
  });

  it('passes sandbox_result with status and schemaType to queueForApproval', async () => {
    const capturedQueue: object[] = [];
    const vr = makeVerifyResult('PASS', { schemaType: 'Product' });
    await sandboxVerifyAndLog('site-1', 'https://example.com/', 'SCHEMA_MISSING', {},
      makeDeps({ verifyResult: vr, capturedQueue }));
    const queued = capturedQueue[0] as { sandbox_result: { status: string; schemaType: string } };
    assert.equal(queued.sandbox_result.status, 'PASS');
    assert.equal(queued.sandbox_result.schemaType, 'Product');
  });
});
