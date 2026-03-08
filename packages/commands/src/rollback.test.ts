/**
 * packages/commands/src/rollback.test.ts
 *
 * Tests for runRollback.
 * All external deps (Supabase, patch-engine rollback-runner) are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runRollback,
  type RollbackRequest,
  type RollbackCommandOps,
  type RollbackableItem,
  type RollbackManifest,
  type AffectedResource,
} from './rollback.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-uuid-001';
const TENANT_ID = 'tenant-uuid-001';
const SITE_ID   = 'site-uuid-001';
const ACTION_ID = 'item-uuid-001';

function baseReq(overrides: Partial<RollbackRequest> = {}): RollbackRequest {
  return {
    run_id:       RUN_ID,
    tenant_id:    TENANT_ID,
    site_id:      SITE_ID,
    cms:          'shopify',
    rollback_all: true,
    ...overrides,
  };
}

let counter = 0;
function makeItem(overrides: Partial<RollbackableItem> = {}): RollbackableItem {
  counter++;
  return {
    id:               `item-uuid-${counter.toString().padStart(3, '0')}`,
    run_id:           RUN_ID,
    tenant_id:        TENANT_ID,
    site_id:          SITE_ID,
    issue_type:       'META_TITLE_MISSING',
    url:              `https://example.com/page-${counter}`,
    execution_status: 'deployed',
    ...overrides,
  };
}

function makeManifest(item: RollbackableItem): RollbackManifest {
  return {
    manifest_id:      `manifest-${item.id}`,
    run_id:           item.run_id,
    tenant_id:        item.tenant_id,
    fields_to_reverse: 3,
  };
}

const ROLLBACK_OK = { fields_reversed: 3 };

/** Happy-path ops: 1 deployed item with a manifest that rolls back cleanly. */
function happy(overrides: Partial<RollbackCommandOps> = {}): Partial<RollbackCommandOps> {
  const defaultItem = makeItem();
  const manifest    = makeManifest(defaultItem);
  return {
    loadItem:           async () => defaultItem,
    loadDeployed:       async () => [defaultItem],
    loadManifest:       async () => manifest,
    executeRollback:    async () => ROLLBACK_OK,
    markRolledBack:     async () => {},
    markRollbackFailed: async () => {},
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

// ── Single action_id rollback ─────────────────────────────────────────────────

describe('runRollback — single action_id rollback reverses that fix', () => {
  it('rolls back the specific item by action_id', async () => {
    const item     = makeItem({ id: ACTION_ID });
    const manifest = makeManifest(item);
    const result   = await runRollback(
      { ...baseReq(), rollback_all: undefined, action_id: ACTION_ID },
      happy({ loadItem: async () => item, loadManifest: async () => manifest }),
    );
    assert.equal(result.status,      'completed');
    assert.equal(result.rolled_back, 1);
    assert.equal(result.failed,      0);
    assert.equal(result.skipped,     0);
  });

  it('loadItem is called with correct action_id and tenant_id', async () => {
    let capturedId     = '';
    let capturedTenant = '';
    const item = makeItem({ id: ACTION_ID });
    await runRollback(
      { ...baseReq(), rollback_all: undefined, action_id: ACTION_ID },
      happy({
        loadItem: async (id, tenant) => { capturedId = id; capturedTenant = tenant; return item; },
      }),
    );
    assert.equal(capturedId,     ACTION_ID);
    assert.equal(capturedTenant, TENANT_ID);
  });

  it('does not call loadDeployed when action_id is provided', async () => {
    let loadDeployedCalled = false;
    const item = makeItem();
    await runRollback(
      { ...baseReq(), rollback_all: undefined, action_id: item.id },
      happy({
        loadItem:     async () => item,
        loadDeployed: async () => { loadDeployedCalled = true; return []; },
      }),
    );
    assert.equal(loadDeployedCalled, false);
  });

  it('returns rolled_back=0, skipped=0 when action_id not found', async () => {
    const result = await runRollback(
      { ...baseReq(), rollback_all: undefined, action_id: 'nonexistent' },
      happy({ loadItem: async () => null }),
    );
    assert.equal(result.rolled_back, 0);
    assert.equal(result.skipped,     0);
    assert.equal(result.status,      'completed');
  });
});

// ── rollback_all reverses all deployed items ──────────────────────────────────

describe('runRollback — rollback_all reverses all deployed items', () => {
  it('rolls back all 3 deployed items', async () => {
    const items = [makeItem(), makeItem(), makeItem()];
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => items,
      loadManifest: async (item) => makeManifest(item),
    }));
    assert.equal(result.rolled_back, 3);
    assert.equal(result.failed,      0);
    assert.equal(result.skipped,     0);
    assert.equal(result.status,      'completed');
  });

  it('loadDeployed called with correct run_id and tenant_id', async () => {
    let capturedRunId  = '';
    let capturedTenant = '';
    await runRollback(baseReq(), happy({
      loadDeployed: async (runId, tenant) => {
        capturedRunId  = runId;
        capturedTenant = tenant;
        return [makeItem()];
      },
    }));
    assert.equal(capturedRunId,  RUN_ID);
    assert.equal(capturedTenant, TENANT_ID);
  });

  it('executeRollback called once per eligible item', async () => {
    let execCount = 0;
    const items = [makeItem(), makeItem()];
    await runRollback(baseReq(), happy({
      loadDeployed:    async () => items,
      loadManifest:    async (item) => makeManifest(item),
      executeRollback: async () => { execCount++; return ROLLBACK_OK; },
    }));
    assert.equal(execCount, 2);
  });

  it('markRolledBack called for each successfully rolled-back item', async () => {
    const markedIds: string[] = [];
    const items = [makeItem(), makeItem()];
    await runRollback(baseReq(), happy({
      loadDeployed:  async () => items,
      loadManifest:  async (item) => makeManifest(item),
      markRolledBack: async (id) => { markedIds.push(id); },
    }));
    assert.equal(markedIds.length, 2);
    assert.deepEqual(new Set(markedIds), new Set(items.map((i) => i.id)));
  });
});

