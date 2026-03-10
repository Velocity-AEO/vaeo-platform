/**
 * tools/reports/case_study_report.ts
 *
 * Generates a structured case-study report for a VAEO site run.
 * Pulls data from tracer_field_snapshots, action_queue, and health scores
 * to produce a client-deliverable report.
 *
 * Pure logic — all I/O goes through injectable deps.
 * Never throws — returns CaseStudyReport with error field on failure.
 */

import type { Severity } from '../scoring/issue_classifier.js';
import type { Grade }    from '../scoring/health_score.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteInfo {
  domain:              string;
  cms:                 string;
  health_score_before: number;
  health_score_after:  number;
  score_delta:         number;
  grade_before:        Grade;
  grade_after:         Grade;
}

export interface ReportSummary {
  total_urls:          number;
  total_issues_found:  number;
  total_fixes_applied: number;
  critical_count:      number;
  major_count:         number;
  minor_count:         number;
}

export interface FixApplied {
  url:          string;
  field:        string;
  issue_type:   string;
  before_value: string | null;
  after_value:  string | null;
  confidence:   number;
}

export interface TopWin {
  url:              string;
  field:            string;
  issue_type:       string;
  before_value:     string | null;
  after_value:      string | null;
  estimated_impact: number;   // 1–10, derived from severity + confidence
  reason:           string;
}

export interface CaseStudyReport {
  site:          SiteInfo;
  summary:       ReportSummary;
  fixes_applied: FixApplied[];
  top_wins:      TopWin[];
  generated_at:  string;
  run_id:        string;
  error?:        string;
}

// ── Data shapes from database ───────────────────────────────────────────────

export interface SnapshotRow {
  url:            string;
  field_type:     string;
  current_value:  string | null;
  proposed_value: string | null;
  issue_flag:     boolean;
  issue_type:     string | null;
  char_count:     number | null;
}

export interface ActionRow {
  id:               string;
  url:              string;
  issue_type:       string;
  risk_score:       number;
  execution_status: string;
  proposed_fix:     Record<string, unknown>;
}

export interface SiteRow {
  site_url:  string;
  cms_type:  string;
}

// ── Injectable deps ─────────────────────────────────────────────────────────

export interface CaseStudyDeps {
  /** Load site record by site_id. */
  loadSite: (siteId: string) => Promise<SiteRow | null>;
  /** Load tracer_field_snapshots for this run. */
  loadSnapshots: (siteId: string, runId: string) => Promise<SnapshotRow[]>;
  /** Load action_queue rows for this run. */
  loadActions: (siteId: string, runId: string) => Promise<ActionRow[]>;
  /** Load the total URL count for this site from tracer_url_inventory. */
  loadUrlCount: (siteId: string) => Promise<number>;
  /** Load the "before" health score (captured at scan time). */
  loadHealthScoreBefore: (siteId: string, runId: string) => Promise<{ score: number; grade: Grade } | null>;
  /** Calculate the "after" health score from current snapshots. */
  loadHealthScoreAfter: (siteId: string, runId: string) => Promise<{ score: number; grade: Grade } | null>;
}

// ── Impact scoring ──────────────────────────────────────────────────────────

const SEVERITY_IMPACT: Record<string, number> = {
  // critical issue types
  title_missing:     9,
  h1_missing:        8,
  canonical_missing: 8,
  // major issue types
  meta_missing:      7,
  schema_missing:    6,
  title_duplicate:   6,
  meta_duplicate:    5,
  h1_multiple:       5,
  // minor issue types
  title_too_short:   3,
  title_too_long:    3,
  meta_too_short:    3,
  meta_too_long:     2,
};

function estimateImpact(issueType: string, confidence: number): number {
  const base = SEVERITY_IMPACT[issueType] ?? 4;
  // Scale by confidence: high confidence = full impact credit
  return Math.round(Math.min(10, base * Math.max(confidence, 0.5)));
}

function impactReason(issueType: string): string {
  const reasons: Record<string, string> = {
    title_missing:     'Missing titles directly impact SERP click-through rate',
    h1_missing:        'H1 tags are a primary on-page ranking signal',
    canonical_missing: 'Missing canonicals cause duplicate content and crawl budget waste',
    meta_missing:      'Meta descriptions improve SERP CTR and reduce pogo-sticking',
    schema_missing:    'Structured data enables rich snippets and improves visibility',
    title_duplicate:   'Duplicate titles cause keyword cannibalization across pages',
    meta_duplicate:    'Duplicate descriptions reduce unique SERP presentation',
    h1_multiple:       'Multiple H1s dilute heading hierarchy signals',
    title_too_short:   'Short titles miss keyword opportunities and look sparse in SERPs',
    title_too_long:    'Truncated titles lose key messaging in search results',
    meta_too_short:    'Short descriptions underutilize available SERP real estate',
    meta_too_long:     'Long descriptions get truncated, losing the call to action',
  };
  return reasons[issueType] ?? `Fixing ${issueType.replace(/_/g, ' ')} improves overall SEO health`;
}

