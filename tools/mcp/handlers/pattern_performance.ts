/**
 * tools/mcp/handlers/pattern_performance.ts
 *
 * Aggregates fix performance across all sites for a given issue_type.
 */

export interface PatternPerformanceResult {
  issue_type:        string;
  total_fixes:       number;
  success_rate:      number;   // 0–100
  avg_health_delta:  number;
  sites_affected:    number;
}

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface PpDb { from(table: string): DbQ<unknown[]> }

export async function getPatternPerformance(
  input: { issue_type: string; min_confidence?: number },
  db:    unknown,
): Promise<PatternPerformanceResult> {
  const empty: PatternPerformanceResult = {
    issue_type:       input.issue_type,
    total_fixes:      0,
    success_rate:     0,
    avg_health_delta: 0,
    sites_affected:   0,
  };

  try {
    const ppdb = db as PpDb;
    const { data, error } = await (ppdb.from('learnings') as DbQ<Record<string, unknown>[]>)
      .select('site_id, approval_status, before_value, after_value')
      .eq('issue_type', input.issue_type);

    if (error || !data?.length) return empty;

    const rows = data as Array<{
      site_id?:         string;
      approval_status?: string;
      before_value?:    string;
      after_value?:     string;
    }>;

    const total_fixes    = rows.length;
    const decided        = rows.filter((r) => r.approval_status === 'approved' || r.approval_status === 'rejected');
    const approved       = decided.filter((r) => r.approval_status === 'approved');
    const success_rate   = decided.length > 0 ? (approved.length / decided.length) * 100 : 0;
    const sites_affected = new Set(rows.map((r) => r.site_id).filter(Boolean)).size;

    // avg health delta
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
    const avg_health_delta = deltaCount > 0 ? Math.round((deltaSum / deltaCount) * 100) / 100 : 0;

    const rounded_rate = Math.round(success_rate * 10) / 10;

    // Apply min_confidence filter
    if (input.min_confidence !== undefined && rounded_rate < input.min_confidence) {
      return empty;
    }

    return { issue_type: input.issue_type, total_fixes, success_rate: rounded_rate, avg_health_delta, sites_affected };
  } catch {
    return empty;
  }
}