// ── Missing manifest → skipped, not failed ───────────────────────────────────

describe('runRollback — missing manifest counts as skipped not failed', () => {
  it('null manifest → skipped=1, rolled_back=0, failed=0', async () => {
    const result = await runRollback(baseReq(), happy({
      loadManifest: async () => null,
    }));
    assert.equal(result.skipped,     1);
    assert.equal(result.rolled_back, 0);
    assert.equal(result.failed,      0);
    assert.equal(result.status,      'completed');
  });

  it('executeRollback is NOT called when manifest is null', async () => {
    let execCalled = false;
    await runRollback(baseReq(), happy({
      loadManifest:    async () => null,
      executeRollback: async () => { execCalled = true; return ROLLBACK_OK; },
    }));
    assert.equal(execCalled, false);
  });

  it('markRolledBack is NOT called when manifest is null', async () => {
    let markCalled = false;
    await runRollback(baseReq(), happy({
      loadManifest:   async () => null,
      markRolledBack: async () => { markCalled = true; },
    }));
    assert.equal(markCalled, false);
  });

  it('2 items: 1 has manifest, 1 missing → rolled_back=1, skipped=1', async () => {
    const items = [makeItem(), makeItem()];
    let callCount = 0;
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => items,
      loadManifest: async (item) => {
        callCount++;
        return callCount === 1 ? makeManifest(item) : null;
      },
    }));
    assert.equal(result.rolled_back, 1);
    assert.equal(result.skipped,     1);
    assert.equal(result.failed,      0);
  });

  it('all 3 items missing manifests → skipped=3, status=completed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem()],
      loadManifest: async () => null,
    }));
    assert.equal(result.skipped,     3);
    assert.equal(result.rolled_back, 0);
    assert.equal(result.failed,      0);
    assert.equal(result.status,      'completed');
  });
});

// ── Rollback runner failure ───────────────────────────────────────────────────

