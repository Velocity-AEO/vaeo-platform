/**
 * packages/commands/src/promote.test.ts
 *
 * Tests for runPromote.
 * All external deps (Supabase, validators, patch engine) are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runPromote,
  type PromoteRequest,
  type PromoteCommandOps,
  type PendingItem,
  type RevalidateResult,
} from './promote.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-uuid-001';
const TENANT_ID = 'tenant-uuid-001';
const SITE_ID   = 'site-uuid-001';
const ACTION_ID = 'item-uuid-001';

function baseReq(overrides: Partial<PromoteRequest> = {}): PromoteRequest {
  return {
    run_id:      RUN_ID,
    tenant_id:   TENANT_ID,
    site_id:     SITE_ID,
    promote_all: true,
    ...overrides,
  };
}

let counter = 0;
function makeItem(overrides: Partial<PendingItem> = {}): PendingItem {
  counter++;
  return {
    id:               `item-uuid-${counter.toString().padStart(3, '0')}`,
    run_id:           RUN_ID,
    tenant_id:        TENANT_ID,
    site_id:          SITE_ID,
    issue_type:       'META_TITLE_MISSING',
    url:              `https://example.com/page-${counter}`,
    risk_score:       5,
    category:         'content',
    proposed_fix:     { action: 'generate_title' },
    execution_status: 'pending_approval',
    ...overrides,
  };
}

const PASS: RevalidateResult = { url: 'https://example.com/', passed: true, failures: [] };
const FAIL: RevalidateResult = { url: 'https://example.com/', passed: false, failures: ['lighthouse'] };

/** Happy-path ops: 1 pending item that re-validates and promotes. */
function happy(overrides: Partial<PromoteCommandOps> = {}): Partial<PromoteCommandOps> {
  const defaultItem = makeItem();
  return {
    loadItem:      async () => defaultItem,
    loadPending:   async () => [defaultItem],
    runValidators: async () => PASS,
    applyLive:     async () => {},
    markDeployed:  async () => {},
    markFailed:    async () => {},
    writeProof:    async () => {},
    ...overrides,
  };
}

/** Capture JSON log lines written to stdout during fn(). */
async function captureLog(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — test-only stdout capture
  process.stdout.write = (chunk: unknown): boolean => { chunks.push(String(chunk)); return true; };
  try { await fn(); } finally { process.stdout.write = orig; }
  return chunks
    .join('')
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l.trim()) as Record<string, unknown>);
}

// ── Single action_id promote ──────────────────────────────────────────────────

describe('runPromote — single action_id promote works correctly', () => {
  it('promotes the specific item by action_id', async () => {
    const item = makeItem({ id: ACTION_ID });
    const result = await runPromote(
      { ...baseReq(), promote_all: undefined, action_id: ACTION_ID },
      happy({ loadItem: async () => item, loadPending: async () => { throw new Error('should not be called'); } }),
    );
    assert.equal(result.status,   'completed');
    assert.equal(result.promoted, 1);
    assert.equal(result.failed,   0);
    assert.equal(result.skipped,  0);
  });

  it('loadItem is called with correct action_id and tenant_id', async () => {
    let capturedId     = '';
    let capturedTenant = '';
    const item = makeItem({ id: ACTION_ID });
    await runPromote(
      { ...baseReq(), promote_all: undefined, action_id: ACTION_ID },
      happy({
        loadItem: async (id, tenant) => { capturedId = id; capturedTenant = tenant; return item; },
      }),
    );
    assert.equal(capturedId,     ACTION_ID);
    assert.equal(capturedTenant, TENANT_ID);
  });

  it('returns promoted=0, skipped=0 when action_id not found', async () => {
    const result = await runPromote(
      { ...baseReq(), promote_all: undefined, action_id: 'nonexistent-uuid' },
      happy({ loadItem: async () => null }),
    );
    assert.equal(result.promoted, 0);
    assert.equal(result.skipped,  0);
    assert.equal(result.status,   'completed');
  });

  it('does not call loadPending when action_id is provided', async () => {
    let loadPendingCalled = false;
    const item = makeItem();
    await runPromote(
      { ...baseReq(), promote_all: undefined, action_id: item.id },
      happy({
        loadItem:    async () => item,
        loadPending: async () => { loadPendingCalled = true; return []; },
      }),
    );
    assert.equal(loadPendingCalled, false);
  });
});

// ── promote_all promotes all pending items ────────────────────────────────────

