/**
 * tools/sandbox/verify_delta.ts
 *
 * Before/after delta comparison for sandbox verification.
 * Compares a pre-fix snapshot against the current live state
 * to determine which signals improved, regressed, or stayed the same.
 *
 * Never throws.
 */

import {
  multiVerify,
  type MultiVerifyResult,
  type MultiVerifyOptions,
  type VerifySignal,
} from './multi_verify.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeltaResult {
  url:               string;
  measured_at:       string;
  before:            MultiVerifyResult;
  after:             MultiVerifyResult;
  improved_signals:  VerifySignal[];
  regressed_signals: VerifySignal[];
  unchanged_signals: VerifySignal[];
  net_improvement:   number;
  verdict:           'improved' | 'regressed' | 'unchanged';
}

// ── captureSnapshot ──────────────────────────────────────────────────────────

/**
 * Capture a verification snapshot — semantic alias for multiVerify.
 * Use before applying fixes to create the "before" baseline.
 */
export async function captureSnapshot(
  url: string,
  options?: MultiVerifyOptions,
): Promise<MultiVerifyResult> {
  return multiVerify(url, options);
}

// ── measureDelta ─────────────────────────────────────────────────────────────

/**
 * Measure the delta between a before-snapshot and the current live state.
 *
 * 1. Runs multiVerify on the URL to get current state
 * 2. Compares each signal's status against the before snapshot
 * 3. Classifies signals as improved (FAIL→PASS), regressed (PASS→FAIL), or unchanged
 * 4. Calculates net improvement and verdict
 *
 * SKIP signals are treated as neutral — they don't count as improvements or regressions.
 */
export async function measureDelta(
  url: string,
  beforeSnapshot: MultiVerifyResult,
  options?: MultiVerifyOptions,
): Promise<DeltaResult> {
  const measured_at = new Date().toISOString();

  // Run current verification with same signals as before
  const beforeSignals = beforeSnapshot.signals.map((s) => s.signal);
  const mergedOptions: MultiVerifyOptions = {
    ...options,
    signals: options?.signals ?? beforeSignals,
  };

  const after = await multiVerify(url, mergedOptions);

  // Build lookup maps
  const beforeMap = new Map(beforeSnapshot.signals.map((s) => [s.signal, s.status]));
  const afterMap  = new Map(after.signals.map((s) => [s.signal, s.status]));

  const improved_signals:  VerifySignal[] = [];
  const regressed_signals: VerifySignal[] = [];
  const unchanged_signals: VerifySignal[] = [];

  // Compare all signals that appear in both snapshots
  const allSignals = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const signal of allSignals) {
    const before = beforeMap.get(signal) ?? 'SKIP';
    const current = afterMap.get(signal) ?? 'SKIP';

    if (before === 'FAIL' && current === 'PASS') {
      improved_signals.push(signal);
    } else if (before === 'PASS' && current === 'FAIL') {
      regressed_signals.push(signal);
    } else {
      unchanged_signals.push(signal);
    }
  }

  const net_improvement = improved_signals.length - regressed_signals.length;

  let verdict: 'improved' | 'regressed' | 'unchanged';
  if (net_improvement > 0) {
    verdict = 'improved';
  } else if (net_improvement < 0) {
    verdict = 'regressed';
  } else {
    verdict = 'unchanged';
  }

  return {
    url,
    measured_at,
    before: beforeSnapshot,
    after,
    improved_signals,
    regressed_signals,
    unchanged_signals,
    net_improvement,
    verdict,
  };
}
