/**
 * tools/scoring/health_score.ts
 *
 * Calculates a 0–100 health score from classified issues.
 * Pure logic + injectable deps for persistence.
 */

import type { IssueReport, Severity } from './issue_classifier.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthScore {
  score:             number;   // 0–100
  grade:             Grade;
  total_issues:      number;
  issues_by_severity: Record<Severity, number>;
  breakdown:         string[];
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
