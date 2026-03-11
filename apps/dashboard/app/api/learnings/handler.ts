/**
 * app/api/learnings/handler.ts
 *
 * GET /api/learnings — returns learnings rows with optional filters.
 * Supports query params: site_id, issue_type, status, limit.
 *
 * Pure logic — injectable deps, no Next.js imports.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningRow {
  id:               string;
  site_id?:         string;
  issue_type?:      string;
  url?:             string;
  fix_type?:        string;
  before_value?:    string;
  after_value?:     string;
  sandbox_status?:  string;
  approval_status?: string;
  reviewer_note?:   string;
  applied_at?:      string;
  created_at?:      string;
}

export interface LearningsQuery {
  site_id?:     string;
  issue_type?:  string;
  status?:      string;
  limit?:       number;
}

export interface LearningsResult {
  ok:      boolean;
  data?:   LearningRow[];
  error?:  string;
  status?: number;
}

// ── Injectable deps ───────────────────────────────────────────────────────────

export interface LearningsDeps {
  fetchLearnings: (query: LearningsQuery) => Promise<LearningRow[]>;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function getLearnings(
  query: LearningsQuery,
  deps:  LearningsDeps,
): Promise<LearningsResult> {
  try {
    const limit = query.limit ?? 100;
    if (limit < 1 || limit > 1000) {
      return { ok: false, error: 'limit must be between 1 and 1000', status: 400 };
    }
    const data = await deps.fetchLearnings({ ...query, limit });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 500 };
  }
}
