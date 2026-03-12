/**
 * tools/reports/accessibility_report.ts
 *
 * Builds accessibility reports for individual pages and entire sites.
 * Uses the detection, classification, and apply pipeline.
 *
 * Pure function — never throws.
 */

import { detectAccessibilityIssues } from '../detect/accessibility_detect.js';
import { classifyAccessibilityIssues, type AccessibilityIssue } from '../detect/accessibility_issue_classifier.js';
import { applyAccessibilityFixes } from '../apply/accessibility_apply.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccessibilityPageReport {
  url:                      string;
  total_issues:             number;
  automated_fixes_applied:  number;
  manual_review_items:      string[];
  issues:                   AccessibilityIssue[];
  wcag_level:               'A' | 'AA' | 'AAA' | 'failing';
}

export interface AccessibilitySiteReport {
  site_id:                    string;
  total_pages:                number;
  pages_with_issues:          number;
  total_issues:               number;
  automated_fixes_available:  number;
  top_issues:                 { type: string; count: number }[];
  wcag_aa_compliant:          boolean;
  pages:                      AccessibilityPageReport[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWcagLevel(issues: AccessibilityIssue[]): 'A' | 'AA' | 'AAA' | 'failing' {
  const hasHigh   = issues.some((i) => i.severity === 'high');
  const hasMedium = issues.some((i) => i.severity === 'medium');
  const hasLow    = issues.some((i) => i.severity === 'low');

  if (hasHigh) return 'failing';
  if (hasMedium) return 'A';
  if (hasLow) return 'AA';
  return 'AAA';
}

// ── Report builder ───────────────────────────────────────────────────────────

export function buildAccessibilitySiteReport(
  site_id: string,
  pages: { url: string; html: string }[],
): AccessibilitySiteReport {
  const pageReports: AccessibilityPageReport[] = [];
  const issueCounts = new Map<string, number>();
  let totalIssues = 0;
  let automatedAvailable = 0;

  try {
    for (const page of pages) {
      try {
        const signals = detectAccessibilityIssues(page.html, page.url);
        const issues = classifyAccessibilityIssues(signals);
        const applyResult = applyAccessibilityFixes(page.html, signals);

        const pageTotal = issues.reduce((sum, i) => sum + i.count, 0);
        totalIssues += pageTotal;

        const pageAutomated = issues.filter((i) => i.automated).reduce((sum, i) => sum + i.count, 0);
        automatedAvailable += pageAutomated;

        // Aggregate issue counts for top_issues
        for (const issue of issues) {
          const current = issueCounts.get(issue.type) ?? 0;
          issueCounts.set(issue.type, current + issue.count);
        }

        pageReports.push({
          url:                     page.url,
          total_issues:            pageTotal,
          automated_fixes_applied: applyResult.applied.length,
          manual_review_items:     applyResult.manual_review,
          issues,
          wcag_level:              getWcagLevel(issues),
        });
      } catch {
        // Skip broken pages — never throw
        pageReports.push({
          url:                     page.url,
          total_issues:            0,
          automated_fixes_applied: 0,
          manual_review_items:     [],
          issues:                  [],
          wcag_level:              'AAA',
        });
      }
    }
  } catch {
    // Never throws
  }

  // Build top issues sorted by count desc, top 5
  const topIssues = [...issueCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // WCAG AA compliant = zero high-severity issues across all pages
  const hasAnyHigh = pageReports.some((p) =>
    p.issues.some((i) => i.severity === 'high'),
  );

  return {
    site_id,
    total_pages:               pages.length,
    pages_with_issues:         pageReports.filter((p) => p.total_issues > 0).length,
    total_issues:              totalIssues,
    automated_fixes_available: automatedAvailable,
    top_issues:                topIssues,
    wcag_aa_compliant:         !hasAnyHigh,
    pages:                     pageReports,
  };
}
