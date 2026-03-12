/**
 * tools/learning/approval_queue.ts
 *
 * Manages approval_queue rows for human review before fixes are applied.
 *
 * Rules:
 *   - queueForApproval: only enqueue when sandbox_status = 'PASS'
 *   - getApprovalQueue: returns rows with status = 'pending'
 *   - updateApprovalStatus: sets status + reviewer_id + reviewer_note + reviewed_at
 *
 * Injectable DB client — never throws, returns result objects.
 */

import {
  evaluateForAutoApproval,
  runAutoApprovalBatch,
  type AutoApprovalConfig,
} from './auto_approver.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalQueueParams {
  site_id?:             string;
  action_queue_id?:     string;
  learning_id?:         string;
  issue_type?:          string;
  url?:                 string;
  before_value?:        string;
  proposed_value?:      string;
  sandbox_result?:      Record<string, unknown>;
  sandbox_status:       string;
  autoApprove?:         boolean;
  autoApprovalConfig?:  AutoApprovalConfig;
}

export interface ApprovalQueueItem {
  id:               string;
  site_id?:         string;
  action_queue_id?: string;
  learning_id?:     string;
  issue_type?:      string;
  url?:             string;
  before_value?:    string;
  proposed_value?:  string;
  sandbox_result?:  Record<string, unknown>;
  status:           string;
  reviewer_id?:     string;
  reviewer_note?:   string;
  reviewed_at?:     string;
  created_at?:      string;
}

export interface QueueResult {
  ok:     boolean;
  id?:    string;
  error?: string;
}

export interface UpdateResult {
  ok:     boolean;
  error?: string;
}

// ── DB interface (injectable) ─────────────────────────────────────────────────

export interface ApprovalDb {
  from(table: 'approval_queue'): {
    insert(row: Record<string, unknown>): {
      select(col: string): {
        maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
    select(cols: string): {
      eq(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): Promise<{ data: ApprovalQueueItem[] | null; error: { message: string } | null }>;
      };
      order(col: string, opts: { ascending: boolean }): Promise<{ data: ApprovalQueueItem[] | null; error: { message: string } | null }>;
    };
    update(row: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

// ── queueForApproval ──────────────────────────────────────────────────────────

/**
 * Enqueue an item for human review.
 * No-ops and returns { ok: false, error } when sandbox_status !== 'PASS'.
 */
export async function queueForApproval(
  params: ApprovalQueueParams,
  db:     ApprovalDb,
): Promise<QueueResult> {
  try {
    if (params.sandbox_status !== 'PASS') {
      return { ok: false, error: `sandbox_status must be PASS to queue for approval (got: ${params.sandbox_status})` };
    }

    const row: Record<string, unknown> = {
      site_id:         params.site_id,
      action_queue_id: params.action_queue_id,
      learning_id:     params.learning_id,
      issue_type:      params.issue_type,
      url:             params.url,
      before_value:    params.before_value,
      proposed_value:  params.proposed_value,
      sandbox_result:  params.sandbox_result,
      status:          'pending',
    };

    // Optional auto-approval evaluation
    if (params.autoApprove && params.autoApprovalConfig && params.issue_type && params.url) {
      const evalResult = await evaluateForAutoApproval(
        {
          id:           'pending',
          url:          params.url,
          issue_type:   params.issue_type,
          proposed_fix: params.proposed_value ?? '',
        },
        params.autoApprovalConfig,
        db,
      );
      if (evalResult.approved) {
        row.status        = 'approved';
        row.reviewer_note = `auto_approved=true; ${evalResult.reason}`;
        row.reviewed_at   = evalResult.auto_approved_at;
      }
    }

    const { data, error } = await db
      .from('approval_queue')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: 'No id returned from insert' };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── getApprovalQueue ──────────────────────────────────────────────────────────

/**
 * Returns pending approval_queue items, optionally filtered by site_id.
 */
export async function getApprovalQueue(
  db:      ApprovalDb,
  siteId?: string,
): Promise<ApprovalQueueItem[]> {
  try {
    const query = db.from('approval_queue').select('*');

    const ordered = siteId
      ? query.eq('site_id', siteId).order('created_at', { ascending: true })
      : query.eq('status', 'pending').order('created_at', { ascending: true });

    const { data, error } = await ordered;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

// ── processAutoApprovals ──────────────────────────────────────────────────────

export interface ProcessAutoResult {
  processed: number;
  approved:  number;
  skipped:   number;
}

/**
 * Find all pending items in approval_queue for a site, run auto-approval
 * evaluation, and update status='approved' for those that pass.
 */
export async function processAutoApprovals(
  siteId: string,
  config: AutoApprovalConfig,
  db:     ApprovalDb,
): Promise<ProcessAutoResult> {
  try {
    const pending = await getApprovalQueue(db, siteId);
    if (!pending.length) return { processed: 0, approved: 0, skipped: 0 };

    const items = pending.map((p) => ({
      id:           p.id,
      url:          p.url ?? '',
      issue_type:   p.issue_type ?? '',
      proposed_fix: p.proposed_value ?? '',
    }));

    const { approved: approvedList, skipped: skippedList } = await runAutoApprovalBatch(items, config, db);

    // Persist approved statuses
    for (const r of approvedList) {
      await updateApprovalStatus(r.item_id, 'approved', `auto_approved=true; ${r.reason}`, db);
    }

    return {
      processed: pending.length,
      approved:  approvedList.length,
      skipped:   skippedList.length,
    };
  } catch {
    return { processed: 0, approved: 0, skipped: 0 };
  }
}

// ── updateApprovalStatus ──────────────────────────────────────────────────────

/**
 * Set status, reviewer_id, reviewer_note, and reviewed_at on an approval row.
 */
export async function updateApprovalStatus(
  id:          string,
  status:      string,
  note:        string,
  db:          ApprovalDb,
  reviewerId?: string,
): Promise<UpdateResult> {
  try {
    if (!id) return { ok: false, error: 'id is required' };
    if (!status) return { ok: false, error: 'status is required' };

    const { error } = await db
      .from('approval_queue')
      .update({
        status,
        reviewer_note: note,
        reviewer_id:   reviewerId ?? null,
        reviewed_at:   new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
