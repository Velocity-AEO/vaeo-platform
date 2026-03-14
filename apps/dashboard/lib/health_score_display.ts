/**
 * apps/dashboard/lib/health_score_display.ts
 *
 * Display helpers for severity-weighted health score.
 * Never throws.
 */

import type { IssueSeverity } from '@tools/health/health_score_weights.js';

// ── Issue type labels ────────────────────────────────────────────────────────

const ISSUE_TYPE_LABELS: Record<string, string> = {
  TITLE_MISSING:     'Missing Title Tag',
  TITLE_LONG:        'Title Too Long',
  TITLE_SHORT:       'Title Too Short',
  META_DESC_MISSING: 'Missing Meta Description',
  META_DESC_LONG:    'Meta Description Too Long',
  SCHEMA_MISSING:    'Missing Schema Markup',
  SCHEMA_INVALID:    'Invalid Schema Markup',
  CANONICAL_MISSING: 'Missing Canonical Tag',
  CANONICAL_WRONG:   'Incorrect Canonical Tag',
  ROBOTS_NOINDEX:    'Noindex Directive',
  OG_MISSING:        'Missing Open Graph Tags',
  OG_TITLE:          'Missing OG Title',
  OG_DESC:           'Missing OG Description',
  HREFLANG_MISSING:  'Missing Hreflang Tags',
  HREFLANG_WRONG:    'Incorrect Hreflang Tags',
  ALT_MISSING:       'Missing Image Alt Text',
  SPEAKABLE_MISSING: 'Missing Speakable Schema',
  ORPHANED_PAGE:     'Orphaned Page',
};

export function formatIssueTypeLabel(issue_type: string): string {
  try {
    const key = (issue_type ?? '').toUpperCase();
    return ISSUE_TYPE_LABELS[key] ?? issue_type ?? '';
  } catch {
    return issue_type ?? '';
  }
}

// ── Severity badge colors ────────────────────────────────────────────────────

export function getSeverityBadgeColor(severity: IssueSeverity): string {
  try {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'high':     return 'bg-orange-100 text-orange-700';
      case 'medium':   return 'bg-yellow-100 text-yellow-700';
      case 'low':      return 'bg-gray-100 text-gray-600';
      default:         return 'bg-gray-100 text-gray-600';
    }
  } catch {
    return 'bg-gray-100 text-gray-600';
  }
}

// ── Score impact formatting ──────────────────────────────────────────────────

export function formatScoreImpact(impact: number): string {
  try {
    return `-${impact ?? 0} pts`;
  } catch {
    return '-0 pts';
  }
}
