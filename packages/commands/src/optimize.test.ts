/**
 * packages/commands/src/optimize.test.ts
 *
 * Tests for runOptimize.
 * All external deps (Supabase, patch engine, validators) are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runOptimize,
  type OptimizeRequest,
  type OptimizeCommandOps,
  type ActionQueueItem,
  type ValidatorSuiteResult,
} from './optimize.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-uuid-001';
const TENANT_ID = 'tenant-uuid-001';
const SITE_ID   = 'site-uuid-001';

function baseReq(overrides: Partial<OptimizeRequest> = {}): OptimizeRequest {
  return {
    run_id:    RUN_ID,
    tenant_id: TENANT_ID,
    site_id:   SITE_ID,
    cms:       'shopify',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id:               'item-uuid-001',
    run_id:           RUN_ID,
    tenant_id:        TENANT_ID,
    site_id:          SITE_ID,
    issue_type:       'META_TITLE_MISSING',
    url:              'https://example.com/',
    risk_score:       2,
    priority:         5,
    category:         'content',
    proposed_fix:     { action: 'generate_title' },
    approval_required: false,
    auto_deploy:      true,
    execution_status: 'queued',
    ...overrides,
  };
}

const PASS_VALIDATORS: ValidatorSuiteResult = {
  url:      'https://example.com/',
  passed:   true,
  failures: [],
};

const FAIL_VALIDATORS: ValidatorSuiteResult = {
  url:      'https://example.com/',
  passed:   false,
  failures: ['lighthouse'],
};

/** Happy-path ops — 1 low-risk item that deploys. */
function happy(overrides: Partial<OptimizeCommandOps> = {}): Partial<OptimizeCommandOps> {
  return {
    loadQueue:     async () => [makeItem()],
    applyFix:      async () => {},
    runValidators: async () => PASS_VALIDATORS,
    deployFix:     async () => {},
    markStatus:    async () => {},
    ...overrides,
  };
}

/** Capture JSON log lines emitted to stdout. */
async function captureLog(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — test-only stdout capture
  process.stdout.write = (chunk: unknown): boolean => { chunks.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks
    .join('')
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l.trim()) as Record<string, unknown>);
}

// ── Auto-deploy: low-risk items (risk ≤ 3) ───────────────────────────────────

describe('runOptimize — low-risk items auto-deploy when validators pass', () => {
  it('risk_score=2 item deploys and fixes_deployed=1', async () => {
    const result = await runOptimize(baseReq(), happy({ loadQueue: async () => [makeItem({ risk_score: 2 })] }));
    assert.equal(result.status,                'completed');
    assert.equal(result.fixes_attempted,       1);
    assert.equal(result.fixes_deployed,        1);
    assert.equal(result.fixes_pending_approval, 0);
    assert.equal(result.fixes_failed,          0);
  });

  it('risk_score=3 (at threshold) deploys automatically', async () => {
    const result = await runOptimize(baseReq(), happy({ loadQueue: async () => [makeItem({ risk_score: 3 })] }));
    assert.equal(result.fixes_deployed, 1);
    assert.equal(result.fixes_pending_approval, 0);
  });

  it('deployFix is called for low-risk items', async () => {
    let deployCalled = false;
    await runOptimize(baseReq(), happy({ deployFix: async () => { deployCalled = true; } }));
    assert.ok(deployCalled);
  });

  it('markStatus called with "deployed" for low-risk items', async () => {
    const statuses: string[] = [];
    await runOptimize(baseReq(), happy({
      markStatus: async (_id, _tenant, status) => { statuses.push(status); },
    }));
    assert.ok(statuses.includes('deployed'));
  });

  it('custom auto_approve_max_risk=5: risk_score=5 deploys', async () => {
    const result = await runOptimize(
      { ...baseReq(), auto_approve_max_risk: 5 },
      happy({ loadQueue: async () => [makeItem({ risk_score: 5 })] }),
    );
    assert.equal(result.fixes_deployed, 1);
  });

  it('custom auto_approve_max_risk=5: risk_score=6 routes to approval', async () => {
    const result = await runOptimize(
      { ...baseReq(), auto_approve_max_risk: 5 },
      happy({ loadQueue: async () => [makeItem({ risk_score: 6, approval_required: false })] }),
    );
    assert.equal(result.fixes_pending_approval, 1);
    assert.equal(result.fixes_deployed, 0);
  });
});

// ── High-risk items route to pending_approval ─────────────────────────────────

