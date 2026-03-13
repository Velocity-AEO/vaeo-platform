/**
 * tools/pipeline/suspension_store.ts
 *
 * Reads and writes pipeline suspension state to the sites table.
 * All functions injectable and never throw.
 */

import type { SuspensionRecord } from './suspension_policy.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SuspendDeps {
  writeFn?: (site_id: string, fields: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}

export interface ResumeDeps {
  writeFn?: (site_id: string, fields: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}

export interface GetActiveDeps {
  queryFn?: (tenant_id: string) => Promise<SuspensionRecord[]>;
}

export interface AutoResumeDeps {
  queryFn?:  () => Promise<Array<{ site_id: string; resume_at: string }>>;
  resumeFn?: (site_id: string) => Promise<boolean>;
}

// ── suspendSite ───────────────────────────────────────────────────────────────

/**
 * Writes suspension state to the sites table.
 * Returns true on success, false on error.
 * Never throws.
 */
export async function suspendSite(
  record: SuspensionRecord,
  deps?:  SuspendDeps,
): Promise<boolean> {
  try {
    const fields: Record<string, unknown> = {
      pipeline_suspended:        true,
      pipeline_suspended_at:     record.suspended_at,
      pipeline_resume_at:        record.resume_at,
      pipeline_suspension_reason: record.reason,
      consecutive_failures:      record.consecutive_failures,
    };

    if (deps?.writeFn) {
      const r = await deps.writeFn(record.site_id, fields).catch(() => ({ ok: false }));
      return r.ok;
    }

    // No-op default — caller must inject writeFn for real DB writes
    return false;
  } catch {
    return false;
  }
}

// ── resumeSite ────────────────────────────────────────────────────────────────

/**
 * Clears suspension state on a site.
 * Sets pipeline_suspended = false and resets consecutive_failures.
 * Never throws.
 */
export async function resumeSite(
  site_id: string,
  deps?:   ResumeDeps,
): Promise<boolean> {
  try {
    const fields: Record<string, unknown> = {
      pipeline_suspended:        false,
      pipeline_suspended_at:     null,
      pipeline_resume_at:        null,
      pipeline_suspension_reason: null,
      consecutive_failures:      0,
    };

    if (deps?.writeFn) {
      const r = await deps.writeFn(site_id ?? '', fields).catch(() => ({ ok: false }));
      return r.ok;
    }

    return false;
  } catch {
    return false;
  }
}

// ── getActiveSuspensions ──────────────────────────────────────────────────────

/**
 * Returns all currently suspended sites for a tenant.
 * Returns [] on error.
 * Never throws.
 */
export async function getActiveSuspensions(
  tenant_id: string,
  deps?:     GetActiveDeps,
): Promise<SuspensionRecord[]> {
  try {
    if (deps?.queryFn) {
      return await deps.queryFn(tenant_id ?? '').catch(() => []);
    }
    return [];
  } catch {
    return [];
  }
}

// ── checkAndAutoResume ────────────────────────────────────────────────────────

/**
 * Finds all auto_resume suspensions where resume_at <= now and calls resumeSite.
 * Returns list of resumed site_ids.
 * Never throws.
 */
export async function checkAndAutoResume(
  deps?: AutoResumeDeps,
): Promise<{ resumed: string[] }> {
  try {
    if (!deps?.queryFn) return { resumed: [] };

    const candidates = await deps.queryFn().catch(() => [] as Array<{ site_id: string; resume_at: string }>);
    const now        = new Date();
    const resumed:   string[] = [];

    for (const c of candidates ?? []) {
      try {
        const resumeAt = new Date(c.resume_at);
        if (resumeAt <= now) {
          if (deps.resumeFn) {
            await deps.resumeFn(c.site_id).catch(() => false);
          }
          resumed.push(c.site_id);
        }
      } catch {
        // skip this candidate — non-fatal
      }
    }

    return { resumed };
  } catch {
    return { resumed: [] };
  }
}
