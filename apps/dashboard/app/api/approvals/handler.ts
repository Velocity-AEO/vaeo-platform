/**
 * app/api/approvals/handler.ts
 *
 * GET /api/approvals — returns pending approval_queue items.
 * POST /api/approvals/[id]/approve — marks approved, updates learning.
 * POST /api/approvals/[id]/reject  — marks rejected,  updates learning.
 *
 * Pure logic — injectable deps, no Next.js imports, no Supabase singletons.
 * Never throws — returns result objects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalRow {
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

export interface ApprovalsResult {
  ok:      boolean;
  data?:   ApprovalRow[];
  error?:  string;
  status?: number;
}

export interface ApproveResult {
  ok:      boolean;
  error?:  string;
  status?: number;
}

// ── Injectable deps ───────────────────────────────────────────────────────────

export interface ApprovalsDeps {
  /** Fetch all pending approval_queue items (optionally filtered by site). */
  getPending:    (siteId?: string) => Promise<ApprovalRow[]>;
  /** Mark an approval row approved/rejected. */
  setStatus:     (id: string, status: string, note: string, reviewerId?: string) => Promise<{ ok: boolean; error?: string }>;
  /** Update the linked learning row. */
  setLearning:   (learningId: string, updates: { approval_status: string; reviewer_note?: string }) => Promise<{ ok: boolean; error?: string }>;
}

// ── getApprovals ──────────────────────────────────────────────────────────────

export async function getApprovals(
  deps:    ApprovalsDeps,
  siteId?: string,
): Promise<ApprovalsResult> {
  try {
    const data = await deps.getPending(siteId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 500 };
  }
}

// ── approveItem ───────────────────────────────────────────────────────────────

export async function approveItem(
  id:          string,
  note:        string,
  reviewerId:  string | undefined,
  learningId:  string | undefined,
  deps:        ApprovalsDeps,
): Promise<ApproveResult> {
  if (!id) return { ok: false, error: 'id is required', status: 400 };

  try {
    const setResult = await deps.setStatus(id, 'approved', note, reviewerId);
    if (!setResult.ok) return { ok: false, error: setResult.error, status: 500 };

    if (learningId) {
      await deps.setLearning(learningId, { approval_status: 'approved', reviewer_note: note });
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 500 };
  }
}

// ── rejectItem ────────────────────────────────────────────────────────────────

export async function rejectItem(
  id:          string,
  note:        string,
  reviewerId:  string | undefined,
  learningId:  string | undefined,
  deps:        ApprovalsDeps,
): Promise<ApproveResult> {
  if (!id) return { ok: false, error: 'id is required', status: 400 };

  try {
    const setResult = await deps.setStatus(id, 'rejected', note, reviewerId);
    if (!setResult.ok) return { ok: false, error: setResult.error, status: 500 };

    if (learningId) {
      await deps.setLearning(learningId, { approval_status: 'rejected', reviewer_note: note });
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 500 };
  }
}
