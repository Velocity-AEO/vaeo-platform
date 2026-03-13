/**
 * tools/sandbox/lighthouse_history_store.ts
 *
 * Stores and loads Lighthouse score history for trend analysis.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LighthouseHistoryEntry {
  id:              string;
  site_id:         string;
  url:             string;
  fix_id:          string | null;
  form_factor:     'mobile' | 'desktop';
  performance:     number | null;
  seo:             number | null;
  accessibility:   number | null;
  best_practices:  number | null;
  measured_at:     string;
  trigger:         'fix_sandbox' | 'scheduled' | 'manual' | 'drift_scan';
}

// ── saveLighthouseScore ──────────────────────────────────────────────────────

export async function saveLighthouseScore(
  entry: LighthouseHistoryEntry,
  deps?: { saveFn?: (entry: LighthouseHistoryEntry) => Promise<boolean> },
): Promise<boolean> {
  try {
    if (!entry) return false;
    const save = deps?.saveFn ?? defaultSave;
    return await save({
      ...entry,
      id: entry.id || randomUUID(),
      measured_at: entry.measured_at || new Date().toISOString(),
    });
  } catch {
    return false;
  }
}

// ── loadLighthouseHistory ────────────────────────────────────────────────────

export async function loadLighthouseHistory(
  site_id: string,
  url: string,
  form_factor: 'mobile' | 'desktop',
  limit = 30,
  deps?: { loadFn?: (site_id: string, url: string, form_factor: string, limit: number) => Promise<LighthouseHistoryEntry[]> },
): Promise<LighthouseHistoryEntry[]> {
  try {
    const load = deps?.loadFn ?? defaultLoad;
    const entries = await load(site_id, url, form_factor, limit);
    return (entries ?? [])
      .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ── loadSiteLighthouseHistory ────────────────────────────────────────────────

export async function loadSiteLighthouseHistory(
  site_id: string,
  form_factor: 'mobile' | 'desktop',
  period_days: number,
  deps?: { loadFn?: (site_id: string, form_factor: string, since: string) => Promise<LighthouseHistoryEntry[]> },
): Promise<LighthouseHistoryEntry[]> {
  try {
    const since = new Date(Date.now() - period_days * 86_400_000).toISOString();
    const load = deps?.loadFn ?? defaultLoadSite;
    const entries = await load(site_id, form_factor, since);
    return (entries ?? [])
      .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
  } catch {
    return [];
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultSave(_entry: LighthouseHistoryEntry): Promise<boolean> {
  return true;
}

async function defaultLoad(
  _site_id: string, _url: string, _form_factor: string, _limit: number,
): Promise<LighthouseHistoryEntry[]> {
  return [];
}

async function defaultLoadSite(
  _site_id: string, _form_factor: string, _since: string,
): Promise<LighthouseHistoryEntry[]> {
  return [];
}