describe('runPromote — promote_all promotes all pending items', () => {
  it('promotes all 3 pending items', async () => {
    const items = [makeItem(), makeItem(), makeItem()];
    const result = await runPromote(baseReq(), happy({ loadPending: async () => items }));
    assert.equal(result.promoted, 3);
    assert.equal(result.failed,   0);
    assert.equal(result.skipped,  0);
    assert.equal(result.status,   'completed');
  });

  it('loadPending is called with correct run_id and tenant_id', async () => {
    let capturedRunId  = '';
    let capturedTenant = '';
    await runPromote(baseReq(), happy({
      loadPending: async (runId, tenant) => {
        capturedRunId  = runId;
        capturedTenant = tenant;
        return [makeItem()];
      },
    }));
    assert.equal(capturedRunId,  RUN_ID);
    assert.equal(capturedTenant, TENANT_ID);
  });

  it('applyLive is called once per promoted item', async () => {
    let applyCount = 0;
    const items = [makeItem(), makeItem()];
    await runPromote(baseReq(), happy({
      loadPending: async () => items,
      applyLive:   async () => { applyCount++; },
    }));
    assert.equal(applyCount, 2);
  });

  it('markDeployed is called for each promoted item', async () => {
    const deployedIds: string[] = [];
    const items = [makeItem(), makeItem()];
    await runPromote(baseReq(), happy({
      loadPending:  async () => items,
      markDeployed: async (id) => { deployedIds.push(id); },
    }));
    assert.equal(deployedIds.length, 2);
    assert.deepEqual(new Set(deployedIds), new Set(items.map((i) => i.id)));
  });

  it('writeProof is called for each promoted item', async () => {
    let proofCount = 0;
    const items = [makeItem(), makeItem(), makeItem()];
    await runPromote(baseReq(), happy({
      loadPending: async () => items,
      writeProof:  async () => { proofCount++; },
    }));
    assert.equal(proofCount, 3);
  });
});

// ── Validator failure on re-check ─────────────────────────────────────────────

describe('runPromote — validator failure on re-check skips that item as failed', () => {
  it('validator fail → failed=1, item not promoted', async () => {
    const result = await runPromote(baseReq(), happy({
      runValidators: async () => FAIL,
    }));
    assert.equal(result.failed,   1);
    assert.equal(result.promoted, 0);
    assert.equal(result.status,   'failed'); // 1 item, all failed
  });

  it('1 pass, 1 validator fail → partial', async () => {
    let callCount = 0;
    const result = await runPromote(baseReq(), happy({
      loadPending:   async () => [makeItem(), makeItem()],
      runValidators: async () => { callCount++; return callCount === 1 ? PASS : FAIL; },
    }));
    assert.equal(result.promoted, 1);
    assert.equal(result.failed,   1);
    assert.equal(result.status,   'partial');
  });

  it('applyLive is NOT called when validators fail', async () => {
    let applyCalled = false;
    await runPromote(baseReq(), happy({
      runValidators: async () => FAIL,
      applyLive:     async () => { applyCalled = true; },
    }));
    assert.equal(applyCalled, false);
  });

  it('markFailed is called when validators fail', async () => {
    const failedIds: string[] = [];
    const item = makeItem();
    await runPromote(baseReq(), happy({
      loadPending:   async () => [item],
      runValidators: async () => FAIL,
      markFailed:    async (id) => { failedIds.push(id); },
    }));
    assert.equal(failedIds.length, 1);
    assert.equal(failedIds[0], item.id);
  });

  it('runValidators throw → marks failed, continues', async () => {
    let callCount = 0;
    const result = await runPromote(baseReq(), happy({
      loadPending:   async () => [makeItem(), makeItem()],
      runValidators: async () => {
        callCount++;
        if (callCount === 1) throw new Error('validator crash');
        return PASS;
      },
    }));
    assert.equal(result.failed,   1);
    assert.equal(result.promoted, 1);
    assert.equal(result.status,   'partial');
  });

  it('does not throw when runValidators throws', async () => {
    await assert.doesNotReject(() =>
      runPromote(baseReq(), happy({ runValidators: async () => { throw new Error('crash'); } })),
    );
  });
});

// ── Patch engine failure ──────────────────────────────────────────────────────