describe('runOptimize — high-risk items route to pending_approval', () => {
  it('risk_score=4 (above default threshold=3) → pending_approval', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 4, approval_required: false })],
    }));
    assert.equal(result.fixes_pending_approval, 1);
    assert.equal(result.fixes_deployed,         0);
    assert.equal(result.fixes_failed,           0);
    assert.equal(result.status, 'completed');
  });

  it('risk_score=8 → pending_approval', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 8, approval_required: false })],
    }));
    assert.equal(result.fixes_pending_approval, 1);
  });

  it('deployFix is NOT called for high-risk items', async () => {
    let deployCalled = false;
    await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 8, approval_required: false })],
      deployFix: async () => { deployCalled = true; },
    }));
    assert.equal(deployCalled, false);
  });

  it('markStatus called with "pending_approval" for high-risk items', async () => {
    const statuses: string[] = [];
    await runOptimize(baseReq(), happy({
      loadQueue:  async () => [makeItem({ risk_score: 6, approval_required: false })],
      markStatus: async (_id, _tenant, status) => { statuses.push(status); },
    }));
    assert.ok(statuses.includes('pending_approval'));
  });
});

// ── approval_required=true always routes to approval ─────────────────────────

describe('runOptimize — approval_required=true always routes to approval', () => {
  it('approval_required=true with risk_score=1 → pending_approval (not deployed)', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 1, approval_required: true })],
    }));
    assert.equal(result.fixes_pending_approval, 1);
    assert.equal(result.fixes_deployed,         0);
  });

  it('approval_required=true with risk_score=2 → pending_approval', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 2, approval_required: true })],
    }));
    assert.equal(result.fixes_pending_approval, 1);
    assert.equal(result.fixes_deployed,         0);
  });

  it('deployFix is NOT called when approval_required=true', async () => {
    let deployCalled = false;
    await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 1, approval_required: true })],
      deployFix: async () => { deployCalled = true; },
    }));
    assert.equal(deployCalled, false);
  });
});

// ── fix_source='manual' skips adapter call ────────────────────────────────────

describe("runOptimize — fix_source='manual' routes to pending_approval without calling applyFix", () => {
  it("fix_source='manual' → pending_approval, applyFix NOT called", async () => {
    let applyCalled = false;
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({
        risk_score:       1,
        approval_required: true,
        proposed_fix:     { fix_source: 'manual' },
      })],
      applyFix: async () => { applyCalled = true; },
    }));
    assert.equal(result.fixes_pending_approval, 1);
    assert.equal(result.fixes_deployed,         0);
    assert.equal(result.fixes_failed,           0);
    assert.equal(applyCalled, false, 'should not call applyFix for manual fix');
  });

  it("fix_source='manual' with throwing applyFix → still pending_approval (not failed)", async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({
        risk_score:       1,
        approval_required: true,
        proposed_fix:     { fix_source: 'manual' },
      })],
      applyFix: async () => { throw new Error('image_alt fix requires after_value.product_id and after_value.image_id'); },
    }));
    assert.equal(result.fixes_pending_approval, 1);
    assert.equal(result.fixes_failed,           0);
  });
});

// ── Validator failure ─────────────────────────────────────────────────────────

describe('runOptimize — validator failure marks item failed and continues', () => {
  it('single validator failure → fixes_failed=1, status=completed (zero items succeed)', async () => {
    const result = await runOptimize(baseReq(), happy({
      runValidators: async () => FAIL_VALIDATORS,
    }));
    assert.equal(result.fixes_failed,   1);
    assert.equal(result.fixes_deployed, 0);
    // all items failed → overall status = 'failed'
    assert.equal(result.status, 'failed');
  });

  it('one pass, one validator-fail → partial', async () => {
    let callCount = 0;
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [
        makeItem({ id: 'item-1', risk_score: 2 }),
        makeItem({ id: 'item-2', risk_score: 2 }),
      ],
      runValidators: async () => {
        callCount++;
        return callCount === 1 ? PASS_VALIDATORS : FAIL_VALIDATORS;
      },
    }));
    assert.equal(result.fixes_deployed, 1);
    assert.equal(result.fixes_failed,   1);
    assert.equal(result.status,         'partial');
  });

  it('deployFix is NOT called when validators fail', async () => {
    let deployCalled = false;
    await runOptimize(baseReq(), happy({
      runValidators: async () => FAIL_VALIDATORS,
      deployFix:     async () => { deployCalled = true; },
    }));
    assert.equal(deployCalled, false);
  });

  it('markStatus called with "failed" when validators fail', async () => {
    const statuses: string[] = [];
    await runOptimize(baseReq(), happy({
      runValidators: async () => FAIL_VALIDATORS,
      markStatus:    async (_id, _tenant, status) => { statuses.push(status); },
    }));
    assert.ok(statuses.includes('failed'));
  });

  it('does not throw when runValidators throws', async () => {
    await assert.doesNotReject(() =>
      runOptimize(baseReq(), happy({
        runValidators: async () => { throw new Error('axe crash'); },
      })),
    );
  });

  it('runValidators throw → marks item failed', async () => {
    const result = await runOptimize(baseReq(), happy({
      runValidators: async () => { throw new Error('axe crash'); },
    }));
    assert.equal(result.fixes_failed, 1);
  });
});

