/**
 * tools/tracer/drift_requeue_engine.ts
 *
 * Re-queues drifted fixes for reapplication.
 * Preserves original fix metadata and sets high priority.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DriftEvent {
  fix_id:         string;
  site_id:        string;
  url:            string;
  issue_type:     string;
  expected_value: string;
  current_value:  string;
  probable_cause: string;
  detected_at:    string;
}

export interface DriftRequeueResult {
  fix_id:      string;
  site_id:     string;
  requeued:    boolean;
  new_fix_id:  string | null;
  reason:      string;
}

export interface DriftRequeueDeps {
  createFixFn?:    (fix: Record<string, unknown>) => Promise<string | null>;
  loadOriginalFn?: (fix_id: string) => Promise<Record<string, unknown> | null>;
}

export interface DriftRequeueSummary {
  total:            number;
  requeued:         number;
  failed:           number;
  requeued_fix_ids: string[];
}

// ── requeueDriftedFix ────────────────────────────────────────────────────────

export async function requeueDriftedFix(
  drift_event: DriftEvent,
  deps?: DriftRequeueDeps,
): Promise<DriftRequeueResult> {
  try {
    if (!drift_event || !drift_event.fix_id || !drift_event.site_id) {
      return {
        fix_id: drift_event?.fix_id ?? '',
        site_id: drift_event?.site_id ?? '',
        requeued: false,
        new_fix_id: null,
        reason: 'missing fix_id or site_id',
      };
    }

    const loadOriginal = deps?.loadOriginalFn ?? defaultLoadOriginal;
    const createFix = deps?.createFixFn ?? defaultCreateFix;

    const original = await loadOriginal(drift_event.fix_id);

    const new_fix_id = randomUUID();
    const fixRecord: Record<string, unknown> = {
      fix_id:          new_fix_id,
      site_id:         drift_event.site_id,
      url:             drift_event.url ?? original?.url ?? '',
      issue_type:      drift_event.issue_type ?? original?.issue_type ?? '',
      expected_value:  drift_event.expected_value ?? original?.expected_value ?? '',
      original_value:  drift_event.current_value ?? '',
      status:          'queued',
      trigger:         'drift_requeue',
      original_fix_id: drift_event.fix_id,
      priority:        'high',
      created_at:      new Date().toISOString(),
    };

    const created_id = await createFix(fixRecord);

    if (created_id) {
      return {
        fix_id: drift_event.fix_id,
        site_id: drift_event.site_id,
        requeued: true,
        new_fix_id: created_id,
        reason: 'requeued',
      };
    }

    return {
      fix_id: drift_event.fix_id,
      site_id: drift_event.site_id,
      requeued: false,
      new_fix_id: null,
      reason: 'create fix failed',
    };
  } catch {
    return {
      fix_id: drift_event?.fix_id ?? '',
      site_id: drift_event?.site_id ?? '',
      requeued: false,
      new_fix_id: null,
      reason: 'requeue error',
    };
  }
}

// ── requeueAllDriftedFixes ───────────────────────────────────────────────────

export async function requeueAllDriftedFixes(
  drift_events: DriftEvent[],
  deps?: { requeueFn?: (evt: DriftEvent) => Promise<DriftRequeueResult> } & DriftRequeueDeps,
): Promise<DriftRequeueResult[]> {
  try {
    const safe = drift_events ?? [];
    const results: DriftRequeueResult[] = [];
    const requeue = deps?.requeueFn ?? ((evt: DriftEvent) => requeueDriftedFix(evt, deps));

    for (const evt of safe) {
      try {
        const result = await requeue(evt);
        results.push(result);
      } catch {
        results.push({
          fix_id: evt?.fix_id ?? '',
          site_id: evt?.site_id ?? '',
          requeued: false,
          new_fix_id: null,
          reason: 'requeue error',
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ── buildDriftRequeueSummary ─────────────────────────────────────────────────

export function buildDriftRequeueSummary(
  results: DriftRequeueResult[],
): DriftRequeueSummary {
  try {
    const safe = results ?? [];
    const requeued = safe.filter(r => r.requeued);
    return {
      total: safe.length,
      requeued: requeued.length,
      failed: safe.length - requeued.length,
      requeued_fix_ids: requeued.map(r => r.new_fix_id!).filter(Boolean),
    };
  } catch {
    return { total: 0, requeued: 0, failed: 0, requeued_fix_ids: [] };
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultLoadOriginal(_fix_id: string): Promise<Record<string, unknown> | null> {
  return null;
}

async function defaultCreateFix(_fix: Record<string, unknown>): Promise<string | null> {
  return null;
}
