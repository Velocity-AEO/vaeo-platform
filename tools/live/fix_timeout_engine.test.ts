/**
 * tools/live/fix_timeout_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_EXECUTION_TIMEOUT_MS,
  FixTimeoutError,
  withFixTimeout,
  buildTimeoutFailureReason,
} from './fix_timeout_engine.ts';

// ── FIX_EXECUTION_TIMEOUT_MS ──────────────────────────────────────────────────

describe('FIX_EXECUTION_TIMEOUT_MS', () => {
  it('equals 30000', () => {
    assert.equal(FIX_EXECUTION_TIMEOUT_MS, 30_000);
  });
});

// ── FixTimeoutError ───────────────────────────────────────────────────────────

describe('FixTimeoutError', () => {
  it('message includes fix_id', () => {
    const err = new FixTimeoutError('fix_abc', 5000);
    assert.ok(err.message.includes('fix_abc'));
  });

  it('message includes elapsed_ms', () => {
    const err = new FixTimeoutError('fix_xyz', 12345);
    assert.ok(err.message.includes('12345'));
  });

  it('name is FixTimeoutError', () => {
    const err = new FixTimeoutError('f', 1);
    assert.equal(err.name, 'FixTimeoutError');
  });

  it('is an instance of Error', () => {
    assert.ok(new FixTimeoutError('f', 1) instanceof Error);
  });
});

// ── withFixTimeout — fn wins ──────────────────────────────────────────────────

describe('withFixTimeout — fn wins', () => {
  /** Inject a timeoutFn that never resolves (fn wins the race). */
  const neverTimeout: (ms: number) => Promise<never> =
    (_ms) => new Promise<never>(() => {});

  it('returns result when fn completes', async () => {
    const { result } = await withFixTimeout('f1', async () => 42, 30_000, {
      timeoutFn: neverTimeout,
    });
    assert.equal(result, 42);
  });

  it('returns timed_out=false when fn wins', async () => {
    const { timeout_result } = await withFixTimeout('f1', async () => 'ok', 30_000, {
      timeoutFn: neverTimeout,
    });
    assert.equal(timeout_result.timed_out, false);
  });

  it('result is correct when fn wins quickly', async () => {
    const { result } = await withFixTimeout('f1', async () => ({ x: 1 }), 30_000, {
      timeoutFn: neverTimeout,
    });
    assert.deepEqual(result, { x: 1 });
  });

  it('timed_out=false when fn wins quickly', async () => {
    const { timeout_result } = await withFixTimeout('f1', async () => true, 30_000, {
      timeoutFn: neverTimeout,
    });
    assert.equal(timeout_result.timed_out, false);
  });

  it('returns elapsed_ms as a number', async () => {
    const { timeout_result } = await withFixTimeout('f1', async () => 1, 30_000, {
      timeoutFn: neverTimeout,
    });
    assert.equal(typeof timeout_result.elapsed_ms, 'number');
    assert.ok(timeout_result.elapsed_ms >= 0);
  });
});

// ── withFixTimeout — timeout wins ────────────────────────────────────────────

describe('withFixTimeout — timeout wins', () => {
  /** Inject a timeoutFn that rejects immediately with FixTimeoutError. */
  const immediateTimeout: (ms: number) => Promise<never> =
    (ms) => Promise.reject(new FixTimeoutError('fix_test', ms));

  /** Never-settling fn with no pending I/O — won't hold the event loop. */
  const slowFn = (): Promise<string> => new Promise<string>(() => {});

  it('returns timed_out=true when timeout fires first', async () => {
    const { timeout_result } = await withFixTimeout('fix_1', slowFn, 30_000, {
      timeoutFn: immediateTimeout,
    });
    assert.equal(timeout_result.timed_out, true);
  });

  it('result is undefined when timed out', async () => {
    const { result } = await withFixTimeout('fix_1', slowFn, 30_000, {
      timeoutFn: immediateTimeout,
    });
    assert.equal(result, undefined);
  });

  it('timeout_result.error is populated on timeout', async () => {
    const { timeout_result } = await withFixTimeout('fix_1', slowFn, 30_000, {
      timeoutFn: immediateTimeout,
    });
    assert.ok(timeout_result.error);
  });

  it('timeout_ms is preserved in result', async () => {
    const { timeout_result } = await withFixTimeout('fix_1', slowFn, 15_000, {
      timeoutFn: immediateTimeout,
    });
    assert.equal(timeout_result.timeout_ms, 15_000);
  });
});