// ── Patch engine failure on one item does not stop others ─────────────────────

describe('runOptimize — patch engine failure on one item does not stop others', () => {
  it('applyFix throws on item 1, item 2 still processes', async () => {
    let applyCount = 0;
    let deployCount = 0;
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [
        makeItem({ id: 'item-1', risk_score: 2 }),
        makeItem({ id: 'item-2', risk_score: 2 }),
      ],
      applyFix: async () => {
        applyCount++;
        if (applyCount === 1) throw new Error('patch engine crashed');
      },
      deployFix: async () => { deployCount++; },
    }));
    assert.equal(result.fixes_failed,   1);
    assert.equal(result.fixes_deployed, 1);
    assert.equal(result.status,         'partial');
    assert.equal(deployCount,           1);
  });

  it('does not throw when applyFix throws', async () => {
    await assert.doesNotReject(() =>
      runOptimize(baseReq(), happy({
        applyFix: async () => { throw new Error('fatal patch error'); },
      })),
    );
  });

  it('applyFix failure → markStatus called with "failed"', async () => {
    const statuses: string[] = [];
    await runOptimize(baseReq(), happy({
      applyFix:   async () => { throw new Error('err'); },
      markStatus: async (_id, _tenant, status) => { statuses.push(status); },
    }));
    assert.ok(statuses.includes('failed'));
  });

  it('3 items: first fails patch, second fails validators, third deploys → partial', async () => {
    let applyCount = 0;
    let validatorCount = 0;
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [
        makeItem({ id: 'item-1', risk_score: 2 }),
        makeItem({ id: 'item-2', risk_score: 2 }),
        makeItem({ id: 'item-3', risk_score: 2 }),
      ],
      applyFix: async () => {
        applyCount++;
        if (applyCount === 1) throw new Error('patch fail');
      },
      runValidators: async () => {
        validatorCount++;
        return validatorCount === 1 ? FAIL_VALIDATORS : PASS_VALIDATORS;
      },
    }));
    assert.equal(result.fixes_failed,   2);
    assert.equal(result.fixes_deployed, 1);
    assert.equal(result.status,         'partial');
  });
});

// ── fixes totals add up ───────────────────────────────────────────────────────

describe('runOptimize — fixes_deployed + fixes_pending_approval + fixes_failed === fixes_attempted', () => {
  it('totals add up: 3 items, 1 deploy, 1 approval, 1 fail', async () => {
    let applyCount    = 0;
    let validatorCount = 0;
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [
        makeItem({ id: 'item-1', risk_score: 2,  approval_required: false }),
        makeItem({ id: 'item-2', risk_score: 8,  approval_required: false }),
        makeItem({ id: 'item-3', risk_score: 2,  approval_required: false }),
      ],
      applyFix: async () => {
        applyCount++;
        if (applyCount === 3) throw new Error('fail');
      },
      runValidators: async () => {
        validatorCount++;
        return PASS_VALIDATORS;
      },
    }));
    assert.equal(
      result.fixes_deployed + result.fixes_pending_approval + result.fixes_failed,
      result.fixes_attempted,
    );
    assert.equal(result.fixes_attempted, 3);
  });

  it('totals add up: all 5 deployed', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem({ id: `item-${i}`, risk_score: 1 }));
    const result = await runOptimize(baseReq(), happy({ loadQueue: async () => items }));
    assert.equal(result.fixes_deployed,        5);
    assert.equal(result.fixes_pending_approval, 0);
    assert.equal(result.fixes_failed,           0);
    assert.equal(
      result.fixes_deployed + result.fixes_pending_approval + result.fixes_failed,
      result.fixes_attempted,
    );
  });

  it('totals add up: all 5 pending_approval', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem({ id: `item-${i}`, risk_score: 9 }));
    const result = await runOptimize(baseReq(), happy({ loadQueue: async () => items }));
    assert.equal(result.fixes_pending_approval, 5);
    assert.equal(
      result.fixes_deployed + result.fixes_pending_approval + result.fixes_failed,
      result.fixes_attempted,
    );
  });

  it('totals add up: all 5 failed', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem({ id: `item-${i}` }));
    const result = await runOptimize(baseReq(), happy({
      loadQueue:    async () => items,
      runValidators: async () => FAIL_VALIDATORS,
    }));
    assert.equal(result.fixes_failed, 5);
    assert.equal(
      result.fixes_deployed + result.fixes_pending_approval + result.fixes_failed,
      result.fixes_attempted,
    );
  });
});

// ── ActionLog: optimize:complete ─────────────────────────────────────────────

