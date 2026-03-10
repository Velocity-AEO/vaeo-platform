/**
 * packages/scoring/src/index.ts
 *
 * Velocity Health Score — 0-100 per site.
 *
 * Three weighted dimensions:
 *   Technical  40 pts  — 404s, redirects, canonical issues
 *   Content    35 pts  — title, description, h1 issues
 *   Schema     25 pts  — structured data issues
 *
 * calculateHealthScore() — pure, no I/O
 * getSiteHealthScore()   — fetches open action_queue issues, calls pure fn
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthScore {
  total:     number;   // 0-100
  technical: number;   // 0-40
  content:   number;   // 0-35
  schema:    number;   // 0-25
  grade:     string;   // A/B/C/D/F
}

// ── Scoring config ────────────────────────────────────────────────────────────

// [deduction per issue, max total deduction]
const TECHNICAL_RULES: Record<string, [number, number]> = {
  ERR_404:             [8, 24],
  ERR_500:             [8, 24],
  ERR_REDIRECT_CHAIN:  [5, 15],
  ERR_REDIRECT_LOOP:   [5, 15],
};

const CANONICAL_TYPES = [
  'CANONICAL_MISSING',
  'CANONICAL_MISMATCH',
  'CANONICAL_RELATIVE',
  'CANONICAL_REDIRECT',
  'CANONICAL_CHAIN',
];
const CANONICAL_RULE: [number, number] = [3, 12];

const CONTENT_RULES: Record<string, [number, number]> = {
  META_TITLE_MISSING:    [4, 20],
  META_TITLE_DUPLICATE:  [2, 10],
  META_DESC_MISSING:     [3, 15],
  META_DESC_DUPLICATE:   [2, 10],
  H1_MISSING:            [3, 12],
  H1_DUPLICATE:          [2,  8],
};

const SCHEMA_RULES: Record<string, [number, number]> = {
  SCHEMA_MISSING:       [3, 15],
  SCHEMA_INVALID_JSON:  [4, 12],
  SCHEMA_DUPLICATE:     [2,  8],
};

// ── Grade boundaries ──────────────────────────────────────────────────────────

function grade(total: number): string {
  if (total >= 85) return 'A';
  if (total >= 70) return 'B';
  if (total >= 50) return 'C';
  if (total >= 30) return 'D';
  return 'F';
}

// ── Pure scorer ───────────────────────────────────────────────────────────────

/**
 * Pure function — takes the array of open issues and returns the score breakdown.
 * Issue objects only need an `issue_type` string field.
 */
export function calculateHealthScore(
  issues: Array<{ issue_type: string }>,
): HealthScore {
  // Count occurrences per issue_type
  const counts = new Map<string, number>();
  for (const { issue_type } of issues) {
    counts.set(issue_type, (counts.get(issue_type) ?? 0) + 1);
  }

  // ── Technical (40) ────────────────────────────────────────────────────────
  let technical = 40;

  for (const [type, [perIssue, maxDed]] of Object.entries(TECHNICAL_RULES)) {
    const n = counts.get(type) ?? 0;
    technical -= Math.min(n * perIssue, maxDed);
  }

  // Canonical issues — aggregate all canonical types together under one cap
  let canonicalCount = 0;
  for (const type of CANONICAL_TYPES) {
    canonicalCount += counts.get(type) ?? 0;
  }
  const [canPer, canMax] = CANONICAL_RULE;
  technical -= Math.min(canonicalCount * canPer, canMax);
  technical = Math.max(0, technical);

  // ── Content (35) ──────────────────────────────────────────────────────────
  let content = 35;

  for (const [type, [perIssue, maxDed]] of Object.entries(CONTENT_RULES)) {
    const n = counts.get(type) ?? 0;
    content -= Math.min(n * perIssue, maxDed);
  }
  content = Math.max(0, content);

  // ── Schema (25) ───────────────────────────────────────────────────────────
  let schema = 25;

  for (const [type, [perIssue, maxDed]] of Object.entries(SCHEMA_RULES)) {
    const n = counts.get(type) ?? 0;
    schema -= Math.min(n * perIssue, maxDed);
  }
  schema = Math.max(0, schema);

  const total = technical + content + schema;

  return { total, technical, content, schema, grade: grade(total) };
}

// ── Live fetcher ──────────────────────────────────────────────────────────────

const OPEN_STATUSES = ['queued', 'pending_approval', 'failed'];

/**
 * Fetches open action_queue issues for the site and returns the health score.
 * On any error returns a zero score rather than throwing.
 */
export async function getSiteHealthScore(
  siteId:   string,
  tenantId: string,
): Promise<HealthScore> {
  const zero: HealthScore = { total: 0, technical: 0, content: 0, schema: 0, grade: 'F' };

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) throw new Error('Supabase env vars not set');

    const db = createClient(url, key, { auth: { persistSession: false } });

    const { data, error } = await db
      .from('action_queue')
      .select('issue_type')
      .eq('site_id', siteId)
      .eq('tenant_id', tenantId)
      .in('execution_status', OPEN_STATUSES);

    if (error) throw new Error(error.message);

    return calculateHealthScore(data ?? []);
  } catch (err) {
    process.stderr.write(
      `[scoring] getSiteHealthScore failed for ${siteId}: ${String(err)}\n`,
    );
    return zero;
  }
}
