/**
 * tools/scoring/health_score.ts
 *
 * Calculates a 0–100 health score from classified issues.
 * Supports both legacy equal-weight and new severity-weighted algorithms.
 * Pure logic + injectable deps for persistence.
 */

import type { IssueReport, Severity } from './issue_classifier.js';
import { getIssueWeight, type IssueSeverity } from '../health/health_score_weights.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreBreakdownEntry {
  issue_type:   string;
  severity:     IssueSeverity;
  score_impact: number;
  count:        number;
  total_impact: number;
}

export interface HealthScore {
  score:             number;   // 0–100
  grade:             Grade;
  total_issues:      number;
  issues_by_severity: Record<Severity, number>;
  breakdown:         string[];
  score_breakdown?:        ScoreBreakdownEntry[];
  most_impactful_issue?:   string | null;
  critical_issue_count?:   number;
  high_issue_count?:       number;
  medium_issue_count?:     number;
  low_issue_count?:        number;
}

export interface HealthScoreDeps {
  /** Persist the health score to the sites table. */
  updateSiteScore: (siteId: string, score: HealthScore) => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Scaling factor controls how aggressively deductions reduce the score.
 * Score = 100 - (totalPoints / totalUrls) * SCALING_FACTOR
 *
 * With SCALING_FACTOR=10 and 5 deducted points across 10 URLs:
 *   100 - (5 / 10) * 10 = 95
 */
const SCALING_FACTOR = 10;

// ── Grade thresholds ─────────────────────────────────────────────────────────

function toGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// ── Breakdown generator ──────────────────────────────────────────────────────

function buildBreakdown(issues: IssueReport[]): string[] {
  // Group by issue_type and count
  const counts = new Map<string, number>();
  for (const issue of issues) {
    counts.set(issue.issue_type, (counts.get(issue.issue_type) ?? 0) + 1);
  }

  const lines: string[] = [];
  // Sort by count desc for readability
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    lines.push(`${type}: ${count} issue${count === 1 ? '' : 's'}`);
  }
  return lines;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Calculate a health score from classified issues.
 *
 * Score = 100 - (totalPointsDeducted / totalUrls) * SCALING_FACTOR
 * Floored at 0, capped at 100.
 */
export function calculateHealthScore(
  issues: IssueReport[],
  total_urls: number,
): HealthScore {
  const safeTotal = Math.max(total_urls, 1); // avoid division by zero

  const totalPoints = issues.reduce((sum, i) => sum + i.points_deducted, 0);
  const raw = 100 - (totalPoints / safeTotal) * SCALING_FACTOR;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const issues_by_severity: Record<Severity, number> = {
    critical: 0,
    major:    0,
    minor:    0,
  };
  for (const issue of issues) {
    issues_by_severity[issue.severity]++;
  }

  return {
    score,
    grade:        toGrade(score),
    total_issues: issues.length,
    issues_by_severity,
    breakdown:    buildBreakdown(issues),
  };
}

/**
 * Calculate and persist a site's health score.
 */
export async function updateSiteHealthScore(
  siteId: string,
  score: HealthScore,
  deps: HealthScoreDeps,
): Promise<void> {
  await deps.updateSiteScore(siteId, score);
}

// ── Severity-weighted scoring ────────────────────────────────────────────────

/**
 * Calculate a severity-weighted health score.
 * Starts at 100, subtracts score_impact per open issue.
 * Only counts open issues (status !== 'applied').
 * Floors at 0.
 */
export function calculateWeightedHealthScore(
  issues: Array<{ issue_type: string; status: string }>,
): number {
  try {
    if (!Array.isArray(issues)) return 100;
    const open = issues.filter(i => i?.status !== 'applied');
    let score = 100;
    for (const issue of open) {
      const profile = getIssueWeight(issue.issue_type);
      score -= profile.score_impact;
    }
    return Math.max(0, Math.round(score));
  } catch {
    return 100;
  }
}

/**
 * Build a breakdown of score impact grouped by issue_type.
 * Sorted by total_impact descending.
 */
export function buildScoreBreakdown(
  issues: Array<{ issue_type: string; status: string }>,
): ScoreBreakdownEntry[] {
  try {
    if (!Array.isArray(issues)) return [];
    const open = issues.filter(i => i?.status !== 'applied');
    const groups = new Map<string, { count: number; severity: IssueSeverity; score_impact: number }>();

    for (const issue of open) {
      const profile = getIssueWeight(issue.issue_type);
      const key = (issue.issue_type ?? '').toUpperCase();
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, { count: 1, severity: profile.severity, score_impact: profile.score_impact });
      }
    }

    const entries: ScoreBreakdownEntry[] = [];
    for (const [issue_type, data] of groups) {
      entries.push({
        issue_type,
        severity:     data.severity,
        score_impact: data.score_impact,
        count:        data.count,
        total_impact: data.score_impact * data.count,
      });
    }

    return entries.sort((a, b) => b.total_impact - a.total_impact);
  } catch {
    return [];
  }
}

/**
 * Returns the issue_type with the highest total_impact.
 */
export function getMostImpactfulIssue(
  breakdown: ScoreBreakdownEntry[],
): string | null {
  try {
    if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
    return breakdown[0].issue_type;
  } catch {
    return null;
  }
}
