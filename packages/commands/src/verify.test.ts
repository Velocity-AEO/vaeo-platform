/**
 * packages/commands/src/verify.test.ts
 *
 * Tests for runVerify.
 * All external deps (Supabase, validators) are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runVerify,
  type VerifyRequest,
  type VerifyCommandOps,
  type DeployedItem,
  type LiveValidatorResult,
  type RegressionItem,
} from './verify.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-uuid-001';
const TENANT_ID = 'tenant-uuid-001';
const SITE_ID   = 'site-uuid-001';

function baseReq(overrides: Partial<VerifyRequest> = {}): VerifyRequest {
  return { run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID, ...overrides };
}

let itemCounter = 0;
function makeItem(overrides: Partial<DeployedItem> = {}): DeployedItem {
  itemCounter++;
  return {
    id:               `item-uuid-${itemCounter.toString().padStart(3, '0')}`,
    run_id:           RUN_ID,
    tenant_id:        TENANT_ID,
    site_id:          SITE_ID,
    issue_type:       'META_TITLE_MISSING',
    url:              `https://example.com/page-${itemCounter}`,
    risk_score:       2,
    category:         'content',
    execution_status: 'deployed',
    ...overrides,
  };
}

const PASS: LiveValidatorResult = { url: 'https://example.com/', passed: true,  failures: [] };

function failResult(url: string, ...validators: Array<{ validator: string; detail: string }>): LiveValidatorResult {
  return { url, passed: false, failures: validators };
}

/** Happy-path ops: 1 deployed item that passes all validators. */
function happy(overrides: Partial<VerifyCommandOps> = {}): Partial<VerifyCommandOps> {
  return {
    loadDeployed:  async () => [makeItem()],
    runValidators: async () => PASS,
    markRegression: async () => {},
    flagRollback:  async () => {},
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

// ── Happy path: all validators pass ──────────────────────────────────────────

describe('runVerify — all validators pass → status=passed, regressions=[]', () => {
  it('returns status=passed when all validators pass', async () => {
    const result = await runVerify(baseReq(), happy());
    assert.equal(result.status,       'passed');
    assert.equal(result.urls_checked, 1);
    assert.equal(result.passed,       1);
    assert.equal(result.failed,       0);
    assert.deepEqual(result.regressions, []);
  });

  it('all 3 URLs pass → status=passed, passed=3', async () => {
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem()],
    }));
    assert.equal(result.status,  'passed');
    assert.equal(result.passed,  3);
    assert.equal(result.failed,  0);
    assert.equal(result.regressions.length, 0);
  });

  it('result fields are all correct types', async () => {
    const result = await runVerify(baseReq(), happy());
    assert.equal(typeof result.run_id,       'string');
    assert.equal(typeof result.site_id,      'string');
    assert.equal(typeof result.tenant_id,    'string');
    assert.equal(typeof result.urls_checked, 'number');
    assert.equal(typeof result.passed,       'number');
    assert.equal(typeof result.failed,       'number');
    assert.equal(typeof result.completed_at, 'string');
    assert.ok(Array.isArray(result.regressions));
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });

  it('markRegression and flagRollback are NOT called when all pass', async () => {
    let markCalled = false;
    let flagCalled = false;
    await runVerify(baseReq(), happy({
      markRegression: async () => { markCalled = true; },
      flagRollback:   async () => { flagCalled = true; },
    }));
    assert.equal(markCalled, false);
    assert.equal(flagCalled, false);
  });
});

// ── One validator fails → regression, status=partial ─────────────────────────

describe('runVerify — one validator fails → regression added, status=partial', () => {
  it('1 pass + 1 lighthouse fail → status=partial', async () => {
    let callCount = 0;
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      runValidators: async (item) => {
        callCount++;
        if (callCount === 2) {
          return failResult(item.url, { validator: 'lighthouse', detail: 'Performance score 0.55 < 0.70' });
        }
        return PASS;
      },
    }));
    assert.equal(result.status,  'partial');
    assert.equal(result.passed,  1);
    assert.equal(result.failed,  1);
    assert.equal(result.regressions.length, 1);
  });

  it('regression item has url, action_id, issue_type, validator, detail fields', async () => {
    const item = makeItem({ issue_type: 'META_TITLE_MISSING' });
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'lighthouse', detail: 'LCP 4.2s > 2.5s max' }),
    }));
    const reg = result.regressions[0]!;
    assert.equal(reg.url,        item.url);
    assert.equal(reg.action_id,  item.id);
    assert.equal(reg.issue_type, 'META_TITLE_MISSING');
    assert.equal(reg.validator,  'lighthouse');
    assert.equal(reg.detail,     'LCP 4.2s > 2.5s max');
  });

  it('multiple failing validators on one URL → one RegressionItem per validator', async () => {
    const item = makeItem();
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [item],
      runValidators: async () =>
        failResult(item.url,
          { validator: 'lighthouse', detail: 'perf drop' },
          { validator: 'w3c',        detail: 'unclosed tag' },
        ),
    }));
    assert.equal(result.regressions.length, 2);
    assert.equal(result.regressions[0]!.validator, 'lighthouse');
    assert.equal(result.regressions[1]!.validator, 'w3c');
  });

  it('regression url matches item url', async () => {
    const item = makeItem({ url: 'https://example.com/products' });
    const result = await runVerify(baseReq(), happy({
      loadDeployed:  async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'axe', detail: 'critical violation: image-alt' }),
    }));
    assert.equal(result.regressions[0]!.url, 'https://example.com/products');
  });
});

