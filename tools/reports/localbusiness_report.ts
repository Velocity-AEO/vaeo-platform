/**
 * tools/reports/localbusiness_report.ts
 *
 * Aggregates local business detection results across site pages
 * into a site-level LocalBusiness SEO report.
 *
 * Pure function. Never throws.
 */

import { detectLocalBusinessSignals } from '../detect/localbusiness_detect.js';
import { extractLocalBusinessDataFromHtml, type LocalBusinessData } from '../schema/localbusiness_schema_generator.js';
import { classifyLocalBusinessIssues, type LocalBusinessIssue } from '../detect/localbusiness_issue_classifier.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalBusinessPageReport {
  url:                      string;
  is_local_business_page:   boolean;
  has_localbusiness_schema: boolean;
  issues:                   LocalBusinessIssue[];
  local_data:               LocalBusinessData;
  schema_generated:         boolean;
}

export interface LocalBusinessSiteReport {
  site_id:              string;
  total_local_pages:    number;
  pages_with_schema:    number;
  pages_missing_schema: number;
  schema_coverage_pct:  number;
  nap_consistent:       boolean;
  top_issues:           { type: string; count: number }[];
  pages:                LocalBusinessPageReport[];
}

// ── Main function ─────────────────────────────────────────────────────────────

export function buildLocalBusinessSiteReport(
  site_id: string,
  pages:   { url: string; html: string }[],
): LocalBusinessSiteReport {
  const pageReports: LocalBusinessPageReport[] = [];

  for (const page of pages) {
    try {
      const signals    = detectLocalBusinessSignals(page.html, page.url);
      const localData  = extractLocalBusinessDataFromHtml(page.html, signals);
      const issues     = signals.is_local_business_page
        ? classifyLocalBusinessIssues(signals, page.html, page.url)
        : [];

      pageReports.push({
        url:                      page.url,
        is_local_business_page:   signals.is_local_business_page,
        has_localbusiness_schema: signals.has_localbusiness_schema,
        issues,
        local_data:               localData,
        schema_generated:         false,
      });
    } catch {
      pageReports.push({
        url:                      page.url,
        is_local_business_page:   false,
        has_localbusiness_schema: false,
        issues:                   [],
        local_data:               {},
        schema_generated:         false,
      });
    }
  }

  // Stats: only count local business pages
  const localPages    = pageReports.filter((p) => p.is_local_business_page);
  const total         = localPages.length;
  const withSchema    = localPages.filter((p) => p.has_localbusiness_schema).length;
  const missingSchema = total - withSchema;
  const coveragePct   = total > 0 ? Math.round((withSchema / total) * 100) : 0;

  // NAP consistent = no nap_inconsistency issues across all pages
  const napConsistent = !localPages.some((p) =>
    p.issues.some((i) => i.type === 'nap_inconsistency'),
  );

  // Top issues
  const issueCounts = new Map<string, number>();
  for (const page of localPages) {
    for (const issue of page.issues) {
      issueCounts.set(issue.type, (issueCounts.get(issue.type) ?? 0) + 1);
    }
  }
  const topIssues = [...issueCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    site_id,
    total_local_pages:    total,
    pages_with_schema:    withSchema,
    pages_missing_schema: missingSchema,
    schema_coverage_pct:  coveragePct,
    nap_consistent:       napConsistent,
    top_issues:           topIssues,
    pages:                pageReports,
  };
}