describe('runRollback — rollback runner failure marks rollback_failed and continues', () => {
  it('executeRollback throws → failed=1, continues next item', async () => {
    let execCount = 0;
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      loadManifest: async (item) => makeManifest(item),
      executeRollback: async () => {
        execCount++;
        if (execCount === 1) throw new Error('adapter write failed');
        return ROLLBACK_OK;
      },
    }));
    assert.equal(result.failed,      1);
    assert.equal(result.rolled_back, 1);
    assert.equal(result.status,      'partial');
  });

  it('does not throw when executeRollback throws', async () => {
    await assert.doesNotReject(() =>
      runRollback(baseReq(), happy({
        executeRollback: async () => { throw new Error('cms error'); },
      })),
    );
  });

  it('markRollbackFailed called when executeRollback throws', async () => {
    const failedIds: string[] = [];
    const item = makeItem();
    await runRollback(baseReq(), happy({
      loadDeployed:       async () => [item],
      loadManifest:       async () => makeManifest(item),
      executeRollback:    async () => { throw new Error('err'); },
      markRollbackFailed: async (id) => { failedIds.push(id); },
    }));
    assert.equal(failedIds.length, 1);
    assert.equal(failedIds[0], item.id);
  });

  it('markRolledBack is NOT called when executeRollback throws', async () => {
    let markCalled = false;
    await runRollback(baseReq(), happy({
      executeRollback: async () => { throw new Error('err'); },
      markRolledBack:  async () => { markCalled = true; },
    }));
    assert.equal(markCalled, false);
  });

  it('all executeRollback fail → status=failed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed:    async () => [makeItem(), makeItem()],
      loadManifest:    async (item) => makeManifest(item),
      executeRollback: async () => { throw new Error('total failure'); },
    }));
    assert.equal(result.status, 'failed');
    assert.equal(result.failed, 2);
  });

  it('markRollbackFailed failure is non-blocking', async () => {
    const result = await runRollback(baseReq(), happy({
      executeRollback:    async () => { throw new Error('cms err'); },
      markRollbackFailed: async () => { throw new Error('db err'); },
    }));
    assert.equal(result.failed, 1);
  });
});

// ── regression_detected items included in rollback_all ───────────────────────

describe('runRollback — regression_detected items included in rollback_all', () => {
  it('regression_detected item is eligible and gets rolled back', async () => {
    const item = makeItem({ execution_status: 'regression_detected' });
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [item],
      loadManifest: async () => makeManifest(item),
    }));
    assert.equal(result.rolled_back, 1);
    assert.equal(result.skipped,     0);
  });

  it('mix of deployed and regression_detected both get rolled back', async () => {
    const items = [
      makeItem({ execution_status: 'deployed' }),
      makeItem({ execution_status: 'regression_detected' }),
      makeItem({ execution_status: 'deployed' }),
    ];
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => items,
      loadManifest: async (item) => makeManifest(item),
    }));
    assert.equal(result.rolled_back, 3);
    assert.equal(result.skipped,     0);
  });

  it('non-eligible status (queued) → skipped', async () => {
    const item = makeItem({ execution_status: 'queued' });
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [item],
    }));
    assert.equal(result.skipped,     1);
    assert.equal(result.rolled_back, 0);
  });

  it('non-eligible status (pending_approval) → skipped', async () => {
    const item = makeItem({ execution_status: 'pending_approval' });
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [item],
    }));
    assert.equal(result.skipped, 1);
  });

  it('executeRollback is NOT called for non-eligible items', async () => {
    let execCalled = false;
    const item = makeItem({ execution_status: 'queued' });
    await runRollback(baseReq(), happy({
      loadDeployed:    async () => [item],
      executeRollback: async () => { execCalled = true; return ROLLBACK_OK; },
    }));
    assert.equal(execCalled, false);
  });
});

// ── rolled_back + failed + skipped === total items ────────────────────────────

