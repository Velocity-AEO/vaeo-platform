/**
 * tools/learning/pattern_engine.ts
 *
 * Queries the learnings table to surface fix patterns and success rates.
 * Injectable DB — never throws.
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

export interface PatternSummary {
  issue_type:     string;
  page_type:      string;
  total:          number;
  passed:         number;
  failed:         number;
  success_rate:   number;
  avg_confidence: number;
  sample_fixes:   string[];
}

// ── DB interface (injectable) ─────────────────────────────────────────────────

type DbResult = { data: LearningRow[] | null; error: { message: string } | null };

export interface PatternQuery extends PromiseLike<DbResult> {
  eq(col: string, val: string): PatternQuery;
  order(col: string, opts: { ascending: boolean }): PatternQuery;
  limit(n: number): PatternQuery;
}

export interface PatternDb {
  from(table: 'learnings'): {
    select(cols: string): PatternQuery;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function derivePageType(url?: string): string {
  if (!url) return 'unknown';
  if (/\/products\//.test(url))                          return 'product';
  if (/\/collections\//.test(url))                       return 'collection';
  if (/\/blogs\//.test(url) || /\/articles\//.test(url)) return 'article';
  if (/\/pages\//.test(url))                             return 'page';
  if (/^https?:\/\/[^/]+\/?$/.test(url) || url === '/') return 'home';
  return 'other';
}

async function fetchAll(db: PatternDb, issueType?: string): Promise<LearningRow[]> {
  try {
    let q = db.from('learnings').select('*');
    if (issueType) q = q.eq('issue_type', issueType);
    const { data, error } = await q;
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// ── queryPatterns ─────────────────────────────────────────────────────────────

/**
 * Returns aggregated PatternSummary[] grouped by (issue_type, page_type).
 * Only returns groups with >= min_samples rows (default 3).
 */
export async function queryPatterns(filters: {
  issue_type?:  string;
  page_type?:   string;
  min_samples?: number;
  db:           PatternDb;
}): Promise<PatternSummary[]> {
  const { issue_type, page_type, min_samples = 3, db } = filters;

  const rows = await fetchAll(db, issue_type);

  // Group by (issue_type, page_type)
  const groups = new Map<string, LearningRow[]>();
  for (const row of rows) {
    if (!row.issue_type) continue;
    const pt = derivePageType(row.url);
    if (page_type && pt !== page_type) continue;
    const key = `${row.issue_type}::${pt}`;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }

  const summaries: PatternSummary[] = [];
  for (const [key, group] of groups) {
    if (group.length < min_samples) continue;

    const [iss, pt] = key.split('::');
    const passed  = group.filter((r) => r.approval_status === 'approved').length;
    const failed  = group.filter((r) => r.approval_status === 'rejected').length;
    const decided = passed + failed;
    const success_rate = decided > 0 ? passed / decided : 0;

    const sample_fixes = [
      ...new Set(
        group
          .filter((r) => r.approval_status === 'approved' && r.after_value)
          .map((r) => r.after_value as string),
      ),
    ].slice(0, 3);

    summaries.push({
      issue_type:     iss,
      page_type:      pt,
      total:          group.length,
      passed,
      failed,
      success_rate,
      avg_confidence: success_rate,
      sample_fixes,
    });
  }

  summaries.sort((a, b) => b.total - a.total);
  return summaries;
}

// ── getBestFix ────────────────────────────────────────────────────────────────

/**
 * Returns the most commonly approved fix for the given issue_type.
 * Returns null when fewer than 3 approved samples exist.
 */
export async function getBestFix(
  issue_type: string,
  _url:       string,
  db:         PatternDb,
): Promise<{ recommended_fix: string; confidence: number; based_on_samples: number } | null> {
  try {
    const rows     = await fetchAll(db, issue_type);
    const approved = rows.filter((r) => r.approval_status === 'approved' && r.after_value);

    if (approved.length < 3) return null;

    // Most common after_value among approved rows
    const counts = new Map<string, number>();
    for (const r of approved) {
      const fix = r.after_value as string;
      counts.set(fix, (counts.get(fix) ?? 0) + 1);
    }

    let bestFix   = '';
    let bestCount = 0;
    for (const [fix, count] of counts) {
      if (count > bestCount) { bestFix = fix; bestCount = count; }
    }

    if (!bestFix) return null;

    const decided    = rows.filter((r) => r.approval_status === 'approved' || r.approval_status === 'rejected').length;
    const confidence = decided > 0 ? approved.length / decided : 0;

    return {
      recommended_fix:  bestFix,
      confidence:       Math.min(confidence, 1),
      based_on_samples: approved.length,
    };
  } catch {
    return null;
  }
}
