/**
 * tools/mcp/handlers/fix_confidence.ts
 *
 * Returns historical fix confidence for a (site_id, issue_type) pair.
 * confidence = (approved fixes / total decided) * 100
 * avg_delta  = mean health score improvement from learnings
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FixConfidenceResult {
  confidence:  number;       // 0–100
  sample_size: number;
  avg_delta:   number;       // average health score delta
  last_seen:   string | null;
}

// ── DB interface ──────────────────────────────────────────────────────────────

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface FcDb { from(table: string): DbQ<unknown[]> }

// ── getFixConfidence ──────────────────────────────────────────────────────────

export async function getFixConfidence(
  input: { site_id: string; issue_type: string },
  db:    unknown,
): Promise<FixConfidenceResult> {
  const empty: FixConfidenceResult = { confidence: 0, sample_size: 0, avg_delta: 0, last_seen: null };

  try {
    const fdb = db as FcDb;
    const { data, error } = await (fdb.from('learnings') as DbQ<Record<string, unknown>[]>)
      .select('approval_status, after_value, before_value, applied_at, created_at')
      .eq('site_id', input.site_id)
      .eq('issue_type', input.issue_type)
      .order('created_at', { ascending: false });

    if (error || !data?.length) return empty;

    const rows = data as Array<{
      approval_status?: string;
      after_value?:     string;
      before_value?:    string;
      applied_at?:      string;
      created_at?:      string;
    }>;

    const sample_size = rows.length;
    const decided     = rows.filter((r) => r.approval_status === 'approved' || r.approval_status === 'rejected');
    const approved    = decided.filter((r) => r.approval_status === 'approved');

    const confidence  = decided.length > 0 ? (approved.length / decided.length) * 100 : 0;

    // avg_delta: attempt to parse numeric before/after values as health scores
    let deltaSum   = 0;
    let deltaCount = 0;
    for (const r of rows) {
      const before = parseFloat(r.before_value ?? '');
      const after  = parseFloat(r.after_value  ?? '');
      if (!isNaN(before) && !isNaN(after)) {
        deltaSum += after - before;
        deltaCount++;
      }
    }
    const avg_delta = deltaCount > 0 ? Math.round((deltaSum / deltaCount) * 100) / 100 : 0;

    const last_seen = rows[0]?.applied_at ?? rows[0]?.created_at ?? null;

    return {
      confidence:  Math.round(confidence * 10) / 10,
      sample_size,
      avg_delta,
      last_seen,
    };
  } catch {
    return empty;
  }
}
