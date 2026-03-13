/**
 * tools/tracer/drift_event_store.ts
 *
 * Persists drift events and provides query helpers.
 * All functions are injectable for testing.
 *
 * Never throws.
 */

import type { DriftEvent } from './drift_scanner.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriftHistorySummary {
  site_id:          string;
  total_events:     number;
  stable_count:     number;
  drifted_count:    number;
  unknown_count:    number;
  resolved_count:   number;
  drift_rate:       number;
  most_recent_at:   string | null;
  most_common_cause: string | null;
}

export interface DriftEventStoreRow extends DriftEvent {
  id?:          string;
  resolved_at?: string | null;
  is_resolved?: boolean;
}

export interface DriftEventStoreDeps {
  saveFn?:         (event: DriftEvent) => Promise<string | null>;
  loadFn?:         (site_id: string) => Promise<DriftEventStoreRow[]>;
  resolveFn?:      (fix_id: string) => Promise<boolean>;
}

// ── saveDriftEvent ────────────────────────────────────────────────────────────

export async function saveDriftEvent(
  event: DriftEvent,
  deps?: DriftEventStoreDeps,
): Promise<boolean> {
  try {
    if (!event || !event.fix_id || !event.site_id) return false;
    const fn = deps?.saveFn ?? defaultSaveFn;
    const id = await fn(event);
    return id !== null;
  } catch {
    return false;
  }
}

// ── loadDriftEvents ───────────────────────────────────────────────────────────

export async function loadDriftEvents(
  site_id: string,
  deps?:   DriftEventStoreDeps,
): Promise<DriftEventStoreRow[]> {
  try {
    if (!site_id) return [];
    const fn = deps?.loadFn ?? defaultLoadFn;
    return await fn(site_id);
  } catch {
    return [];
  }
}

// ── loadDriftedFixes ──────────────────────────────────────────────────────────

export async function loadDriftedFixes(
  site_id: string,
  deps?:   DriftEventStoreDeps,
): Promise<DriftEventStoreRow[]> {
  try {
    const all = await loadDriftEvents(site_id, deps);
    return all.filter(e => e.drift_status === 'drifted' && !e.is_resolved);
  } catch {
    return [];
  }
}

// ── markDriftResolved ─────────────────────────────────────────────────────────

export async function markDriftResolved(
  fix_id: string,
  deps?:  DriftEventStoreDeps,
): Promise<boolean> {
  try {
    if (!fix_id) return false;
    const fn = deps?.resolveFn ?? defaultResolveFn;
    return await fn(fix_id);
  } catch {
    return false;
  }
}

// ── summarizeDriftHistory ─────────────────────────────────────────────────────

export async function summarizeDriftHistory(
  site_id: string,
  deps?:   DriftEventStoreDeps,
): Promise<DriftHistorySummary> {
  const empty: DriftHistorySummary = {
    site_id:           site_id ?? '',
    total_events:      0,
    stable_count:      0,
    drifted_count:     0,
    unknown_count:     0,
    resolved_count:    0,
    drift_rate:        0,
    most_recent_at:    null,
    most_common_cause: null,
  };

  try {
    if (!site_id) return empty;

    const events = await loadDriftEvents(site_id, deps);
    if (!events.length) return { ...empty, site_id };

    const stable_count   = events.filter(e => e.drift_status === 'stable').length;
    const drifted_count  = events.filter(e => e.drift_status === 'drifted').length;
    const unknown_count  = events.filter(e => e.drift_status === 'unknown').length;
    const resolved_count = events.filter(e => e.is_resolved).length;

    // Drift rate = drifted / total
    const drift_rate = events.length > 0
      ? Math.min(100, Math.max(0, Math.round((drifted_count / events.length) * 1000) / 10))
      : 0;

    // Most recent scan date
    const dates = events
      .map(e => e.drift_detected_at)
      .filter(Boolean)
      .sort()
      .reverse();
    const most_recent_at = dates[0] ?? null;

    // Most common cause among drifted events
    const causeCounts: Record<string, number> = {};
    for (const e of events) {
      if (e.drift_status === 'drifted' && e.probable_cause) {
        causeCounts[e.probable_cause] = (causeCounts[e.probable_cause] ?? 0) + 1;
      }
    }
    const causeEntries = Object.entries(causeCounts).sort((a, b) => b[1] - a[1]);
    const most_common_cause = causeEntries[0]?.[0] ?? null;

    return {
      site_id,
      total_events:     events.length,
      stable_count,
      drifted_count,
      unknown_count,
      resolved_count,
      drift_rate,
      most_recent_at,
      most_common_cause,
    };
  } catch {
    return empty;
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultSaveFn(_event: DriftEvent): Promise<string | null> {
  return null;
}

async function defaultLoadFn(_site_id: string): Promise<DriftEventStoreRow[]> {
  return [];
}

async function defaultResolveFn(_fix_id: string): Promise<boolean> {
  return false;
}
