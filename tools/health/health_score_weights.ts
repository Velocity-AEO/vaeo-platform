/**
 * tools/health/health_score_weights.ts
 *
 * Severity-weighted matrix for health score calculation.
 * A missing title tag hurts more than a missing alt tag.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IssueWeightProfile {
  issue_type:   string;
  severity:     IssueSeverity;
  weight:       number;
  score_impact: number;
  description:  string;
}

// ── Weight Matrix ────────────────────────────────────────────────────────────

export const ISSUE_WEIGHT_MATRIX: Record<string, IssueWeightProfile> = {
  // Critical — weight: 10, score_impact: 15
  TITLE_MISSING: {
    issue_type: 'TITLE_MISSING',
    severity: 'critical',
    weight: 10,
    score_impact: 15,
    description: 'Missing title tag — severe ranking impact',
  },
  ROBOTS_NOINDEX: {
    issue_type: 'ROBOTS_NOINDEX',
    severity: 'critical',
    weight: 10,
    score_impact: 15,
    description: 'Noindex directive — page not in search index',
  },
  CANONICAL_WRONG: {
    issue_type: 'CANONICAL_WRONG',
    severity: 'critical',
    weight: 10,
    score_impact: 15,
    description: 'Wrong canonical — duplicate content signal',
  },

  // High — weight: 7, score_impact: 10
  TITLE_LONG: {
    issue_type: 'TITLE_LONG',
    severity: 'high',
    weight: 7,
    score_impact: 10,
    description: 'Suboptimal title length — ranking impact',
  },
  TITLE_SHORT: {
    issue_type: 'TITLE_SHORT',
    severity: 'high',
    weight: 7,
    score_impact: 10,
    description: 'Suboptimal title length — ranking impact',
  },
  META_DESC_MISSING: {
    issue_type: 'META_DESC_MISSING',
    severity: 'high',
    weight: 7,
    score_impact: 10,
    description: 'Missing meta description — CTR impact',
  },
  SCHEMA_MISSING: {
    issue_type: 'SCHEMA_MISSING',
    severity: 'high',
    weight: 7,
    score_impact: 10,
    description: 'Missing schema — rich result ineligible',
  },
  SCHEMA_INVALID: {
    issue_type: 'SCHEMA_INVALID',
    severity: 'high',
    weight: 7,
    score_impact: 10,
    description: 'Invalid schema — rich result disqualified',
  },
  CANONICAL_MISSING: {
    issue_type: 'CANONICAL_MISSING',
    severity: 'high',
    weight: 7,
    score_impact: 10,
    description: 'Missing canonical — indexing ambiguity',
  },

  // Medium — weight: 4, score_impact: 5
  META_DESC_LONG: {
    issue_type: 'META_DESC_LONG',
    severity: 'medium',
    weight: 4,
    score_impact: 5,
    description: 'Meta description truncated in SERPs',
  },
  OG_MISSING: {
    issue_type: 'OG_MISSING',
    severity: 'medium',
    weight: 4,
    score_impact: 5,
    description: 'Missing OG tags — poor social sharing',
  },
  OG_TITLE: {
    issue_type: 'OG_TITLE',
    severity: 'medium',
    weight: 4,
    score_impact: 5,
    description: 'Incomplete OG data — social impact',
  },
  OG_DESC: {
    issue_type: 'OG_DESC',
    severity: 'medium',
    weight: 4,
    score_impact: 5,
    description: 'Incomplete OG data — social impact',
  },
  HREFLANG_MISSING: {
    issue_type: 'HREFLANG_MISSING',
    severity: 'medium',
    weight: 4,
    score_impact: 5,
    description: 'Hreflang issues — international SEO impact',
  },
  HREFLANG_WRONG: {
    issue_type: 'HREFLANG_WRONG',
    severity: 'medium',
    weight: 4,
    score_impact: 5,
    description: 'Hreflang issues — international SEO impact',
  },

  // Low — weight: 1, score_impact: 2
  ALT_MISSING: {
    issue_type: 'ALT_MISSING',
    severity: 'low',
    weight: 1,
    score_impact: 2,
    description: 'Missing alt text — accessibility and image SEO impact',
  },
  SPEAKABLE_MISSING: {
    issue_type: 'SPEAKABLE_MISSING',
    severity: 'low',
    weight: 1,
    score_impact: 2,
    description: 'Missing speakable schema — AEO impact',
  },
  ORPHANED_PAGE: {
    issue_type: 'ORPHANED_PAGE',
    severity: 'low',
    weight: 1,
    score_impact: 2,
    description: 'Page has no internal links',
  },
};

// ── Default profile ──────────────────────────────────────────────────────────

export const DEFAULT_WEIGHT_PROFILE: IssueWeightProfile = {
  issue_type:   'UNKNOWN',
  severity:     'high',
  weight:       5,
  score_impact: 8,
  description:  'Unknown issue type — default severity',
};

// ── Functions ────────────────────────────────────────────────────────────────

export function getIssueWeight(issue_type: string): IssueWeightProfile {
  try {
    const key = (issue_type ?? '').toUpperCase();
    return ISSUE_WEIGHT_MATRIX[key] ?? { ...DEFAULT_WEIGHT_PROFILE, issue_type: key || 'UNKNOWN' };
  } catch {
    return { ...DEFAULT_WEIGHT_PROFILE };
  }
}

export function getIssueSeverity(issue_type: string): IssueSeverity {
  try {
    return getIssueWeight(issue_type).severity;
  } catch {
    return 'high';
  }
}

export function getTotalPossibleScore(issue_types_on_page: string[]): number {
  try {
    if (!Array.isArray(issue_types_on_page)) return 0;
    return issue_types_on_page.reduce((sum, t) => sum + getIssueWeight(t).score_impact, 0);
  } catch {
    return 0;
  }
}