// ── All URLs fail → status=failed ────────────────────────────────────────────

describe('runVerify — all URLs fail → status=failed', () => {
  it('single URL fail → status=failed', async () => {
    const item = makeItem();
    const result = await runVerify(baseReq(), happy({
      loadDeployed:  async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'lighthouse', detail: 'score 0.4' }),
    }));
    assert.equal(result.status, 'failed');
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 1);
  });

  it('3 URLs all fail → status=failed, passed=0', async () => {
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem()],
      runValidators: async (item) =>
        failResult(item.url, { validator: 'w3c', detail: 'HTML error' }),
    }));
    assert.equal(result.status, 'failed');
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 3);
  });

  it('failed count equals regressions.length when 1 failure per URL', async () => {
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      runValidators: async (item) =>
        failResult(item.url, { validator: 'schema', detail: 'missing @type' }),
    }));
    assert.equal(result.failed, result.regressions.length);
  });
});

// ── Regressed items get rollback_flagged ──────────────────────────────────────

describe('runVerify — regressed action_queue rows get rollback_flagged=true', () => {
  it('flagRollback is called for each regressed item', async () => {
    const flaggedIds: string[] = [];
    const item = makeItem();
    await runVerify(baseReq(), happy({
      loadDeployed:  async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'lighthouse', detail: 'perf drop' }),
      flagRollback: async (id) => { flaggedIds.push(id); },
    }));
    assert.equal(flaggedIds.length, 1);
    assert.equal(flaggedIds[0], item.id);
  });

  it('flagRollback called for each failing item, not passing items', async () => {
    const flaggedIds: string[] = [];
    const passItem = makeItem();
    const failItem = makeItem();
    let callCount  = 0;
    await runVerify(baseReq(), happy({
      loadDeployed: async () => [passItem, failItem],
      runValidators: async (item) => {
        callCount++;
        if (callCount === 2) return failResult(item.url, { validator: 'axe', detail: 'critical' });
        return PASS;
      },
      flagRollback: async (id) => { flaggedIds.push(id); },
    }));
    assert.equal(flaggedIds.length, 1);
    assert.equal(flaggedIds[0], failItem.id);
  });

  it('markRegression is called for each regressed item', async () => {
    const markedIds: string[] = [];
    const item = makeItem();
    await runVerify(baseReq(), happy({
      loadDeployed:  async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'w3c', detail: 'bad HTML' }),
      markRegression: async (id) => { markedIds.push(id); },
    }));
    assert.equal(markedIds.length, 1);
    assert.equal(markedIds[0], item.id);
  });

  it('flagRollback failure is non-blocking — result still returned', async () => {
    const item = makeItem();
    const result = await runVerify(baseReq(), happy({
      loadDeployed:  async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'lighthouse', detail: 'drop' }),
      flagRollback: async () => { throw new Error('db write failed'); },
    }));
    assert.equal(result.status, 'failed');
    assert.equal(result.regressions.length, 1);
  });

  it('markRegression failure is non-blocking', async () => {
    const item = makeItem();
    const result = await runVerify(baseReq(), happy({
      loadDeployed:  async () => [item],
      runValidators: async () =>
        failResult(item.url, { validator: 'schema', detail: 'invalid' }),
      markRegression: async () => { throw new Error('db timeout'); },
    }));
    assert.equal(result.regressions.length, 1);
  });
});

// ── No deployed items ─────────────────────────────────────────────────────────

describe('runVerify — no deployed items → status=passed, urls_checked=0', () => {
  it('empty queue returns status=passed', async () => {
    const result = await runVerify(baseReq(), happy({ loadDeployed: async () => [] }));
    assert.equal(result.status,       'passed');
    assert.equal(result.urls_checked, 0);
    assert.equal(result.passed,       0);
    assert.equal(result.failed,       0);
    assert.deepEqual(result.regressions, []);
  });

  it('runValidators is not called when no deployed items', async () => {
    let called = false;
    await runVerify(baseReq(), happy({
      loadDeployed:  async () => [],
      runValidators: async () => { called = true; return PASS; },
    }));
    assert.equal(called, false);
  });
});

