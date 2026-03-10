/**
 * tools/email/digest.ts
 *
 * Generates a weekly SEO digest report for a site.
 * Pulls last 7 days of action_queue data: fixes applied, health score
 * change (before vs now), issues resolved, issues remaining.
 *
 * Pure logic — all DB access injectable via DigestDeps.
 * Never throws — returns DigestReport with error on failure.
 */

import type { Grade } from '../scoring/health_score.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DigestReport {
  site_id:          string;
  tenant_id:        string;
  site_url:         string;
  health_before:    number;
  health_after:     number;
  grade_before:     Grade;
  grade_after:      Grade;
  fixes_applied:    number;
  issues_resolved:  number;
  issues_remaining: number;
  top_win:          string;
  generated_at:     string;
  error?:           string;
}

export interface ActionRow {
  id:               string;
  issue_type:       string;
  url:              string;
  execution_status: string;
  updated_at:       string;
}

export interface HealthSnapshotRow {
  score: number;
  grade: Grade;
  recorded_at: string;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface DigestDeps {
  /** Look up the site URL for the given site_id. */
  getSiteUrl:            (siteId: string, tenantId: string) => Promise<string | null>;
  /** Load action_queue rows updated in the last 7 days. */
  getRecentActions:      (siteId: string, tenantId: string, since: string) => Promise<ActionRow[]>;
  /** Load the current open issues count (queued, pending_approval, failed). */
  getOpenIssueCount:     (siteId: string, tenantId: string) => Promise<number>;
  /** Load the health score from 7 days ago (or the oldest available). */
  getHealthScoreBefore:  (siteId: string, tenantId: string) => Promise<HealthSnapshotRow | null>;
  /** Load the current health score. */
  getHealthScoreNow:     (siteId: string, tenantId: string) => Promise<HealthSnapshotRow | null>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEPLOYED_STATUSES  = new Set(['deployed', 'verified']);
const RESOLVED_STATUSES  = new Set(['deployed', 'verified', 'rolled_back']);

function pickTopWin(actions: ActionRow[]): string {
  const deployed = actions.filter((a) => DEPLOYED_STATUSES.has(a.execution_status));
  if (deployed.length === 0) return 'No fixes deployed this week.';

  // Group by issue_type and pick the most common
  const counts = new Map<string, number>();
  for (const a of deployed) {
    counts.set(a.issue_type, (counts.get(a.issue_type) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topType, topCount] = sorted[0];
  const label = topType.replace(/_/g, ' ');
  return `Fixed ${topCount} ${label} issue${topCount === 1 ? '' : 's'} this week.`;
}

function toGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateDigest(
  siteId:   string,
  tenantId: string,
  deps:     DigestDeps,
): Promise<DigestReport> {
  const now   = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Fetch all data concurrently ──────────────────────────────────────────

  let siteUrl: string | null;
  let actions: ActionRow[];
  let openCount: number;
  let before: HealthSnapshotRow | null;
  let after:  HealthSnapshotRow | null;

  try {
    [siteUrl, actions, openCount, before, after] = await Promise.all([
      deps.getSiteUrl(siteId, tenantId),
      deps.getRecentActions(siteId, tenantId, since),
      deps.getOpenIssueCount(siteId, tenantId),
      deps.getHealthScoreBefore(siteId, tenantId),
      deps.getHealthScoreNow(siteId, tenantId),
    ]);
  } catch (err) {
    return errorReport(siteId, tenantId, err);
  }

  if (!siteUrl) {
    return errorReport(siteId, tenantId, new Error('Site not found'));
  }

  // ── Derive metrics ───────────────────────────────────────────────────────

  const fixes_applied   = actions.filter((a) => DEPLOYED_STATUSES.has(a.execution_status)).length;
  const issues_resolved = actions.filter((a) => RESOLVED_STATUSES.has(a.execution_status)).length;

  const health_before = before?.score ?? 0;
  const health_after  = after?.score  ?? 0;
  const grade_before  = before?.grade ?? toGrade(health_before);
  const grade_after   = after?.grade  ?? toGrade(health_after);

  return {
    site_id:          siteId,
    tenant_id:        tenantId,
    site_url:         siteUrl,
    health_before,
    health_after,
    grade_before,
    grade_after,
    fixes_applied,
    issues_resolved,
    issues_remaining: openCount,
    top_win:          pickTopWin(actions),
    generated_at:     now.toISOString(),
  };
}

// ── Error helper ──────────────────────────────────────────────────────────────

function errorReport(siteId: string, tenantId: string, err: unknown): DigestReport {
  return {
    site_id:          siteId,
    tenant_id:        tenantId,
    site_url:         '',
    health_before:    0,
    health_after:     0,
    grade_before:     'F',
    grade_after:      'F',
    fixes_applied:    0,
    issues_resolved:  0,
    issues_remaining: 0,
    top_win:          '',
    generated_at:     new Date().toISOString(),
    error:            err instanceof Error ? err.message : String(err),
  };
}
