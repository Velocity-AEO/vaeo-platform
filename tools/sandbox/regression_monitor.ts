/**
 * tools/sandbox/regression_monitor.ts
 *
 * Regression monitor for sandbox verification.
 * Tracks verification results over time and detects regressions
 * when signals that previously passed start failing.
 *
 * Uses MultiVerifyResult snapshots as the data source.
 * Never throws.
 */

import type {
  MultiVerifyResult,
  VerifySignal,
  SignalResult,
} from './multi_verify.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RegressionAlert {
  signal:    VerifySignal;
  url:       string;
  was:       'PASS' | 'FAIL' | 'SKIP';
  now:       'PASS' | 'FAIL' | 'SKIP';
  detected_at: string;
  message:   string;
}

export interface MonitorCheckResult {
  url:        string;
  checked_at: string;
  current:    MultiVerifyResult;
  alerts:     RegressionAlert[];
  has_regression: boolean;
  /** Count of consecutive checks with regressions (resets on clear check). */
  streak:     number;
}

export interface MonitorHistory {
  url:       string;
  snapshots: MultiVerifyResult[];
  /** The most recent check result with alerts. */
  last_check?: MonitorCheckResult;
}

// ── MonitorStore (in-memory, injectable) ─────────────────────────────────────

export interface MonitorStore {
  getHistory(url: string): MonitorHistory | null;
  saveHistory(history: MonitorHistory): void;
}

/** Default in-memory store. */
export function createMemoryStore(): MonitorStore {
  const store = new Map<string, MonitorHistory>();
  return {
    getHistory: (url) => store.get(url) ?? null,
    saveHistory: (history) => { store.set(history.url, history); },
  };
}

// ── Regression detection ─────────────────────────────────────────────────────

/**
 * Compare current result against the last known-good state (most recent snapshot
 * where the signal was PASS). A regression is PASS→FAIL transition.
 */
function detectRegressions(
  current: MultiVerifyResult,
  baseline: MultiVerifyResult,
): RegressionAlert[] {
  const alerts: RegressionAlert[] = [];
  const now = new Date().toISOString();

  const baselineMap = new Map<VerifySignal, SignalResult['status']>(
    baseline.signals.map((s) => [s.signal, s.status]),
  );

  for (const sig of current.signals) {
    const was = baselineMap.get(sig.signal);
    if (!was) continue;

    if (was === 'PASS' && sig.status === 'FAIL') {
      alerts.push({
        signal:      sig.signal,
        url:         current.url,
        was:         'PASS',
        now:         'FAIL',
        detected_at: now,
        message:     `Signal "${sig.signal}" regressed from PASS to FAIL${sig.error ? ': ' + sig.error : ''}`,
      });
    }
  }

  return alerts;
}

/**
 * Find the most recent snapshot where a given signal was PASS.
 * Searches backwards through history.
 */
function findLastGoodSnapshot(
  snapshots: MultiVerifyResult[],
): MultiVerifyResult | null {
  // Use the most recent snapshot as baseline (it represents last known state)
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1];
}

// ── checkForRegressions ──────────────────────────────────────────────────────

/**
 * Check a URL for regressions by comparing the current state
 * against stored history.
 *
 * 1. Get current verification result
 * 2. Load history for this URL
 * 3. Compare against last known-good baseline
 * 4. Generate alerts for any regressions
 * 5. Save updated history
 */
export function checkForRegressions(
  current: MultiVerifyResult,
  store: MonitorStore,
): MonitorCheckResult {
  const checked_at = new Date().toISOString();
  const url = current.url;

  const history = store.getHistory(url) ?? { url, snapshots: [] };
  const baseline = findLastGoodSnapshot(history.snapshots);

  let alerts: RegressionAlert[] = [];
  if (baseline) {
    alerts = detectRegressions(current, baseline);
  }

  const previousStreak = history.last_check?.streak ?? 0;
  const streak = alerts.length > 0 ? previousStreak + 1 : 0;

  const result: MonitorCheckResult = {
    url,
    checked_at,
    current,
    alerts,
    has_regression: alerts.length > 0,
    streak,
  };

  // Save snapshot and check result
  history.snapshots.push(current);
  // Keep last 50 snapshots to prevent unbounded growth
  if (history.snapshots.length > 50) {
    history.snapshots = history.snapshots.slice(-50);
  }
  history.last_check = result;
  store.saveHistory(history);

  return result;
}

/**
 * Get the regression history for a URL.
 */
export function getHistory(
  url: string,
  store: MonitorStore,
): MonitorHistory | null {
  return store.getHistory(url);
}

/**
 * Check if a URL has any active regressions.
 */
export function hasActiveRegressions(
  url: string,
  store: MonitorStore,
): boolean {
  const history = store.getHistory(url);
  return history?.last_check?.has_regression ?? false;
}
