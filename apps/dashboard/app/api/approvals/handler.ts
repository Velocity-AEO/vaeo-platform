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
  /** Mark an approval row with a status and optional timestamp note. */
  setStatus:     (id: string, status: string, note: string, reviewerId?: string) => Promise<{ ok: boolean; error?: string }>;
  /** Update the linked learning row. */
  setLearning:   (learningId: string, updates: { approval_status: string; reviewer_note?: string }) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Optional — load a full approval row by id.
   * Required when executeSchemaFn is provided.
   */
  loadApprovalRow?: (id: string) => Promise<ApprovalRow | null>;
  /**
   * Optional — execute a real schema write for schema fix types.
   * When provided, schema approvals transition through:
   *   approved → applying → applied | failed | rolled_back
   */
  executeSchemaFn?: (id: string, row: ApprovalRow) => Promise<{
    ok:          boolean;
    status:      'applied' | 'failed' | 'rolled_back';
    error?:      string;
    rolled_back?: boolean;
  }>;
}

/** Issue types that trigger immediate schema execution on approval. */
function isSchemaIssueType(issue_type: string): boolean {
  try {
    const lower = (issue_type ?? '').toLowerCase();
    return lower.includes('schema') || lower === 'schema_fix' || lower === 'schema_missing' ||
           lower === 'schema_invalid_basic' || lower === 'schema_multiple_organizations';
  } catch {
    return false;
  }
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
    // Mark approved (standard path)
    const setResult = await deps.setStatus(id, 'approved', note, reviewerId);
    if (!setResult.ok) return { ok: false, error: setResult.error, status: 500 };

    if (learningId) {
      await deps.setLearning(learningId, { approval_status: 'approved', reviewer_note: note });
    }

    // ── Schema execution gate ──────────────────────────────────────────────
    // When executeSchemaFn is wired in, schema fix approvals execute
    // immediately and transition through the full status lifecycle:
    //   approved → applying → applied | failed | rolled_back
    if (deps.executeSchemaFn && deps.loadApprovalRow) {
      try {
        const row = await deps.loadApprovalRow(id).catch(() => null);
        if (row && isSchemaIssueType(row.issue_type ?? '')) {
          const ts = new Date().toISOString();

          // Transition to 'applying'
          await deps.setStatus(id, 'applying', `applying at ${ts}`, reviewerId).catch(() => {});

          // Execute the real schema write
          const execResult = await deps.executeSchemaFn(id, row).catch(() => ({
            ok:     false as const,
            status: 'failed' as const,
            error:  'executeSchemaFn threw unexpectedly',
          }));

          // Transition to final status
          const finalStatus = execResult.ok ? 'applied'
            : execResult.rolled_back ? 'rolled_back'
            : execResult.status === 'rolled_back' ? 'rolled_back'
            : 'failed';

          const finalNote = execResult.error
            ? `${finalStatus} at ${new Date().toISOString()}: ${execResult.error}`
            : `${finalStatus} at ${new Date().toISOString()}`;

          await deps.setStatus(id, finalStatus, finalNote, reviewerId).catch(() => {});

          return execResult.ok
            ? { ok: true }
            : { ok: false, error: execResult.error ?? `Schema write ${finalStatus}`, status: 500 };
        }
      } catch {
        // Schema execution errors must not fail the approval record
        // The item remains 'approved' and can be retried.
      }
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
