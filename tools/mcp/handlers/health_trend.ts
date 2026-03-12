/**
 * tools/mcp/handlers/health_trend.ts
 *
 * Returns health score trend + applied fix counts for a site over N days.
 * direction: improving / declining / stable (±5 threshold).
 */

export interface HealthTrendResult {
  trend: Array<{
    date:          string;
    score:         number;
    fixes_applied: number;
  }>;
  direction: 'improving' | 'declining' | 'stable';
}

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  gte(col: string, val: unknown): DbQ<T>;
  lte(col: string, val: unknown): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface HtDb { from(table: string): DbQ<unknown[]> }

const DEFAULT_DAYS        = 30;
const DIRECTION_THRESHOLD = 5;

export async function getHealthTrend(
  input: { site_id: string; days?: number },
  db:    unknown,
): Promise<HealthTrendResult> {
  const empty: HealthTrendResult = { trend: [], direction: 'stable' };

  try {
    const htdb = db as HtDb;
    const days = input.days ?? DEFAULT_DAYS;
    const from = new Date(Date.now() - days * 86_400_000).toISOString();

    // Load health scores
    const { data: scoresRaw, error: scoresErr } = await (htdb.from('site_health_scores') as DbQ<Record<string, unknown>[]>)
      .select('score, recorded_at')
      .eq('site_id', input.site_id)
      .gte('recorded_at', from)
      .order('recorded_at', { ascending: true });

    if (scoresErr) return empty;
    const scores = (scoresRaw ?? []) as Array<{ score: number; recorded_at: string }>;

    // Load deployed fixes in the same window
    const { data: fixesRaw } = await (htdb.from('action_queue') as DbQ<Record<string, unknown>[]>)
      .select('updated_at')
      .eq('site_id', input.site_id)
      .eq('execution_status', 'deployed')
      .gte('updated_at', from);

    const fixes = (fixesRaw ?? []) as Array<{ updated_at: string }>;

    // Build a date → fix count map
    const fixesByDate = new Map<string, number>();
    for (const f of fixes) {
      const d = f.updated_at.slice(0, 10); // YYYY-MM-DD
      fixesByDate.set(d, (fixesByDate.get(d) ?? 0) + 1);
    }

    // Build trend: one entry per score row (deduplicated by date — keep last per day)
    const byDate = new Map<string, number>();
    for (const s of scores) {
      const d = s.recorded_at.slice(0, 10);
      byDate.set(d, s.score); // last score for that day wins
    }

    const trend = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, score]) => ({
        date,
        score,
        fixes_applied: fixesByDate.get(date) ?? 0,
      }));

    // Direction: compare last vs first
    let direction: HealthTrendResult['direction'] = 'stable';
    if (trend.length >= 2) {
      const first = trend[0]!.score;
      const last  = trend[trend.length - 1]!.score;
      if (last > first + DIRECTION_THRESHOLD)      direction = 'improving';
      else if (last < first - DIRECTION_THRESHOLD) direction = 'declining';
    }

    return { trend, direction };
  } catch {
    return empty;
  }
}