/** Map issue_type strings to severity for counting. */
function toSeverity(issueType: string): Severity {
  if (['title_missing', 'h1_missing', 'canonical_missing'].includes(issueType)) return 'critical';
  if (['meta_missing', 'schema_missing', 'title_duplicate', 'meta_duplicate', 'h1_multiple'].includes(issueType)) return 'major';
  return 'minor';
}

// ── Core generator ──────────────────────────────────────────────────────────

export async function generateCaseStudyReport(
  siteId: string,
  runId:  string,
  deps:   CaseStudyDeps,
): Promise<CaseStudyReport> {
  const fail = (error: string): CaseStudyReport => ({
    site: { domain: '', cms: '', health_score_before: 0, health_score_after: 0, score_delta: 0, grade_before: 'F', grade_after: 'F' },
    summary: { total_urls: 0, total_issues_found: 0, total_fixes_applied: 0, critical_count: 0, major_count: 0, minor_count: 0 },
    fixes_applied: [],
    top_wins: [],
    generated_at: new Date().toISOString(),
    run_id: runId,
    error,
  });

  // ── 1. Load site ──────────────────────────────────────────────────────────
  let site: SiteRow;
  try {
    const found = await deps.loadSite(siteId);
    if (!found) return fail(`Site not found: ${siteId}`);
    site = found;
  } catch (err) {
    return fail(`Site load error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Load data in parallel ──────────────────────────────────────────────
  let snapshots: SnapshotRow[];
  let actions: ActionRow[];
  let totalUrls: number;
  let scoreBefore: { score: number; grade: Grade };
  let scoreAfter: { score: number; grade: Grade };

  try {
    const [snaps, acts, urls, before, after] = await Promise.all([
      deps.loadSnapshots(siteId, runId),
      deps.loadActions(siteId, runId),
      deps.loadUrlCount(siteId),
      deps.loadHealthScoreBefore(siteId, runId),
      deps.loadHealthScoreAfter(siteId, runId),
    ]);
    snapshots  = snaps;
    actions    = acts;
    totalUrls  = urls;
    scoreBefore = before ?? { score: 0, grade: 'F' as Grade };
    scoreAfter  = after  ?? { score: 0, grade: 'F' as Grade };
  } catch (err) {
    return fail(`Data load error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Count issues by severity ───────────────────────────────────────────
  const issueSnapshots = snapshots.filter((s) => s.issue_flag && s.issue_type);
  let criticalCount = 0;
  let majorCount = 0;
  let minorCount = 0;
  for (const snap of issueSnapshots) {
    const sev = toSeverity(snap.issue_type!);
    if (sev === 'critical') criticalCount++;
    else if (sev === 'major') majorCount++;
    else minorCount++;
  }

  // ── 4. Build fixes_applied from action_queue rows with completed/deployed/approved status ─
  const appliedStatuses = new Set(['completed', 'deployed', 'approved']);
  const appliedActions = actions.filter((a) => appliedStatuses.has(a.execution_status));

  const fixesApplied: FixApplied[] = appliedActions.map((action) => {
    // Find matching snapshot for before_value
    const matchSnap = snapshots.find(
      (s) => s.url === action.url && fieldMatchesIssue(s.field_type, action.issue_type),
    );

    const afterValue = extractAfterValue(action);
    const confidence = extractConfidence(action);

    return {
      url:          action.url,
      field:        issueToField(action.issue_type),
      issue_type:   action.issue_type,
      before_value: matchSnap?.current_value ?? null,
      after_value:  afterValue,
      confidence,
    };
  });

  // ── 5. Build top_wins — top 3 by estimated impact ────────────────────────
  const scored = fixesApplied.map((fix) => ({
    ...fix,
    estimated_impact: estimateImpact(fix.issue_type, fix.confidence),
    reason:           impactReason(fix.issue_type),
  }));
  scored.sort((a, b) => b.estimated_impact - a.estimated_impact);
  const topWins: TopWin[] = scored.slice(0, 3);

  // ── 6. Assemble report ───────────────────────────────────────────────────
  const domain = site.site_url.replace(/^https?:\/\//, '');

  return {
    site: {
      domain,
      cms:                 site.cms_type,
      health_score_before: scoreBefore.score,
      health_score_after:  scoreAfter.score,
      score_delta:         scoreAfter.score - scoreBefore.score,
      grade_before:        scoreBefore.grade,
      grade_after:         scoreAfter.grade,
    },
    summary: {
      total_urls:          totalUrls,
      total_issues_found:  issueSnapshots.length,
      total_fixes_applied: fixesApplied.length,
      critical_count:      criticalCount,
      major_count:         majorCount,
      minor_count:         minorCount,
    },
    fixes_applied: fixesApplied,
    top_wins:      topWins,
    generated_at:  new Date().toISOString(),
    run_id:        runId,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a field_type matches an issue_type (e.g. 'title' matches 'title_missing'). */
function fieldMatchesIssue(fieldType: string, issueType: string): boolean {
  const map: Record<string, string[]> = {
    title:            ['title_missing', 'title_too_short', 'title_too_long', 'title_duplicate', 'META_TITLE_MISSING', 'META_TITLE_LONG', 'META_TITLE_DUPLICATE'],
    meta_description: ['meta_missing', 'meta_too_short', 'meta_too_long', 'meta_duplicate', 'META_DESC_MISSING', 'META_DESC_LONG'],
    h1:               ['h1_missing', 'h1_multiple', 'H1_MISSING', 'H1_DUPLICATE'],
    canonical:        ['canonical_missing', 'CANONICAL_MISSING', 'CANONICAL_MISMATCH'],
    schema:           ['schema_missing', 'SCHEMA_MISSING', 'SCHEMA_INVALID_JSON'],
  };
  return (map[fieldType] ?? []).includes(issueType);
}

/** Map issue_type to field name. */
function issueToField(issueType: string): string {
  if (issueType.toLowerCase().includes('title')) return 'title';
  if (issueType.toLowerCase().includes('meta') || issueType.toLowerCase().includes('desc')) return 'meta_description';
  if (issueType.toLowerCase().includes('h1')) return 'h1';
  if (issueType.toLowerCase().includes('canonical')) return 'canonical';
  if (issueType.toLowerCase().includes('schema')) return 'schema';
  return issueType;
}

/** Extract after_value from an action's proposed_fix. */
function extractAfterValue(action: ActionRow): string | null {
  const fix = action.proposed_fix;
  for (const key of ['new_title', 'new_description', 'new_h1', 'new_value', 'generated_text', 'after_value']) {
    if (typeof fix[key] === 'string') return fix[key] as string;
  }
  return null;
}

/** Extract confidence from an action's proposed_fix. */
function extractConfidence(action: ActionRow): number {
  const fix = action.proposed_fix;
  if (typeof fix['confidence_score'] === 'number') return fix['confidence_score'];
  if (typeof fix['confidence'] === 'number') return fix['confidence'];
  return 0.8; // default
}

// ── Report formatters ───────────────────────────────────────────────────────

/**
 * Generate a markdown report suitable for client delivery.
 */
export function generateMarkdownReport(report: CaseStudyReport): string {
  const s = report.site;
  const r = report.summary;

  const lines: string[] = [
    `# SEO Case Study: ${s.domain}`,
    '',
    `**Generated:** ${report.generated_at}`,
    `**Run ID:** ${report.run_id}`,
    `**CMS:** ${s.cms}`,
    '',
    '## Health Score',
    '',
    `| Metric | Before | After | Change |`,
    `|--------|--------|-------|--------|`,
    `| Score  | ${s.health_score_before} | ${s.health_score_after} | ${s.score_delta >= 0 ? '+' : ''}${s.score_delta} |`,
    `| Grade  | ${s.grade_before} | ${s.grade_after} | |`,
    '',
    '## Summary',
    '',
    `- **Total URLs scanned:** ${r.total_urls}`,
    `- **Issues found:** ${r.total_issues_found}`,
    `- **Fixes applied:** ${r.total_fixes_applied}`,
    `- **Critical:** ${r.critical_count}`,
    `- **Major:** ${r.major_count}`,
    `- **Minor:** ${r.minor_count}`,
    '',
  ];

  if (report.top_wins.length > 0) {
    lines.push('## Top Wins', '');
    for (let i = 0; i < report.top_wins.length; i++) {
      const w = report.top_wins[i];
      lines.push(
        `### ${i + 1}. ${w.issue_type} on ${w.url}`,
        '',
        `- **Field:** ${w.field}`,
        `- **Before:** ${w.before_value ?? '(empty)'}`,
        `- **After:** ${w.after_value ?? '(pending)'}`,
        `- **Impact:** ${w.estimated_impact}/10`,
        `- **Why:** ${w.reason}`,
        '',
      );
    }
  }

  if (report.fixes_applied.length > 0) {
    lines.push('## All Fixes Applied', '');
    lines.push('| URL | Field | Issue | Before | After | Confidence |');
    lines.push('|-----|-------|-------|--------|-------|------------|');
    for (const f of report.fixes_applied) {
      const before = f.before_value ? truncate(f.before_value, 30) : '(empty)';
      const after  = f.after_value  ? truncate(f.after_value, 30)  : '(pending)';
      lines.push(`| ${truncate(f.url, 40)} | ${f.field} | ${f.issue_type} | ${before} | ${after} | ${(f.confidence * 100).toFixed(0)}% |`);
    }
    lines.push('');
  }

  lines.push('---', `*Report generated by VAEO Tracer*`);

  return lines.join('\n');
}

/**
 * Generate a JSON report string.
 */
export function generateJsonReport(report: CaseStudyReport): string {
  return JSON.stringify(report, null, 2);
}

/** Truncate a string for table display. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}
