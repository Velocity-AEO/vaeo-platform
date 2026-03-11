/**
 * tools/tracer/priority_scorer.ts
 *
 * Scores issue priority using base severity, traffic data, and change signals.
 * Pure functions — no I/O.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriorityFactors {
  url:                  string;
  issue_type:           string;
  base_severity:        number;
  traffic_multiplier:   number;
  recency_multiplier:   number;
  change_multiplier:    number;
  final_score:          number;
  priority_tier:        'critical' | 'high' | 'medium' | 'low';
}

export interface IssueInput {
  url:        string;
  issue_type: string;
  severity?:  number;
}

export interface PriorityContext {
  gsc_clicks?:      number;
  gsc_impressions?: number;
  is_new_issue?:    boolean;
  is_worsened?:     boolean;
  page_type?:       string;
}

// ── Severity map ──────────────────────────────────────────────────────────────

const BASE_SEVERITY: Record<string, number> = {
  SCHEMA_MISSING:         10,
  META_TITLE_MISSING:     9,
  TITLE_MISSING:          9,
  META_DESC_MISSING:      8,
  META_MISSING:           8,
  DEFER_SCRIPT:           7,
  LAZY_IMAGE:             5,
  FONT_DISPLAY:           4,
  IMG_DIMENSIONS_MISSING: 5,
};

// ── Scoring ───────────────────────────────────────────────────────────────────

function trafficMultiplier(clicks?: number): number {
  if (clicks == null) return 1.0;
  if (clicks > 1000)  return 2.0;
  if (clicks > 100)   return 1.5;
  if (clicks > 10)    return 1.2;
  return 1.0;
}

function recencyMultiplier(isNew?: boolean, isWorsened?: boolean): number {
  if (isNew)      return 1.3;
  if (isWorsened) return 1.2;
  return 1.0;
}

function tierFromScore(score: number): PriorityFactors['priority_tier'] {
  if (score > 15) return 'critical';
  if (score > 10) return 'high';
  if (score > 6)  return 'medium';
  return 'low';
}

/**
 * Score a single issue's priority.
 */
export function scoreIssuePriority(
  issue:   IssueInput,
  factors: PriorityContext = {},
): PriorityFactors {
  const base    = issue.severity ?? BASE_SEVERITY[issue.issue_type.toUpperCase()] ?? 5;
  const traffic = trafficMultiplier(factors.gsc_clicks);
  const recency = recencyMultiplier(factors.is_new_issue, factors.is_worsened);
  const change  = (factors.is_new_issue || factors.is_worsened) ? 1.0 : 1.0; // reserved for future
  const final   = base * traffic * recency * change;

  return {
    url:                issue.url,
    issue_type:         issue.issue_type,
    base_severity:      base,
    traffic_multiplier: traffic,
    recency_multiplier: recency,
    change_multiplier:  change,
    final_score:        Math.round(final * 100) / 100,
    priority_tier:      tierFromScore(final),
  };
}

/**
 * Rank a list of issues by priority score descending.
 */
export function rankIssues(
  issues:     IssueInput[],
  factorsMap: Map<string, PriorityContext>,
): PriorityFactors[] {
  const scored = issues.map((issue) => {
    const key     = `${issue.url}::${issue.issue_type}`;
    const context = factorsMap.get(key) ?? factorsMap.get(issue.url) ?? {};
    return scoreIssuePriority(issue, context);
  });

  scored.sort((a, b) => b.final_score - a.final_score);
  return scored;
}
