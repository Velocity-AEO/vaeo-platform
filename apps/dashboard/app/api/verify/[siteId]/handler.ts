/**
 * app/api/verify/[siteId]/handler.ts
 *
 * Public verification endpoint — returns summary health data for a site.
 * No tenant auth required. Only exposes safe, summary-level data.
 * Pure logic — all I/O goes through injectable deps.
 * Never throws — returns result objects with error fields on failure.
 */

import { calculateHealthScore } from '../../../../lib/scoring.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteRow {
  site_id:  string;
  site_url: string;
}

export interface IssueRow {
  issue_type:       string;
  execution_status: string;
}

export interface RunRow {
  ts: string;
}

export type BadgeState = 'verified' | 'needs_work' | 'inactive';

export interface VerifyResult {
  ok:     boolean;
  data?: {
    site_url:         string;
    domain:           string;
    health_score:     number;
    grade:            string;
    last_verified_at: string | null;
    issues_resolved:  number;
    checks_performed: string[];
    badge_state:      BadgeState;
  };
  error?: string;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface VerifyDeps {
  /** Load site by ID (no tenant filter — public lookup). */
  loadSite:      (siteId: string) => Promise<SiteRow | null>;
  /** Load all action_queue rows for this site. */
  loadIssues:    (siteId: string) => Promise<IssueRow[]>;
  /** Load the most recent completed run timestamp. */
  loadLastRun:   (siteId: string) => Promise<string | null>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPEN_STATUSES  = new Set(['queued', 'pending_approval', 'failed']);
const FIXED_STATUSES = new Set(['deployed', 'completed', 'approved']);

/** The issue categories we check — shown as "what was checked" on the card. */
const CHECK_CATEGORIES: Record<string, string> = {
  META_TITLE:  'Page titles',
  META_DESC:   'Meta descriptions',
  H1:          'Heading structure',
  CANONICAL:   'Canonical links',
  SCHEMA:      'Structured data',
  ERR_404:     'Broken links (404)',
  ERR_500:     'Server errors',
  REDIRECT:    'Redirect chains',
};

function deriveChecks(issues: IssueRow[]): string[] {
  const seen = new Set<string>();
  for (const { issue_type } of issues) {
    // Normalize: META_TITLE_MISSING → META_TITLE, ERR_404 → ERR_404, etc.
    for (const prefix of Object.keys(CHECK_CATEGORIES)) {
      if (issue_type.startsWith(prefix)) {
        seen.add(prefix);
        break;
      }
    }
  }
  // Always include core checks even if no issues found (means they passed)
  for (const key of ['META_TITLE', 'META_DESC', 'H1', 'CANONICAL', 'SCHEMA']) {
    seen.add(key);
  }
  return [...seen].map((k) => CHECK_CATEGORIES[k]!);
}

function deriveBadgeState(score: number, lastRun: string | null): BadgeState {
  if (!lastRun) return 'inactive';
  // Stale if last run was more than 30 days ago
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(lastRun).getTime() > thirtyDaysMs) return 'inactive';
  return score >= 70 ? 'verified' : 'needs_work';
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function getVerification(
  siteId: string,
  deps:   VerifyDeps,
): Promise<VerifyResult> {
  if (!siteId) {
    return { ok: false, error: 'site_id is required' };
  }

  try {
    const [site, issues, lastRun] = await Promise.all([
      deps.loadSite(siteId),
      deps.loadIssues(siteId),
      deps.loadLastRun(siteId),
    ]);

    if (!site) {
      return { ok: false, error: 'Site not found' };
    }

    const openIssues    = issues.filter((i) => OPEN_STATUSES.has(i.execution_status));
    const fixedCount    = issues.filter((i) => FIXED_STATUSES.has(i.execution_status)).length;
    const score         = calculateHealthScore(openIssues);
    const checks        = deriveChecks(issues);
    const badgeState    = deriveBadgeState(score.total, lastRun);

    return {
      ok: true,
      data: {
        site_url:         site.site_url,
        domain:           site.site_url.replace(/^https?:\/\//, ''),
        health_score:     score.total,
        grade:            score.grade,
        last_verified_at: lastRun,
        issues_resolved:  fixedCount,
        checks_performed: checks,
        badge_state:      badgeState,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
