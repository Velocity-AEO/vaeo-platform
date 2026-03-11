/**
 * tools/tracer/change_detector.ts
 *
 * Compares current site issues against previous tracer observations
 * to detect new, resolved, and worsened issues.
 *
 * Injectable DB — never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeType = 'new_issue' | 'resolved' | 'worsened' | 'unchanged' | 'new_page';

export interface PageChange {
  url:              string;
  change_type:      ChangeType;
  previous_issues:  string[];
  current_issues:   string[];
  added_issues:     string[];
  resolved_issues:  string[];
  last_seen:        string;
  severity_delta:   number;
}

export interface IssueRecord {
  url:        string;
  issue_type: string;
}

// ── Injectable DB ─────────────────────────────────────────────────────────────

export interface ChangeDetectorDb {
  from(table: 'learnings'): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col2: string, val2: string): {
          order(col: string, opts: { ascending: boolean }): Promise<{
            data: Array<{ url: string; issue_type: string; created_at: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert(rows: Array<Record<string, unknown>>): {
      select(col: string): Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

// ── Severity map ──────────────────────────────────────────────────────────────

const SEVERITY: Record<string, number> = {
  SCHEMA_MISSING:         10,
  META_TITLE_MISSING:     9,
  TITLE_MISSING:          9,
  META_DESC_MISSING:      8,
  META_MISSING:           8,
  IMG_DIMENSIONS_MISSING: 5,
  DEFER_SCRIPT:           7,
  LAZY_IMAGE:             5,
  FONT_DISPLAY:           4,
};

function issueSeverity(issueType: string): number {
  return SEVERITY[issueType.toUpperCase()] ?? 5;
}

function totalSeverity(issues: string[]): number {
  return issues.reduce((sum, t) => sum + issueSeverity(t), 0);
}

// ── detectChanges ─────────────────────────────────────────────────────────────

/**
 * Compare current issues against previous tracer observations.
 * Returns a PageChange for every URL where something changed.
 */
export async function detectChanges(
  siteId:        string,
  currentIssues: IssueRecord[],
  db:            ChangeDetectorDb,
): Promise<PageChange[]> {
  // 1. Fetch previous observations
  const { data: prevRows, error } = await db
    .from('learnings')
    .select('url, issue_type, created_at')
    .eq('site_id', siteId)
    .eq('sandbox_status', 'tracer_observation')
    .order('created_at', { ascending: false });

  if (error) return [];

  // Build previous state: url → issue_types[], last_seen
  const prevMap = new Map<string, { issues: Set<string>; lastSeen: string }>();
  for (const row of prevRows ?? []) {
    if (!row.url || !row.issue_type) continue;
    const entry = prevMap.get(row.url);
    if (entry) {
      entry.issues.add(row.issue_type);
    } else {
      prevMap.set(row.url, { issues: new Set([row.issue_type]), lastSeen: row.created_at });
    }
  }

  // Build current state: url → issue_types[]
  const currMap = new Map<string, Set<string>>();
  for (const issue of currentIssues) {
    const set = currMap.get(issue.url) ?? new Set();
    set.add(issue.issue_type);
    currMap.set(issue.url, set);
  }

  const changes: PageChange[] = [];
  const now = new Date().toISOString();

  // 2. Check all current URLs
  for (const [url, currSet] of currMap) {
    const prev = prevMap.get(url);
    const currArr = [...currSet];

    if (!prev) {
      // New page — no prior observation
      changes.push({
        url,
        change_type:      'new_page',
        previous_issues:  [],
        current_issues:   currArr,
        added_issues:     currArr,
        resolved_issues:  [],
        last_seen:        now,
        severity_delta:   totalSeverity(currArr),
      });
      continue;
    }

    const prevArr     = [...prev.issues];
    const added       = currArr.filter((t) => !prev.issues.has(t));
    const resolved    = prevArr.filter((t) => !currSet.has(t));

    if (added.length === 0 && resolved.length === 0) continue; // unchanged

    const delta    = totalSeverity(currArr) - totalSeverity(prevArr);
    const hasAdded = added.length > 0;
    const hasResolved = resolved.length > 0;

    let change_type: ChangeType;
    if (hasAdded && !hasResolved) change_type = 'new_issue';
    else if (!hasAdded && hasResolved) change_type = 'resolved';
    else if (delta > 0) change_type = 'worsened';
    else change_type = 'resolved'; // net improvement

    changes.push({
      url,
      change_type,
      previous_issues: prevArr,
      current_issues:  currArr,
      added_issues:    added,
      resolved_issues: resolved,
      last_seen:       prev.lastSeen,
      severity_delta:  delta,
    });
  }

  // 3. Check for fully resolved pages (in prev but not in current)
  for (const [url, prev] of prevMap) {
    if (currMap.has(url)) continue;
    changes.push({
      url,
      change_type:      'resolved',
      previous_issues:  [...prev.issues],
      current_issues:   [],
      added_issues:     [],
      resolved_issues:  [...prev.issues],
      last_seen:        prev.lastSeen,
      severity_delta:   -totalSeverity([...prev.issues]),
    });
  }

  return changes;
}

// ── storeSnapshot ─────────────────────────────────────────────────────────────

/**
 * Write current issues as tracer observations for future change detection.
 */
export async function storeSnapshot(
  siteId: string,
  issues: IssueRecord[],
  db:     ChangeDetectorDb,
): Promise<void> {
  if (issues.length === 0) return;

  const rows = issues.map((issue) => ({
    site_id:          siteId,
    url:              issue.url,
    issue_type:       issue.issue_type,
    sandbox_status:   'tracer_observation',
    approval_status:  'observation',
  }));

  await db.from('learnings').insert(rows).select('id');
}