describe('runPromote — patch engine failure marks failed and continues others', () => {
  it('applyLive throws → marks failed, continues', async () => {
    let applyCount = 0;
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [makeItem(), makeItem()],
      applyLive:   async () => {
        applyCount++;
        if (applyCount === 1) throw new Error('patch engine error');
      },
    }));
    assert.equal(result.failed,   1);
    assert.equal(result.promoted, 1);
    assert.equal(result.status,   'partial');
  });

  it('does not throw when applyLive throws', async () => {
    await assert.doesNotReject(() =>
      runPromote(baseReq(), happy({ applyLive: async () => { throw new Error('fatal'); } })),
    );
  });

  it('markFailed is called when applyLive throws', async () => {
    const failedIds: string[] = [];
    const item = makeItem();
    await runPromote(baseReq(), happy({
      loadPending: async () => [item],
      applyLive:   async () => { throw new Error('err'); },
      markFailed:  async (id) => { failedIds.push(id); },
    }));
    assert.equal(failedIds.length, 1);
    assert.equal(failedIds[0], item.id);
  });

  it('markDeployed is NOT called when applyLive throws', async () => {
    let markDeployedCalled = false;
    await runPromote(baseReq(), happy({
      applyLive:    async () => { throw new Error('err'); },
      markDeployed: async () => { markDeployedCalled = true; },
    }));
    assert.equal(markDeployedCalled, false);
  });

  it('3 items: first fails applyLive, other two succeed → partial, promoted=2', async () => {
    let applyCount = 0;
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [makeItem(), makeItem(), makeItem()],
      applyLive:   async () => {
        applyCount++;
        if (applyCount === 1) throw new Error('patch fail');
      },
    }));
    assert.equal(result.promoted, 2);
    assert.equal(result.failed,   1);
    assert.equal(result.status,   'partial');
  });
});

// ── Already-deployed item counted as skipped ─────────────────────────────────

describe('runPromote — already-deployed item counted as skipped', () => {
  it('item with execution_status=deployed → skipped=1', async () => {
    const item = makeItem({ execution_status: 'deployed' });
    const result = await runPromote(baseReq(), happy({ loadPending: async () => [item] }));
    assert.equal(result.skipped,  1);
    assert.equal(result.promoted, 0);
    assert.equal(result.failed,   0);
  });

  it('item with execution_status=failed → skipped=1', async () => {
    const item = makeItem({ execution_status: 'failed' });
    const result = await runPromote(baseReq(), happy({ loadPending: async () => [item] }));
    assert.equal(result.skipped, 1);
  });

  it('applyLive is NOT called for skipped items', async () => {
    let applyCalled = false;
    const item = makeItem({ execution_status: 'deployed' });
    await runPromote(baseReq(), happy({
      loadPending: async () => [item],
      applyLive:   async () => { applyCalled = true; },
    }));
    assert.equal(applyCalled, false);
  });

  it('runValidators is NOT called for skipped items', async () => {
    let validatorCalled = false;
    const item = makeItem({ execution_status: 'deployed' });
    await runPromote(baseReq(), happy({
      loadPending:   async () => [item],
      runValidators: async () => { validatorCalled = true; return PASS; },
    }));
    assert.equal(validatorCalled, false);
  });

  it('2 pending + 1 already-deployed → promoted=2, skipped=1', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [makeItem(), makeItem(), makeItem({ execution_status: 'deployed' })],
    }));
    assert.equal(result.promoted, 2);
    assert.equal(result.skipped,  1);
    assert.equal(result.failed,   0);
  });
});

// ── promoted + failed + skipped === total items ───────────────────────────────

describe('runPromote — promoted + failed + skipped === total items loaded', () => {
  it('4 items: 2 promote, 1 fail validator, 1 already deployed → totals=4', async () => {
    let validatorCount = 0;
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [
        makeItem(),
        makeItem(),
        makeItem(),
        makeItem({ execution_status: 'deployed' }),
      ],
      runValidators: async () => {
        validatorCount++;
        return validatorCount === 2 ? FAIL : PASS;
      },
    }));
    assert.equal(result.promoted + result.failed + result.skipped, 4);
    assert.equal(result.promoted, 2);
    assert.equal(result.failed,   1);
    assert.equal(result.skipped,  1);
  });

  it('all 5 promote → totals add up', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [makeItem(), makeItem(), makeItem(), makeItem(), makeItem()],
    }));
    assert.equal(result.promoted + result.failed + result.skipped, 5);
    assert.equal(result.promoted, 5);
  });

  it('all 3 fail validator → totals add up', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending:   async () => [makeItem(), makeItem(), makeItem()],
      runValidators: async () => FAIL,
    }));
    assert.equal(result.promoted + result.failed + result.skipped, 3);
    assert.equal(result.failed, 3);
  });
});

// ── ActionLog: promote:complete ───────────────────────────────────────────────

