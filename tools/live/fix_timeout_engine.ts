/**
 * tools/live/fix_timeout_engine.ts
 *
 * Hard execution ceiling per fix. A hanging fix must never block
 * the nightly queue.
 *
 * Never throws.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const FIX_EXECUTION_TIMEOUT_MS: number = 30_000;

// ── FixTimeoutError ───────────────────────────────────────────────────────────

export class FixTimeoutError extends Error {
  override name = 'FixTimeoutError';

  constructor(fix_id: string, elapsed_ms: number) {
    super(
      `Fix ${fix_id} timed out after ${elapsed_ms}ms — execution ceiling exceeded`,
    );
  }
}

// ── FixTimeoutResult ──────────────────────────────────────────────────────────

export interface FixTimeoutResult {
  fix_id:     string;
  timed_out:  boolean;
  elapsed_ms: number;
  timeout_ms: number;
  error?:     string;
}

// ── withFixTimeout ────────────────────────────────────────────────────────────

export async function withFixTimeout<T>(
  fix_id:     string,
  fn:         () => Promise<T>,
  timeout_ms?: number,
  deps?:      {
    timeoutFn?: (ms: number) => Promise<never>;
    logFn?:     (msg: string) => void;
  },
): Promise<{ result?: T; timeout_result: FixTimeoutResult }> {
  const tms    = timeout_ms ?? FIX_EXECUTION_TIMEOUT_MS;
  const logFn  = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
  const start  = Date.now();

  try {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const makeTimeoutPromise: () => Promise<never> = deps?.timeoutFn
      ? () => deps.timeoutFn!(tms)
      : () =>
          new Promise<never>((_, reject) => {
            timerId = setTimeout(
              () => reject(new FixTimeoutError(fix_id, tms)),
              tms,
            );
          });

    const fnPromise      = fn();
    const timeoutPromise = makeTimeoutPromise();

    let result: T;
    try {
      result = await Promise.race([fnPromise, timeoutPromise]);
      // fn won — clear the pending timer so it doesn't hold the event loop
      if (timerId !== null) clearTimeout(timerId);
    } catch (err) {
      if (timerId !== null) clearTimeout(timerId);
      const elapsed_ms = Date.now() - start;
      const timed_out  = err instanceof FixTimeoutError;

      if (timed_out) {
        // Suppress the fn promise so it doesn't become an unhandledRejection
        fnPromise.catch(() => {});
        logFn(
          `[FIX_TIMEOUT] fix=${fix_id} elapsed=${elapsed_ms}ms timeout=${tms}ms`,
        );
      }

      return {
        result: undefined,
        timeout_result: {
          fix_id,
          timed_out,
          elapsed_ms,
          timeout_ms: tms,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }

    const elapsed_ms = Date.now() - start;
    return {
      result,
      timeout_result: {
        fix_id,
        timed_out:  false,
        elapsed_ms,
        timeout_ms: tms,
      },
    };
  } catch {
    const elapsed_ms = Date.now() - start;
    return {
      result: undefined,
      timeout_result: {
        fix_id:     fix_id ?? '',
        timed_out:  false,
        elapsed_ms,
        timeout_ms: tms,
        error:      'Unexpected error in withFixTimeout',
      },
    };
  }
}

// ── buildTimeoutFailureReason ─────────────────────────────────────────────────

export function buildTimeoutFailureReason(
  _fix_id:    string,
  timeout_ms: number,
): string {
  try {
    return `Fix execution timed out after ${timeout_ms / 1000}s — will retry next run`;
  } catch {
    return 'Fix execution timed out — will retry next run';
  }
}
