/**
 * tools/mcp/handlers/top_issues.ts
 *
 * Returns top unresolved issues for a site ranked by frequency.
 */

export interface TopIssuesResult {
  issues: Array<{
    issue_type: string;
    severity:   string;
    count:      number;
    last_seen:  string;
  }>;
}

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  neq(col: string, val: unknown): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface TiDb { from(table: string): DbQ<unknown[]> }

const SEVERITY_MAP: Record<string, string> = {
  title_missing:        'critical',
  meta_missing:         'major',
  schema_missing:       'major',
  canonical_missing:    'major',
  TIMESTAMP_MISSING:    'minor',
  TIMESTAMP_STALE:      'minor',
  SPEAKABLE_MISSING:    'minor',
  FAQ_OPPORTUNITY:      'minor',
};

function inferSeverity(issueType: string): string {
  return SEVERITY_MAP[issueType]
    ?? (issueType.includes('MISSING') ? 'major' : 'minor');
}

const DEFAULT_LIMIT = 10;

export async function getTopIssues(
  input: { site_id: string; limit?: number },
  db:    unknown,
): Promise<TopIssuesResult> {
  try {
    const tidb  = db as TiDb;
    const limit = input.limit ?? DEFAULT_LIMIT;

    const { data, error } = await (tidb.from('action_queue') as DbQ<Record<string, unknown>[]>)
      .select('issue_type, execution_status, updated_at, created_at')
      .eq('site_id', input.site_id)
      .neq('execution_status', 'deployed')
      .neq('execution_status', 'verified')
      .order('updated_at', { ascending: false });

    if (error || !data?.length) return { issues: [] };

    const rows = data as Array<{
      issue_type?:       string;
      execution_status?: string;
      updated_at?:       string;
      created_at?:       string;
    }>;

    // Group by issue_type
    const grouped = new Map<string, { count: number; last_seen: string }>();
    for (const row of rows) {
      const type     = row.issue_type ?? 'unknown';
      const ts       = row.updated_at ?? row.created_at ?? '';
      const existing = grouped.get(type);
      if (!existing) {
        grouped.set(type, { count: 1, last_seen: ts });
      } else {
        existing.count++;
        if (ts > existing.last_seen) existing.last_seen = ts;
      }
    }

    const issues = [...grouped.entries()]
      .map(([issue_type, { count, last_seen }]) => ({
        issue_type,
        severity: inferSeverity(issue_type),
        count,
        last_seen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { issues };
  } catch {
    return { issues: [] };
  }
}
