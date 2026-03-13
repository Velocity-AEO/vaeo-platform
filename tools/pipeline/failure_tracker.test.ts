/**
 * tools/pipeline/failure_tracker.test.ts
 *
 * Tests for failure tracker.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordFixFailure,
  recordFixSuccess,
  getSiteFailureCount,
} from './failure_tracker.js';

// ── recordFixFailure ─────────────────────────────────────────────────────────

describe('recordFixFailure', () => {
  it('increments count', async () => {
    const result = await recordFixFailure('s1', 'timeout', {
      incrementFn: async () => 1,
    });
    assert.equal(result.consecutive_failures, 1);
    assert.equal(result.suspended, false);
  });

  it('triggers suspension at threshold', async () => {
    let suspended = false;
    const result = await recordFixFailure('s1', 'timeout', {
      incrementFn: async () => 3,
      suspendFn: async () => { suspended = true; return true; },
    });
    assert.equal(result.suspended, true);
    assert.ok(result.suspension);
    assert.equal(suspended, true);
  });

  it('sends notification on suspension', async () => {
    let notified = false;
    await recordFixFailure('s1', 'timeout', {
      incrementFn: async () => 5,
      suspendFn: async () => true,
      notifyFn: async () => { notified = true; },
    });
    assert.equal(notified, true);
  });

  it('does not suspend below threshold', async () => {
    let suspended = false;
    await recordFixFailure('s1', 'timeout', {
      incrementFn: async () => 2,
      suspendFn: async () => { suspended = true; return true; },
    });
    assert.equal(suspended, false);
  });

  it('notification failure does not throw', async () => {
    const result = await recordFixFailure('s1', 'timeout', {
      incrementFn: async () => 3,
      suspendFn: async () => true,
      notifyFn: async () => { throw new Error('notify boom'); },
    });
    assert.equal(result.suspended, true);
  });

  it('returns safe default on error', async () => {
    const result = await recordFixFailure('s1', 'timeout', {
      incrementFn: async () => { throw new Error('db down'); },
    });
    // With in-memory fallback, incrementFn error returns 1 from catch
    assert.equal(typeof result.consecutive_failures, 'number');
    assert.equal(result.suspended, false);
  });

  it('uses in-memory fallback for empty deps', async () => {
    // Uses in-memory store — first call increments to 1
    const result = await recordFixFailure('test-empty-deps', 'timeout');
    assert.equal(typeof result.consecutive_failures, 'number');
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => recordFixFailure(null as any, null as any, null as any));
  });
});

// ── recordFixSuccess ─────────────────────────────────────────────────────────

describe('recordFixSuccess', () => {
  it('resets count to zero', async () => {
    let resetCalled = false;
    await recordFixSuccess('s1', {
      resetFn: async () => { resetCalled = true; },
    });
    assert.equal(resetCalled, true);
  });

  it('uses in-memory fallback when no deps', async () => {
    // Should not throw
    await assert.doesNotReject(() => recordFixSuccess('s1'));
  });

  it('never throws on error', async () => {
    await assert.doesNotReject(() => recordFixSuccess('s1', {
      resetFn: async () => { throw new Error('reset boom'); },
    }));
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => recordFixSuccess(null as any, null as any));
  });
});

// ── getSiteFailureCount ──────────────────────────────────────────────────────

describe('getSiteFailureCount', () => {
  it('returns count from query', async () => {
    const count = await getSiteFailureCount('s1', {
      queryFn: async () => 5,
    });
    assert.equal(count, 5);
  });

  it('returns 0 on error', async () => {
    const count = await getSiteFailureCount('s1', {
      queryFn: async () => { throw new Error('db down'); },
    });
    assert.equal(count, 0);
  });

  it('returns 0 for in-memory default', async () => {
    const count = await getSiteFailureCount('nonexistent-site');
    assert.equal(count, 0);
  });

  it('all deps injectable', async () => {
    let called = false;
    await getSiteFailureCount('s1', {
      queryFn: async () => { called = true; return 0; },
    });
    assert.equal(called, true);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => getSiteFailureCount(null as any, null as any));
  });
});