describe('runPromote — ActionLog receives promote:complete with counts', () => {
  it('writes promote:start before promote:complete', async () => {
    const entries = await captureLog(() => runPromote(baseReq(), happy()));
    const startIdx    = entries.findIndex((e) => e['stage'] === 'promote:start');
    const completeIdx = entries.findIndex((e) => e['stage'] === 'promote:complete');
    assert.ok(startIdx    >= 0, 'promote:start not found');
    assert.ok(completeIdx >= 0, 'promote:complete not found');
    assert.ok(startIdx < completeIdx);
  });

  it('promote:complete has promoted, failed, skipped in metadata', async () => {
    const entries = await captureLog(() => runPromote(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'promote:complete');
    assert.ok(complete, 'Expected promote:complete');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(typeof meta['promoted'], 'number');
    assert.equal(typeof meta['failed'],   'number');
    assert.equal(typeof meta['skipped'],  'number');
  });

  it('promote:complete metadata matches result counts', async () => {
    let validatorCount = 0;
    let metaCapture: Record<string, unknown> | null = null;
    await captureLog(() =>
      runPromote(baseReq(), happy({
        loadPending:   async () => [makeItem(), makeItem(), makeItem()],
        runValidators: async () => { validatorCount++; return validatorCount === 2 ? FAIL : PASS; },
      })),
    ).then((entries) => {
      const c = entries.find((e) => e['stage'] === 'promote:complete');
      metaCapture = (c?.['metadata'] as Record<string, unknown>) ?? null;
    });
    assert.ok(metaCapture);
    assert.equal(metaCapture['promoted'], 2);
    assert.equal(metaCapture['failed'],   1);
    assert.equal(metaCapture['skipped'],  0);
  });

  it('writes promote:failed (not promote:complete) when loadPending throws', async () => {
    const entries = await captureLog(() =>
      runPromote(baseReq(), happy({ loadPending: async () => { throw new Error('db down'); } })),
    );
    const failed   = entries.find((e) => e['stage'] === 'promote:failed');
    const complete = entries.find((e) => e['stage'] === 'promote:complete');
    assert.ok(failed, 'Expected promote:failed');
    assert.equal(complete, undefined);
  });
});

// ── No pending items / never throws ──────────────────────────────────────────

describe('runPromote — never throws when no pending items found', () => {
  it('empty pending list → status=completed, all zeros', async () => {
    const result = await runPromote(baseReq(), happy({ loadPending: async () => [] }));
    assert.equal(result.status,   'completed');
    assert.equal(result.promoted, 0);
    assert.equal(result.failed,   0);
    assert.equal(result.skipped,  0);
  });

  it('does not throw when loadPending returns empty list', async () => {
    await assert.doesNotReject(() =>
      runPromote(baseReq(), happy({ loadPending: async () => [] })),
    );
  });

  it('does not throw when loadPending throws', async () => {
    await assert.doesNotReject(() =>
      runPromote(baseReq(), happy({ loadPending: async () => { throw new Error('db error'); } })),
    );
  });

  it('returns status=failed when loadPending throws', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => { throw new Error('Supabase timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Supabase timeout'));
  });

  it('returns status=failed when run_id is empty', async () => {
    const result = await runPromote({ ...baseReq(), run_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('run_id'));
  });

  it('returns status=failed when neither action_id nor promote_all provided', async () => {
    const result = await runPromote({ run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('--action-id'));
  });

  it('markDeployed failure is non-blocking', async () => {
    const result = await runPromote(baseReq(), happy({
      markDeployed: async () => { throw new Error('db timeout'); },
    }));
    assert.equal(result.promoted, 1);
    assert.equal(result.status,   'completed');
  });

  it('writeProof failure is non-blocking', async () => {
    const result = await runPromote(baseReq(), happy({
      writeProof: async () => { throw new Error('S3 error'); },
    }));
    assert.equal(result.promoted, 1);
    assert.equal(result.status,   'completed');
  });
});

// ── Status derivation ─────────────────────────────────────────────────────────

describe('runPromote — status field derivation', () => {
  it('all promote → completed', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [makeItem(), makeItem()],
    }));
    assert.equal(result.status, 'completed');
  });

  it('all skipped → completed (no failures)', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending: async () => [makeItem({ execution_status: 'deployed' })],
    }));
    assert.equal(result.status, 'completed');
  });

  it('some fail, some promote → partial', async () => {
    let count = 0;
    const result = await runPromote(baseReq(), happy({
      loadPending:   async () => [makeItem(), makeItem()],
      runValidators: async () => { count++; return count === 1 ? FAIL : PASS; },
    }));
    assert.equal(result.status, 'partial');
  });

  it('all fail (no promote, no skip) → failed', async () => {
    const result = await runPromote(baseReq(), happy({
      loadPending:   async () => [makeItem(), makeItem()],
      runValidators: async () => FAIL,
    }));
    assert.equal(result.status, 'failed');
  });

  it('completed_at is a valid ISO 8601 timestamp', async () => {
    const result = await runPromote(baseReq(), happy());
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });
});
