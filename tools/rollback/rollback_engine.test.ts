/**
 * tools/rollback/rollback_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rollbackFix,
  rollbackLastFix,
  canRollback,
  getRollbackEligibility,
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

// ── canRollback ──────────────────────────────────────────────────────────────

describe('canRollback', () => {
  it('uses issue_type window not hardcoded 48h', () => {
    // Schema fix applied 3 days ago — within 7-day window
    const applied_at = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(canRollback({ applied_at, issue_type: 'SCHEMA_MISSING', original_value: 'v' }), true);
  });

  it('returns true for schema fix within 7 days', () => {
    const applied_at = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(canRollback({ applied_at, issue_type: 'SCHEMA_MISSING', original_value: 'v' }), true);
  });

  it('returns false for schema fix after 7 days', () => {
    const applied_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(canRollback({ applied_at, issue_type: 'SCHEMA_MISSING', original_value: 'v' }), false);
  });

  it('returns false for title fix after 48 hours', () => {
    const applied_at = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    assert.equal(canRollback({ applied_at, issue_type: 'TITLE_MISSING', original_value: 'v' }), false);
  });

  it('returns true for title fix within 48 hours', () => {
    const applied_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    assert.equal(canRollback({ applied_at, issue_type: 'TITLE_MISSING', original_value: 'v' }), true);
  });

  it('returns false when original_value is null', () => {
    const applied_at = new Date().toISOString();
    assert.equal(canRollback({ applied_at, issue_type: 'TITLE_MISSING', original_value: null }), false);
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() => canRollback(null as any));
  });
});

// ── getRollbackEligibility ───────────────────────────────────────────────────

describe('getRollbackEligibility', () => {
  it('includes window_hours', () => {
    const e = getRollbackEligibility({ applied_at: new Date().toISOString(), issue_type: 'SCHEMA_MISSING', original_value: 'v' });
    assert.equal(e.window_hours, 168);
  });

  it('includes window_label', () => {
    const e = getRollbackEligibility({ applied_at: new Date().toISOString(), issue_type: 'SCHEMA_MISSING', original_value: 'v' });
    assert.equal(e.window_label, '7 days');
  });

  it('includes deadline as ISO string', () => {
    const e = getRollbackEligibility({ applied_at: new Date().toISOString(), issue_type: 'TITLE_MISSING', original_value: 'v' });
    assert.ok(e.deadline.includes('T'));
  });

  it('includes time_remaining object', () => {
    const e = getRollbackEligibility({ applied_at: new Date().toISOString(), issue_type: 'TITLE_MISSING', original_value: 'v' });
    assert.equal(typeof e.time_remaining.hours, 'number');
    assert.equal(typeof e.time_remaining.minutes, 'number');
    assert.equal(typeof e.time_remaining.expired, 'boolean');
    assert.equal(typeof e.time_remaining.label, 'string');
  });

  it('eligible=true when within window', () => {
    const e = getRollbackEligibility({ applied_at: new Date().toISOString(), issue_type: 'TITLE_MISSING', original_value: 'v' });
    assert.equal(e.eligible, true);
  });

  it('eligible=false when past window', () => {
    const applied_at = new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString();
    const e = getRollbackEligibility({ applied_at, issue_type: 'TITLE_MISSING', original_value: 'v' });
    assert.equal(e.eligible, false);
    assert.ok(e.reason?.includes('expired'));
  });

  it('eligible=false when no original value', () => {
    const e = getRollbackEligibility({ applied_at: new Date().toISOString(), issue_type: 'TITLE_MISSING', original_value: null });
    assert.equal(e.eligible, false);
    assert.ok(e.reason?.includes('No original value'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRollbackEligibility(null as any));
  });
});
