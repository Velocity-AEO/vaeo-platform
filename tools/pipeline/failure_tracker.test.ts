/**
 * tools/pipeline/failure_tracker.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordFixFailure,
  recordFixSuccess,
  getSiteFailureCount,
} from './failure_tracker.js';
import type { FailureTrackerDeps } from './failure_tracker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<FailureTrackerDeps> = {}): FailureTrackerDeps {
  let count = 0;
  return {
    getFailureCountFn: async () => count,
    incrementFn:       async (_id, _err) => { count++; return count; },
    suspendFn:         async () => true,
    notifyFn:          async () => {},
    ...overrides,
  };
}

// ── recordFixFailure ──────────────────────────────────────────────────────────

describe('recordFixFailure', () => {
  it('increments count and returns consecutive_failures', async () => {
    let count = 0;
    const deps = makeDeps({ incrementFn: async () => { count++; return count; } });
    const r = await recordFixFailure('site_1', 'err', deps);
    assert.equal(r.consecutive_failures, 1);
  });

  it('returns suspended=false below threshold', async () => {
    let count = 0;
    const deps = makeDeps({ incrementFn: async () => { count++; return count; } });
    const r = await recordFixFailure('site_1', 'err', deps);
    assert.equal(r.suspended, false);
  });

  it('triggers suspension when incrementFn returns threshold count', async () => {
    let suspendCalled = false;
    const deps = makeDeps({
      incrementFn: async () => 3, // hits MAX_CONSECUTIVE_FAILURES
      suspendFn:   async () => { suspendCalled = true; return true; },
    });
    const r = await recordFixFailure('site_1', 'err', deps);
    assert.equal(r.suspended, true);
    assert.equal(suspendCalled, true);
  });

  it('returns suspension record when suspended', async () => {
    const deps = makeDeps({ incrementFn: async () => 3 });
    const r = await recordFixFailure('site_1', 'err', deps);
    assert.ok(r.suspension);
    assert.equal(r.suspension!.site_id, 'site_1');
  });

  it('sends notification on suspension', async () => {
    let notified = false;
    const deps = makeDeps({
      incrementFn: async () => 3,
      notifyFn:    async () => { notified = true; },
    });
    await recordFixFailure('site_1', 'err', deps);
    assert.equal(notified, true);
  });

  it('does not notify when not suspended', async () => {
    let notified = false;
    const deps = makeDeps({
      incrementFn: async () => 1,
      notifyFn:    async () => { notified = true; },
    });
    await recordFixFailure('site_1', 'err', deps);
    assert.equal(notified, false);
  });

  it('uses in-memory fallback when no deps provided', async () => {
    // Each call increments
    const r = await recordFixFailure('site_mem_test', 'e');
    assert.ok(r.consecutive_failures >= 1);
  });

  it('never throws when incrementFn throws', async () => {
    await assert.doesNotReject(() =>
      recordFixFailure('s1', 'e', { incrementFn: async () => { throw new Error('db'); } }),
    );
  });

  it('never throws when suspendFn throws', async () => {
    await assert.doesNotReject(() =>
      recordFixFailure('s1', 'e', {
        incrementFn: async () => 3,
        suspendFn:   async () => { throw new Error('suspend fail'); },
      }),
    );
  });

  it('never throws when notifyFn throws', async () => {
    await assert.doesNotReject(() =>
      recordFixFailure('s1', 'e', {
        incrementFn: async () => 3,
        notifyFn:    async () => { throw new Error('notify fail'); },
      }),
    );
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => recordFixFailure(null as any, null as any));
  });
});

// ── recordFixSuccess ──────────────────────────────────────────────────────────

describe('recordFixSuccess', () => {
  it('calls resetFn', async () => {
    let resetCalled = false;
    await recordFixSuccess('site_1', { resetFn: async () => { resetCalled = true; } });
    assert.equal(resetCalled, true);
  });

  it('does not throw when resetFn throws', async () => {
    await assert.doesNotReject(() =>
      recordFixSuccess('s1', { resetFn: async () => { throw new Error('reset'); } }),
    );
  });

  it('works with no deps', async () => {
    await assert.doesNotReject(() => recordFixSuccess('site_1'));
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => recordFixSuccess(null as any));
  });
});

// ── getSiteFailureCount ───────────────────────────────────────────────────────

describe('getSiteFailureCount', () => {
  it('returns value from queryFn', async () => {
    const count = await getSiteFailureCount('s1', { queryFn: async () => 7 });
    assert.equal(count, 7);
  });

  it('returns 0 when queryFn returns error', async () => {
    const count = await getSiteFailureCount('s1', {
      queryFn: async () => { throw new Error('db'); },
    });
    assert.equal(count, 0);
  });

  it('returns 0 when no deps provided and no prior state', async () => {
    // Fresh site id unlikely to be in memory
    const count = await getSiteFailureCount('site_brand_new_zzz');
    assert.equal(count, 0);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => getSiteFailureCount(null as any));
  });
});
