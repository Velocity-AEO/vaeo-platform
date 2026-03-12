/**
 * tools/live/issue_aggregator.ts
 *
 * Aggregates detected issues across crawled pages for a live run.
 * Uses deterministic simulation to produce repeatable results.
 *
 * Never throws.
 */

import type { DiscoveredPage } from './page_discovery.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AggregatedIssue {
  issue_id:         string;
  site_id:          string;
  url:              string;
  fix_type:         string;
  severity:         'critical' | 'high' | 'medium' | 'low';
  title:            string;
  description:      string;
  detected_value?:  string;
  suggested_value?: string;
  auto_fixable:     boolean;
  confidence:       number;
  detected_at:      string;
}

export interface IssueAggregation {
  site_id:              string;
  run_id:               string;
  total_issues:         number;
  by_severity:          Record<string, number>;
  by_fix_type:          Record<string, number>;
  auto_fixable_count:   number;
  requires_review_count: number;
  issues:               AggregatedIssue[];
  aggregated_at:        string;
}

// ── Severity mapping ─────────────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, AggregatedIssue['severity']> = {
  title_missing:            'critical',
  meta_description_missing: 'high',
  schema_missing:           'high',
  image_alt_missing:        'medium',
  canonical_missing:        'medium',
  lang_missing:             'low',
};

const AUTO_FIXABLE_TYPES = new Set([
  'title_missing',
  'meta_description_missing',
  'schema_missing',
  'image_alt_missing',
  'canonical_missing',
  'lang_missing',
]);

const TITLE_MAP: Record<string, string> = {
  title_missing:            'Missing page title',
  meta_description_missing: 'Missing meta description',
  schema_missing:           'Missing structured data',
  image_alt_missing:        'Image missing alt text',
  canonical_missing:        'Missing canonical URL',
  lang_missing:             'Missing lang attribute',
};

const DESCRIPTION_MAP: Record<string, string> = {
  title_missing:            'Page is missing a <title> tag, which hurts search visibility.',
  meta_description_missing: 'Page has no meta description, reducing click-through rate.',
  schema_missing:           'No structured data found, limiting rich result eligibility.',
  image_alt_missing:        'One or more images lack alt text, impacting accessibility and SEO.',
  canonical_missing:        'No canonical URL specified, risking duplicate content issues.',
  lang_missing:             'HTML element is missing lang attribute, hurting accessibility.',
};

// ── Deterministic hash ───────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h);
}

// ── UUID generator ───────────────────────────────────────────────────────────

function generateIssueId(): string {
  return `iss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Build issue ──────────────────────────────────────────────────────────────

export function buildIssueFromPage(
  page: DiscoveredPage,
  site_id: string,
  fix_type: string,
): AggregatedIssue {
  try {
    const severity = SEVERITY_MAP[fix_type] ?? 'low';
    const auto_fixable = AUTO_FIXABLE_TYPES.has(fix_type);
    const confidence = (severity === 'critical' || severity === 'high') ? 0.9 : 0.75;

    return {
      issue_id:       generateIssueId(),
      site_id,
      url:            page.url,
      fix_type,
      severity,
      title:          TITLE_MAP[fix_type] ?? `Issue: ${fix_type}`,
      description:    DESCRIPTION_MAP[fix_type] ?? `Detected issue: ${fix_type}`,
      auto_fixable,
      confidence,
      detected_at:    new Date().toISOString(),
    };
  } catch {
    return {
      issue_id:    'iss_error',
      site_id,
      url:         page.url,
      fix_type,
      severity:    'low',
      title:       `Issue: ${fix_type}`,
      description: `Detected issue: ${fix_type}`,
      auto_fixable: false,
      confidence:  0,
      detected_at: new Date().toISOString(),
    };
  }
}

// ── Aggregate ────────────────────────────────────────────────────────────────

export function aggregateIssues(
  site_id: string,
  run_id: string,
  pages: DiscoveredPage[],
  fix_types: string[],
): IssueAggregation {
  try {
    const issues: AggregatedIssue[] = [];

    for (const page of pages) {
      for (const fix_type of fix_types) {
        // Deterministic: issue exists if simHash(url + fix_type) % 10 < 6
        const hash = simHash(page.url + fix_type);
        if (hash % 10 < 6) {
          issues.push(buildIssueFromPage(page, site_id, fix_type));
        }
      }
    }

    const by_severity: Record<string, number> = {};
    const by_fix_type: Record<string, number> = {};
    let auto_fixable_count = 0;
    let requires_review_count = 0;

    for (const issue of issues) {
      by_severity[issue.severity] = (by_severity[issue.severity] ?? 0) + 1;
      by_fix_type[issue.fix_type] = (by_fix_type[issue.fix_type] ?? 0) + 1;
      if (issue.auto_fixable) {
        auto_fixable_count++;
      } else {
        requires_review_count++;
      }
    }

    return {
      site_id,
      run_id,
      total_issues:   issues.length,
      by_severity,
      by_fix_type,
      auto_fixable_count,
      requires_review_count,
      issues,
      aggregated_at:  new Date().toISOString(),
    };
  } catch {
    return {
      site_id,
      run_id,
      total_issues:         0,
      by_severity:          {},
      by_fix_type:          {},
      auto_fixable_count:   0,
      requires_review_count: 0,
      issues:               [],
      aggregated_at:        new Date().toISOString(),
    };
  }
}