describe('runRollback — rolled_back + failed + skipped equals total items loaded', () => {
  it('4 items: 2 rollback, 1 no manifest, 1 runner fail → totals=4', async () => {
    let manifestCount = 0;
    let execCount     = 0;
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem(), makeItem()],
      loadManifest: async (item) => {
        manifestCount++;
        return manifestCount === 2 ? null : makeManifest(item);
      },
      executeRollback: async () => {
        execCount++;
        if (execCount === 3) throw new Error('fail');
        return ROLLBACK_OK;
      },
    }));
    assert.equal(result.rolled_back + result.failed + result.skipped, 4);
    assert.equal(result.rolled_back, 2);
    assert.equal(result.skipped,     1);
    assert.equal(result.failed,      1);
  });

  it('all 5 rollback → totals add up', async () => {
    const items = Array.from({ length: 5 }, () => makeItem());
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => items,
      loadManifest: async (item) => makeManifest(item),
    }));
    assert.equal(result.rolled_back + result.failed + result.skipped, 5);
    assert.equal(result.rolled_back, 5);
  });

  it('all 3 missing manifests → totals add up', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem(), makeItem()],
      loadManifest: async () => null,
    }));
    assert.equal(result.rolled_back + result.failed + result.skipped, 3);
    assert.equal(result.skipped, 3);
  });
});

// ── ActionLog: rollback:complete ──────────────────────────────────────────────

describe('runRollback — ActionLog receives rollback:complete with counts', () => {
  it('writes rollback:start before rollback:complete', async () => {
    const entries = await captureLog(() => runRollback(baseReq(), happy()));
    const startIdx    = entries.findIndex((e) => e['stage'] === 'rollback:start');
    const completeIdx = entries.findIndex((e) => e['stage'] === 'rollback:complete');
    assert.ok(startIdx    >= 0, 'rollback:start not found');
    assert.ok(completeIdx >= 0, 'rollback:complete not found');
    assert.ok(startIdx < completeIdx);
  });

  it('rollback:complete metadata has rolled_back, failed, skipped', async () => {
    const entries = await captureLog(() => runRollback(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'rollback:complete');
    assert.ok(complete, 'Expected rollback:complete');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(typeof meta['rolled_back'], 'number');
    assert.equal(typeof meta['failed'],      'number');
    assert.equal(typeof meta['skipped'],     'number');
  });

  it('rollback:complete metadata matches result counts', async () => {
    let manifestCount = 0;
    let metaCapture: Record<string, unknown> | null = null;
    await captureLog(() =>
      runRollback(baseReq(), happy({
        loadDeployed: async () => [makeItem(), makeItem(), makeItem()],
        loadManifest: async (item) => {
          manifestCount++;
          return manifestCount === 2 ? null : makeManifest(item);
        },
      })),
    ).then((entries) => {
      const c = entries.find((e) => e['stage'] === 'rollback:complete');
      metaCapture = (c?.['metadata'] as Record<string, unknown>) ?? null;
    });
    assert.ok(metaCapture);
    assert.equal(metaCapture['rolled_back'], 2);
    assert.equal(metaCapture['skipped'],     1);
    assert.equal(metaCapture['failed'],      0);
  });

  it('writes rollback:failed (not rollback:complete) when loadDeployed throws', async () => {
    const entries = await captureLog(() =>
      runRollback(baseReq(), happy({
        loadDeployed: async () => { throw new Error('db down'); },
      })),
    );
    const failed   = entries.find((e) => e['stage'] === 'rollback:failed');
    const complete = entries.find((e) => e['stage'] === 'rollback:complete');
    assert.ok(failed, 'Expected rollback:failed');
    assert.equal(complete, undefined);
  });
});

// ── No deployed items / never throws ─────────────────────────────────────────

describe('runRollback — never throws when no deployed items found', () => {
  it('empty deployed list → status=completed, all zeros', async () => {
    const result = await runRollback(baseReq(), happy({ loadDeployed: async () => [] }));
    assert.equal(result.status,      'completed');
    assert.equal(result.rolled_back, 0);
    assert.equal(result.failed,      0);
    assert.equal(result.skipped,     0);
  });

  it('does not throw when loadDeployed returns empty list', async () => {
    await assert.doesNotReject(() =>
      runRollback(baseReq(), happy({ loadDeployed: async () => [] })),
    );
  });

  it('does not throw when loadDeployed throws', async () => {
    await assert.doesNotReject(() =>
      runRollback(baseReq(), happy({ loadDeployed: async () => { throw new Error('db error'); } })),
    );
  });

  it('returns status=failed when loadDeployed throws', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => { throw new Error('Supabase timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Supabase timeout'));
  });

  it('returns status=failed for empty run_id', async () => {
    const result = await runRollback({ ...baseReq(), run_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('run_id'));
  });

  it('returns status=failed when neither action_id nor rollback_all provided', async () => {
    const result = await runRollback({ run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID, cms: 'shopify' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('--action-id'));
  });

  it('markRolledBack failure is non-blocking', async () => {
    const result = await runRollback(baseReq(), happy({
      markRolledBack: async () => { throw new Error('db timeout'); },
    }));
    assert.equal(result.rolled_back, 1);
    assert.equal(result.status,      'completed');
  });

  it('completed_at is a valid ISO 8601 timestamp', async () => {
    const result = await runRollback(baseReq(), happy());
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });
});

// ── Status derivation ─────────────────────────────────────────────────────────

describe('runRollback — status field derivation', () => {
  it('all roll back → completed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      loadManifest: async (item) => makeManifest(item),
    }));
    assert.equal(result.status, 'completed');
  });

  it('all skipped (no manifests) → completed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadManifest: async () => null,
    }));
    assert.equal(result.status, 'completed');
  });

  it('some fail, some rolled back → partial', async () => {
    let execCount = 0;
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      loadManifest: async (item) => makeManifest(item),
      executeRollback: async () => {
        execCount++;
        if (execCount === 1) throw new Error('fail');
        return ROLLBACK_OK;
      },
    }));
    assert.equal(result.status, 'partial');
  });

  it('all fail (no rollback, no skip) → failed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed:    async () => [makeItem(), makeItem()],
      loadManifest:    async (item) => makeManifest(item),
      executeRollback: async () => { throw new Error('cms down'); },
    }));
    assert.equal(result.status, 'failed');
  });
});

