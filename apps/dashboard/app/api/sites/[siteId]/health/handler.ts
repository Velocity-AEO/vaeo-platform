/**
 * app/api/sites/[siteId]/health/handler.ts
 *
 * Pure business logic — no Next.js imports, no Supabase singletons.
 * All DB access injectable via SiteHealthDeps for deterministic testing.
 *
 * GET /api/sites/:siteId/health returns:
 *   { site_id, domain, health_score, grade, issues_by_severity,
 *     top_issues (top 5 by risk_score desc), last_updated }
 */

import { calculateHealthScore } from '../../../../../lib/scoring.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SiteInfo {
  site_id: string;
  site_url: string;
  cms_type: string;
}

export interface IssueRow {
  id: string;
  issue_type: string;
  url: string;
  risk_score: number;
  priority: number;
  execution_status: string;
}

export interface TopIssue {
  id: string;
  issue_type: string;
  url: string;
  risk_score: number;
  priority: number;
  severity: 'critical' | 'major' | 'minor';
  execution_status: string;
}

export interface SiteHealthData {
  site_id:   string;
  site_url:  string;
  cms_type:  string;
  score:     { total: number; technical: number; content: number; schema: number; grade: string };
  issues_by_severity: { critical: number; major: number; minor: number };
  total_issues: number;
  top_issues: TopIssue[];
  last_updated: string | null;
}

export interface SiteHealthResult {
  ok: boolean;
  status: number;
  data?: SiteHealthData;
  error?: string;
}

// ── Injectable deps ───────────────────────────────────────────────────────────

export interface SiteHealthDeps {
  /** Look up site metadata by primary key. Returns null if not found. */
  getSite: (siteId: string) => Promise<SiteInfo | null>;
  /** Fetch all open (queued/pending_approval/failed) action_queue rows for the site. */
  getOpenIssues: (siteId: string) => Promise<IssueRow[]>;
  /** Return ISO timestamp of the most recently updated action_queue row for the
   *  site, or null if no rows exist. Used as last_updated. */
  getLastUpdated: (siteId: string) => Promise<string | null>;
}

// ── Severity classification ───────────────────────────────────────────────────

/**
 * Classify an issue_type string into a severity bucket.
 *
 * critical — server errors, broken canonicals, missing H1
 * major    — any *_MISSING or *_DUPLICATE (titles, descriptions, schema, etc.)
 * minor    — everything else (e.g. SCHEMA_INVALID_JSON, REDIRECT_CHAIN)
 */
export function classifyIssueSeverity(
  issueType: string,
): 'critical' | 'major' | 'minor' {
  if (
    issueType.startsWith('ERR_') ||
    issueType === 'H1_MISSING' ||
    issueType === 'CANONICAL_MISSING'
  ) {
    return 'critical';
  }
  if (issueType.includes('MISSING') || issueType.includes('DUPLICATE')) {
    return 'major';
  }
  return 'minor';
}

// ── Handler ───────────────────────────────────────────────────────────────────

const TOP_ISSUES_LIMIT = 5;

/**
 * Core handler — fetches site + issues in parallel, computes health score,
 * and returns the full SiteHealthData payload.
 */
export async function getHealthData(
  siteId: string,
  deps: SiteHealthDeps,
): Promise<SiteHealthResult> {
  // ── Fetch site, open issues, and last_updated concurrently ────────────────
  let site: SiteInfo | null;
  let issues: IssueRow[];
  let lastUpdated: string | null;

  try {
    [site, issues, lastUpdated] = await Promise.all([
      deps.getSite(siteId),
      deps.getOpenIssues(siteId),
      deps.getLastUpdated(siteId),
    ]);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!site) {
    return { ok: false, status: 404, error: 'Site not found' };
  }

  // ── Health score ──────────────────────────────────────────────────────────
  const score = calculateHealthScore(issues);

  // ── issues_by_severity ────────────────────────────────────────────────────
  const issues_by_severity = { critical: 0, major: 0, minor: 0 };
  for (const issue of issues) {
    issues_by_severity[classifyIssueSeverity(issue.issue_type)]++;
  }

  // ── Top issues — highest risk first, priority as tie-break ───────────────
  const top_issues: TopIssue[] = [...issues]
    .sort((a, b) => (b.risk_score - a.risk_score) || (b.priority - a.priority))
    .slice(0, TOP_ISSUES_LIMIT)
    .map((issue) => ({
      id:               issue.id,
      issue_type:       issue.issue_type,
      url:              issue.url,
      risk_score:       issue.risk_score,
      priority:         issue.priority,
      severity:         classifyIssueSeverity(issue.issue_type),
      execution_status: issue.execution_status,
    }));

  return {
    ok: true,
    status: 200,
    data: {
      site_id:  site.site_id,
      site_url: site.site_url,
      cms_type: site.cms_type,
      score: {
        total:     score.total,
        technical: score.technical,
        content:   score.content,
        schema:    score.schema,
        grade:     score.grade,
      },
      issues_by_severity,
      total_issues: issues.length,
      top_issues,
      last_updated: lastUpdated,
    },
  };
}
