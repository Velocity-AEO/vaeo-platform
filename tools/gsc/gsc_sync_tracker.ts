/**
 * tools/gsc/gsc_sync_tracker.ts
 *
 * Persists and queries GSC sync state so the delta sync engine knows
 * how far back to look.
 *
 * Never throws.
 */

import type { SyncMode, DeltaSyncResult } from './gsc_delta_sync.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncRecord {
  site_id:              string;
  last_full_sync_at:    string | null;
  last_delta_sync_at:   string | null;
  last_sync_at:         string | null;
  last_sync_mode:       SyncMode | null;
  total_syncs:          number;
  total_rows_fetched:   number;
}

/** 30-day threshold: force a full re-sync if we haven't done one recently. */
const FULL_SYNC_REQUIRED_AFTER_DAYS = 30;

// ── loadSyncRecord ────────────────────────────────────────────────────────────

export async function loadSyncRecord(
  site_id: string,
  deps?:   { loadFn?: (site_id: string) => Promise<SyncRecord | null> },
): Promise<SyncRecord | null> {
  try {
    const fn = deps?.loadFn ?? defaultLoadFn;
    return await fn(site_id ?? '');
  } catch {
    return null;
  }
}

// ── saveSyncRecord ────────────────────────────────────────────────────────────

export async function saveSyncRecord(
  site_id: string,
  result:  DeltaSyncResult,
  deps?:   {
    saveFn?:   (site_id: string, record: Partial<SyncRecord>) => Promise<void>;
    loadFn?:   (site_id: string) => Promise<SyncRecord | null>;
  },
): Promise<boolean> {
  try {
    const existing = await loadSyncRecord(site_id, { loadFn: deps?.loadFn });

    const now      = result.synced_at ?? new Date().toISOString();
    const mode     = result.sync_mode;
    const rows     = result.rows_fetched ?? 0;

    const update: Partial<SyncRecord> = {
      site_id,
      last_sync_at:         now,
      last_sync_mode:       mode,
      total_syncs:          (existing?.total_syncs ?? 0) + 1,
      total_rows_fetched:   (existing?.total_rows_fetched ?? 0) + rows,
      last_full_sync_at:    mode === 'full'  ? now : (existing?.last_full_sync_at  ?? null),
      last_delta_sync_at:   mode === 'delta' ? now : (existing?.last_delta_sync_at ?? null),
    };

    const saveFn = deps?.saveFn ?? defaultSaveFn;
    await saveFn(site_id, update);
    return true;
  } catch {
    return false;
  }
}

// ── shouldForceFullSync ───────────────────────────────────────────────────────

export async function shouldForceFullSync(
  site_id: string,
  deps?:   { loadFn?: (site_id: string) => Promise<SyncRecord | null> },
): Promise<boolean> {
  try {
    const record = await loadSyncRecord(site_id, deps);

    // No record: first time ever → full sync
    if (!record) return true;

    // No full sync on record yet
    if (!record.last_full_sync_at) return true;

    const ageMs   = Date.now() - new Date(record.last_full_sync_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > FULL_SYNC_REQUIRED_AFTER_DAYS;
  } catch {
    return true; // safe default: force full on error
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultLoadFn(_site_id: string): Promise<SyncRecord | null> {
  return null;
}

async function defaultSaveFn(
  _site_id: string,
  _record:  Partial<SyncRecord>,
): Promise<void> {}