// ── Never throws on Supabase failure ─────────────────────────────────────────

describe('runVerify — never throws on Supabase or validator failures', () => {
  it('does not throw when loadDeployed throws', async () => {
    await assert.doesNotReject(() =>
      runVerify(baseReq(), happy({
        loadDeployed: async () => { throw new Error('Supabase timeout'); },
      })),
    );
  });

  it('returns status=failed when loadDeployed throws', async () => {
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => { throw new Error('connection refused'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('connection refused'));
  });

  it('individual runValidators throw is counted as failed, continues', async () => {
    let callCount = 0;
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      runValidators: async () => {
        callCount++;
        if (callCount === 1) throw new Error('playwright crashed');
        return PASS;
      },
    }));
    assert.equal(result.failed,  1);
    assert.equal(result.passed,  1);
    assert.equal(result.status,  'partial');
    assert.equal(result.regressions.length, 1);
    assert.ok(result.regressions[0]!.detail.includes('playwright crashed'));
  });

  it('does not throw when runValidators throws', async () => {
    await assert.doesNotReject(() =>
      runVerify(baseReq(), happy({
        runValidators: async () => { throw new Error('crash'); },
      })),
    );
  });

  it('all runValidators throw → status=failed', async () => {
    const result = await runVerify(baseReq(), happy({
      runValidators: async () => { throw new Error('crash'); },
    }));
    assert.equal(result.status, 'failed');
  });

  it('returns status=failed for empty run_id', async () => {
    const result = await runVerify({ ...baseReq(), run_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('run_id'));
  });

  it('returns status=failed for empty tenant_id', async () => {
    const result = await runVerify({ ...baseReq(), tenant_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('tenant_id'));
  });
});

// ── ActionLog entries ─────────────────────────────────────────────────────────

describe('runVerify — ActionLog entries', () => {
  it('writes verify:start and verify:complete', async () => {
    const entries = await captureLog(() => runVerify(baseReq(), happy()));
    const startIdx    = entries.findIndex((e) => e['stage'] === 'verify:start');
    const completeIdx = entries.findIndex((e) => e['stage'] === 'verify:complete');
    assert.ok(startIdx    >= 0, 'verify:start not found');
    assert.ok(completeIdx >= 0, 'verify:complete not found');
    assert.ok(startIdx < completeIdx);
  });

  it('verify:complete has urls_checked, passed, failed, regressions in metadata', async () => {
    const entries = await captureLog(() => runVerify(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'verify:complete');
    assert.ok(complete, 'Expected verify:complete');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(typeof meta['urls_checked'], 'number');
    assert.equal(typeof meta['passed'],       'number');
    assert.equal(typeof meta['failed'],       'number');
    assert.ok(Array.isArray(meta['regressions']));
  });

  it('verify:complete status=ok when no regressions', async () => {
    const entries = await captureLog(() => runVerify(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'verify:complete');
    assert.equal(complete?.['status'], 'ok');
  });

  it('verify:complete status=error when regressions found', async () => {
    const item = makeItem();
    const entries = await captureLog(() =>
      runVerify(baseReq(), happy({
        loadDeployed:  async () => [item],
        runValidators: async () =>
          failResult(item.url, { validator: 'lighthouse', detail: 'perf drop' }),
      })),
    );
    const complete = entries.find((e) => e['stage'] === 'verify:complete');
    assert.equal(complete?.['status'], 'error');
  });

  it('writes verify:failed (not verify:complete) when loadDeployed throws', async () => {
    const entries = await captureLog(() =>
      runVerify(baseReq(), happy({
        loadDeployed: async () => { throw new Error('db down'); },
      })),
    );
    const failed   = entries.find((e) => e['stage'] === 'verify:failed');
    const complete = entries.find((e) => e['stage'] === 'verify:complete');
    assert.ok(failed, 'Expected verify:failed');
    assert.equal(complete, undefined);
  });
});

// ── Status boundary conditions ────────────────────────────────────────────────

describe('runVerify — status boundary conditions', () => {
  it('passed + failed === urls_checked always', async () => {
    let callCount = 0;
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem(), makeItem()],
      runValidators: async (item) => {
        callCount++;
        if (callCount % 2 === 0) return failResult(item.url, { validator: 'axe', detail: 'x' });
        return PASS;
      },
    }));
    assert.equal(result.passed + result.failed, result.urls_checked);
  });

  it('regressions.length equals failed when 1 validator fails per URL', async () => {
    const result = await runVerify(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem()],
      runValidators: async (item) =>
        failResult(item.url, { validator: 'lighthouse', detail: 'drop' }),
    }));
    assert.equal(result.regressions.length, result.failed);
  });
});
