/**
 * tools/mcp/handlers/site_learnings.ts
 *
 * Returns learning rows for a site, optionally filtered by issue_type.
 */

export interface SiteLearningsResult {
  learnings: unknown[];
  total:     number;
}

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface SlDb { from(table: string): DbQ<unknown[]> }

const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 100;

export async function getSiteLearnings(
  input: { site_id: string; issue_type?: string; limit?: number },
  db:    unknown,
): Promise<SiteLearningsResult> {
  try {
    const sldb  = db as SlDb;
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    let q = (sldb.from('learnings') as DbQ<Record<string, unknown>[]>)
      .select('id, site_id, issue_type, url, fix_type, approval_status, applied_at, created_at')
      .eq('site_id', input.site_id);

    if (input.issue_type) {
      q = q.eq('issue_type', input.issue_type);
    }

    q = q.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await q;
    if (error || !data) return { learnings: [], total: 0 };

    return { learnings: data, total: data.length };
  } catch {
    return { learnings: [], total: 0 };
  }
}