// ── withFixTimeout — fn throws ────────────────────────────────────────────────

describe('withFixTimeout — fn throws', () => {
  const neverTimeout: (ms: number) => Promise<never> =
    (_ms) => new Promise<never>(() => {});

  it('never throws when fn throws', async () => {
    await assert.doesNotReject(() =>
      withFixTimeout('f1', async () => { throw new Error('boom'); }, 30_000, {
        timeoutFn: neverTimeout,
      }),
    );
  });

  it('timed_out=false when fn throws (not a timeout)', async () => {
    const { timeout_result } = await withFixTimeout('f1', async () => { throw new Error('fn err'); }, 30_000, {
      timeoutFn: neverTimeout,
    });
    assert.equal(timeout_result.timed_out, false);
  });

  it('never throws when timeout fires', async () => {
    await assert.doesNotReject(() =>
      withFixTimeout(
        'f1',
        async () => new Promise<never>(() => {}),
        30_000,
        { timeoutFn: (ms) => Promise.reject(new FixTimeoutError('f1', ms)) },
      ),
    );
  });
});

// ── withFixTimeout — injectable logFn ────────────────────────────────────────

describe('withFixTimeout — logFn injectable', () => {
  it('log message includes fix_id on timeout', async () => {
    const logs: string[] = [];
    await withFixTimeout(
      'fix_log_test',
      async () => new Promise<never>(() => {}),
      30_000,
      {
        timeoutFn: (ms) => Promise.reject(new FixTimeoutError('fix_log_test', ms)),
        logFn:     (msg) => logs.push(msg),
      },
    );
    assert.ok(logs.some((l) => l.includes('fix_log_test')));
  });

  it('log message includes elapsed_ms on timeout', async () => {
    const logs: string[] = [];
    await withFixTimeout(
      'fix_elapsed',
      async () => new Promise<never>(() => {}),
      5_000,
      {
        timeoutFn: (ms) => Promise.reject(new FixTimeoutError('fix_elapsed', ms)),
        logFn:     (msg) => logs.push(msg),
      },
    );
    // The log should contain the elapsed_ms numeric value
    assert.ok(logs.some((l) => /elapsed=\d+ms/.test(l)));
  });
});

// ── withFixTimeout — timeoutFn injectable ────────────────────────────────────

describe('withFixTimeout — timeoutFn injectable', () => {
  it('timeoutFn is called when provided', async () => {
    let called = false;
    const neverTimeout: (ms: number) => Promise<never> = (_ms) => {
      called = true;
      return new Promise<never>(() => {});
    };
    await withFixTimeout('f1', async () => 1, 30_000, { timeoutFn: neverTimeout });
    assert.equal(called, true);
  });
});

// ── withFixTimeout — never throws on any path ─────────────────────────────────

describe('withFixTimeout — never throws on any path', () => {
  it('never throws on null fix_id', async () => {
    await assert.doesNotReject(() =>
      withFixTimeout(null as never, async () => 1, 30_000, {
        timeoutFn: (_ms) => new Promise<never>(() => {}),
      }),
    );
  });
});

// ── buildTimeoutFailureReason ─────────────────────────────────────────────────

describe('buildTimeoutFailureReason', () => {
  it('includes seconds (timeout_ms / 1000)', () => {
    const reason = buildTimeoutFailureReason('fix_1', 30_000);
    assert.ok(reason.includes('30s'));
  });

  it('includes retry message', () => {
    const reason = buildTimeoutFailureReason('fix_1', 30_000);
    assert.ok(reason.includes('will retry next run'));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildTimeoutFailureReason(null as never, null as never));
  });
});