// ── CMS dispatch: Shopify metafield / WordPress page_meta ─────────────────────

function shopifyMetafieldManifest(item: RollbackableItem): RollbackManifest {
  return {
    manifest_id:       `manifest-${item.id}`,
    run_id:            item.run_id,
    tenant_id:         item.tenant_id,
    cms_type:          'shopify',
    fields_to_reverse: 1,
    affected_resources: [{
      resource_type: 'metafield' as AffectedResource['resource_type'],
      resource_id:   'mf-123',
      resource_key:  'title_tag',
      before_value:  'Old Title',
    }],
  };
}

function wpPageMetaManifest(item: RollbackableItem): RollbackManifest {
  return {
    manifest_id:       `manifest-${item.id}`,
    run_id:            item.run_id,
    tenant_id:         item.tenant_id,
    cms_type:          'wordpress',
    fields_to_reverse: 1,
    affected_resources: [{
      resource_type: 'page_meta' as AffectedResource['resource_type'],
      resource_id:   'post-456',
      resource_key:  'meta_description',
      before_value:  'Old description',
    }],
  };
}

describe('runRollback — Shopify metafield: 2 items reversed, both marked rolled_back', () => {
  it('2 Shopify metafield items → rolled_back=2, status=completed', async () => {
    const markedIds: string[] = [];
    const capturedManifests: RollbackManifest[] = [];
    const items = [
      makeItem({ cms_type: 'shopify' }),
      makeItem({ cms_type: 'shopify' }),
    ];

    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => items,
      loadManifest: async (item) => shopifyMetafieldManifest(item),
      executeRollback: async (item, manifest) => {
        capturedManifests.push(manifest);
        return { fields_reversed: manifest.affected_resources?.length ?? 1 };
      },
      markRolledBack: async (id) => { markedIds.push(id); },
    }));

    assert.equal(result.rolled_back, 2);
    assert.equal(result.failed,      0);
    assert.equal(result.status,      'completed');
    assert.equal(markedIds.length,   2);
    assert.deepEqual(new Set(markedIds), new Set(items.map((i) => i.id)));
    assert.equal(capturedManifests[0]?.affected_resources?.[0]?.resource_type, 'metafield');
    assert.equal(capturedManifests[0]?.affected_resources?.[0]?.before_value,  'Old Title');
  });

  it('metafield manifest fields passed correctly to executeRollback', async () => {
    const item = makeItem({ cms_type: 'shopify' });
    let capturedManifest: RollbackManifest | null = null;
    await runRollback(baseReq(), happy({
      loadDeployed:    async () => [item],
      loadManifest:    async () => shopifyMetafieldManifest(item),
      executeRollback: async (_, manifest) => { capturedManifest = manifest; return { fields_reversed: 1 }; },
    }));
    assert.ok(capturedManifest !== null);
    assert.equal(capturedManifest!.cms_type,                                    'shopify');
    assert.equal(capturedManifest!.affected_resources?.[0]?.resource_key,       'title_tag');
    assert.equal(capturedManifest!.affected_resources?.[0]?.resource_id,        'mf-123');
  });
});

