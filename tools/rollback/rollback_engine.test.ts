/**
 * tools/rollback/rollback_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rollbackFix,
  rollbackLastFix,
  type RollbackTarget,
  type RollbackResult,
  type RollbackDeps,
  type RollbackLastDeps,
} from './rollback_engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockTarget(overrides?: Partial<RollbackTarget>): RollbackTarget {
  return {
    fix_id:         'fix_1',
    site_id:        'site_1',
    url:            'https://x.com/',
    platform:       'shopify',
    signal_type:    'title_missing',
    original_value: 'Original Title',
    applied_value:  'Generated Title',
    applied_at:     new Date().toISOString(),
    ...overrides,
  };
}

function successDeps(overrides?: Partial<RollbackDeps>): RollbackDeps {
  return {
    applyFn: async () => ({ success: true }),
    ...overrides,
  };
}

function failDeps(msg = 'apply failed'): RollbackDeps {
  return { applyFn: async () => ({ success: false, error: msg }) };
}

// ── rollbackFix ───────────────────────────────────────────────────────────────

describe('rollbackFix', () => {
  it('returns success=true on happy path', async () => {
    const result = await rollbackFix(mockTarget(), successDeps());
    assert.equal(result.success, true);
  });

  it('returns fix_id', async () => {
    const result = await rollbackFix(mockTarget(), successDeps());
    assert.equal(result.fix_id, 'fix_1');
  });

  it('returns site_id', async () => {
    const result = await rollbackFix(mockTarget(), successDeps());
    assert.equal(result.site_id, 'site_1');
  });

  it('restored_value equals original_value', async () => {
    const result = await rollbackFix(mockTarget(), successDeps());
    assert.equal(result.restored_value, 'Original Title');
  });

  it('has rolled_back_at ISO timestamp', async () => {
    const result = await rollbackFix(mockTarget(), successDeps());
    assert.ok(result.rolled_back_at.includes('T'));
  });

  it('calls applyFn with original_value', async () => {
    const calls: string[] = [];
    await rollbackFix(mockTarget(), {
      applyFn: async (_t, value) => { calls.push(value); return { success: true }; },
    });
    assert.ok(calls.includes('Original Title'));
  });

  it('returns success=false when original_value is null', async () => {
    const result = await rollbackFix(mockTarget({ original_value: null }), successDeps());
    assert.equal(result.success, false);
  });

  it('error message when original_value is null', async () => {
    const result = await rollbackFix(mockTarget({ original_value: null }), successDeps());
    assert.ok(result.error?.includes('No original value recorded'));
  });

  it('does NOT call applyFn when original_value is null', async () => {
    let called = false;
    await rollbackFix(mockTarget({ original_value: null }), {
      applyFn: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, false);
  });

  it('returns success=false when applyFn returns failure', async () => {
    const result = await rollbackFix(mockTarget(), failDeps('bad network'));
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('bad network'));
  });

  it('calls logFn on success', async () => {
    const logged: RollbackResult[] = [];
    await rollbackFix(mockTarget(), {
      ...successDeps(),
      logFn: async (r) => { logged.push(r); },
    });
    assert.equal(logged.length, 1);
    assert.equal(logged[0]!.success, true);
  });

  it('does NOT call logFn when rollback fails due to no original value', async () => {
    let called = false;
    await rollbackFix(mockTarget({ original_value: null }), {
      ...successDeps(),
      logFn: async () => { called = true; },
    });
    assert.equal(called, false);
  });

  it('never throws when applyFn throws', async () => {
    await assert.doesNotReject(() =>
      rollbackFix(mockTarget(), {
        applyFn: async () => { throw new Error('boom'); },
      }),
    );
  });

  it('returns success=false when applyFn throws', async () => {
    const result = await rollbackFix(mockTarget(), {
      applyFn: async () => { throw new Error('explode'); },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('explode'));
  });

  it('never throws when logFn throws', async () => {
    await assert.doesNotReject(() =>
      rollbackFix(mockTarget(), {
        ...successDeps(),
        logFn: async () => { throw new Error('log boom'); },
      }),
    );
  });

  it('success still true even when logFn throws', async () => {
    const result = await rollbackFix(mockTarget(), {
      ...successDeps(),
      logFn: async () => { throw new Error('log boom'); },
    });
    assert.equal(result.success, true);
  });
});

// ── rollbackLastFix ───────────────────────────────────────────────────────────

describe('rollbackLastFix', () => {
  it('returns success=false when no fix found', async () => {
    const result = await rollbackLastFix('site_1', {
      loadLastFixFn: async () => null,
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('No fix found'));
  });

  it('loads and rolls back last fix', async () => {
    const result = await rollbackLastFix('site_1', {
      loadLastFixFn: async () => mockTarget(),
      applyFn:       async () => ({ success: true }),
    });
    assert.equal(result.success, true);
    assert.equal(result.fix_id, 'fix_1');
  });

  it('returns site_id on no-fix path', async () => {
    const result = await rollbackLastFix('site_99', {
      loadLastFixFn: async () => null,
    });
    assert.equal(result.site_id, 'site_99');
  });

  it('never throws when loadLastFixFn throws', async () => {
    await assert.doesNotReject(() =>
      rollbackLastFix('site_1', {
        loadLastFixFn: async () => { throw new Error('db fail'); },
      }),
    );
  });

  it('returns success=false when loadLastFixFn throws', async () => {
    const result = await rollbackLastFix('site_1', {
      loadLastFixFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('db fail'));
  });
});