describe('runOptimize — ActionLog receives optimize:complete with counts', () => {
  it('writes optimize:start and optimize:complete', async () => {
    const entries = await captureLog(() => runOptimize(baseReq(), happy()));
    const startIdx    = entries.findIndex((e) => e['stage'] === 'optimize:start');
    const completeIdx = entries.findIndex((e) => e['stage'] === 'optimize:complete');
    assert.ok(startIdx    >= 0, 'optimize:start not found');
    assert.ok(completeIdx >= 0, 'optimize:complete not found');
    assert.ok(startIdx < completeIdx);
  });

  it('optimize:complete metadata has correct counts', async () => {
    const entries = await captureLog(() => runOptimize(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'optimize:complete');
    assert.ok(complete, 'Expected optimize:complete');
    assert.equal(complete['status'], 'ok');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(typeof meta['fixes_attempted'],        'number');
    assert.equal(typeof meta['fixes_deployed'],         'number');
    assert.equal(typeof meta['fixes_pending_approval'], 'number');
    assert.equal(typeof meta['fixes_failed'],           'number');
  });

  it('optimize:complete counts match result when 2 deploy and 1 fail', async () => {
    let validatorCount = 0;
    let metaCapture: Record<string, unknown> | null = null;
    await captureLog(() =>
      runOptimize(baseReq(), happy({
        loadQueue: async () => [
          makeItem({ id: 'item-1', risk_score: 2 }),
          makeItem({ id: 'item-2', risk_score: 2 }),
          makeItem({ id: 'item-3', risk_score: 2 }),
        ],
        runValidators: async () => {
          validatorCount++;
          return validatorCount === 2 ? FAIL_VALIDATORS : PASS_VALIDATORS;
        },
      })),
    ).then((entries) => {
      const complete = entries.find((e) => e['stage'] === 'optimize:complete');
      metaCapture = complete?.['metadata'] as Record<string, unknown> ?? null;
    });
    assert.ok(metaCapture);
    assert.equal(metaCapture['fixes_attempted'],        3);
    assert.equal(metaCapture['fixes_deployed'],         2);
    assert.equal(metaCapture['fixes_failed'],           1);
    assert.equal(metaCapture['fixes_pending_approval'], 0);
  });

  it('writes optimize:failed (not optimize:complete) when loadQueue throws', async () => {
    const entries = await captureLog(() =>
      runOptimize(baseReq(), happy({
        loadQueue: async () => { throw new Error('db down'); },
      })),
    );
    const failed   = entries.find((e) => e['stage'] === 'optimize:failed');
    const complete = entries.find((e) => e['stage'] === 'optimize:complete');
    assert.ok(failed,    'Expected optimize:failed');
    assert.equal(complete, undefined);
  });
});

// ── Validation failures ───────────────────────────────────────────────────────

describe('runOptimize — validation failures return status=failed without throwing', () => {
  it('returns status=failed when run_id is empty', async () => {
    const result = await runOptimize({ ...baseReq(), run_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('run_id'));
  });

  it('returns status=failed when tenant_id is empty', async () => {
    const result = await runOptimize({ ...baseReq(), tenant_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('tenant_id'));
  });

  it('returns status=failed when loadQueue throws', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => { throw new Error('Supabase timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Supabase timeout'));
  });

  it('does not throw when loadQueue throws', async () => {
    await assert.doesNotReject(() =>
      runOptimize(baseReq(), happy({
        loadQueue: async () => { throw new Error('db error'); },
      })),
    );
  });

  it('empty queue returns status=completed with all zeros', async () => {
    const result = await runOptimize(baseReq(), happy({ loadQueue: async () => [] }));
    assert.equal(result.status,          'completed');
    assert.equal(result.fixes_attempted, 0);
    assert.equal(result.fixes_deployed,  0);
  });
});

// ── Overall status derivation ─────────────────────────────────────────────────

describe('runOptimize — status field derivation', () => {
  it('all items deploy → completed', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 1 }), makeItem({ id: 'item-2', risk_score: 2 })],
    }));
    assert.equal(result.status, 'completed');
  });

  it('all items pending approval → completed (no failures)', async () => {
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ risk_score: 9, approval_required: false })],
    }));
    assert.equal(result.status, 'completed');
  });

  it('some items fail, some succeed → partial', async () => {
    let validatorCount = 0;
    const result = await runOptimize(baseReq(), happy({
      loadQueue: async () => [makeItem({ id: 'a', risk_score: 2 }), makeItem({ id: 'b', risk_score: 2 })],
      runValidators: async () => { validatorCount++; return validatorCount === 1 ? FAIL_VALIDATORS : PASS_VALIDATORS; },
    }));
    assert.equal(result.status, 'partial');
  });

  it('all items fail → failed', async () => {
    const result = await runOptimize(baseReq(), happy({
      applyFix: async () => { throw new Error('crash'); },
    }));
    assert.equal(result.status, 'failed');
  });
});