describe('runRollback — WordPress page_meta: item reversed correctly', () => {
  it('1 WordPress page_meta item → reversed, rolled_back=1', async () => {
    const item = makeItem({ cms_type: 'wordpress' });
    let capturedManifest: RollbackManifest | null = null;

    const result = await runRollback(baseReq({ cms: 'wordpress' }), happy({
      loadDeployed:    async () => [item],
      loadManifest:    async () => wpPageMetaManifest(item),
      executeRollback: async (_, manifest) => {
        capturedManifest = manifest;
        return { fields_reversed: manifest.affected_resources?.length ?? 1 };
      },
    }));

    assert.equal(result.rolled_back, 1);
    assert.equal(result.status,      'completed');
    assert.ok(capturedManifest !== null);
    assert.equal(capturedManifest!.cms_type,                              'wordpress');
    assert.equal(capturedManifest!.affected_resources?.[0]?.resource_type, 'page_meta');
    assert.equal(capturedManifest!.affected_resources?.[0]?.before_value,  'Old description');
  });
});

describe('runRollback — failed_items populated on CMS API failure', () => {
  it('one CMS call fails → failed_items contains error, other item reversed', async () => {
    const itemA = makeItem({ id: 'item-fail' });
    const itemB = makeItem({ id: 'item-ok'   });
    let execCount = 0;

    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [itemA, itemB],
      loadManifest: async (item) => shopifyMetafieldManifest(item),
      executeRollback: async (item) => {
        execCount++;
        if (execCount === 1) throw new Error('CMS API timeout');
        return { fields_reversed: 1 };
      },
    }));

    assert.equal(result.rolled_back,          1);
    assert.equal(result.failed,               1);
    assert.equal(result.failed_items.length,  1);
    assert.equal(result.failed_items[0]!.action_id, itemA.id);
    assert.ok(result.failed_items[0]!.error.includes('CMS API timeout'));
    assert.equal(result.status, 'partial');
  });

  it('failed_items is empty when all items succeed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [makeItem(), makeItem()],
      loadManifest: async (item) => shopifyMetafieldManifest(item),
    }));
    assert.deepEqual(result.failed_items, []);
  });

  it('failed_items includes url for easier debugging', async () => {
    const item = makeItem({ url: 'https://example.com/products/thing' });
    const result = await runRollback(baseReq(), happy({
      loadDeployed:    async () => [item],
      loadManifest:    async (i) => shopifyMetafieldManifest(i),
      executeRollback: async () => { throw new Error('timeout'); },
    }));
    assert.equal(result.failed_items[0]!.url, 'https://example.com/products/thing');
  });
});

describe('runRollback — no deployed items returns total:0, reversed:0', () => {
  it('no deployed items → total items=0, rolled_back=0, status=completed', async () => {
    const result = await runRollback(baseReq(), happy({
      loadDeployed: async () => [],
    }));
    assert.equal(result.rolled_back,         0);
    assert.equal(result.failed,              0);
    assert.equal(result.skipped,             0);
    assert.equal(result.failed_items.length, 0);
    assert.equal(result.status,              'completed');
  });
});
