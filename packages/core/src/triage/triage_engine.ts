/**
 * packages/core/triage/triage_engine.ts
 *
 * Triage engine — scores action_queue items and recommends deploy/skip/review.
 *
 * Scoring (0–100):
 *   URL value:    system URLs (/cart, /account, /checkout) → 0
 *   Issue weight:  critical severity issues score higher
 *   Page type:     /products/ and /collections/ score highest
 *   Policy/legal:  /pages/privacy-policy, /pages/terms → low priority (skip)
 *
 * Recommendations:
 *   score >= 65  → deploy
 *   score <= 35  → skip
 *   35 < score < 65 → review (AI escalation)
 *
 * Pure logic — all I/O goes through injectable deps.
 * Never throws — returns result objects with error fields on failure.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TriageItem {
  id:               string;
  issue_type:       string;
  url:              string;
  risk_score:       number;
  priority:         number;
  execution_status: string;
  proposed_fix:     Record<string, unknown>;
}

export type TriageRecommendation = 'deploy' | 'skip' | 'review';

export interface TriageResult {
  action_id:      string;
  score:          number;
  recommendation: TriageRecommendation;
  reason:         string;
  impact:         string;
  ai_reviewed:    boolean;
}

export interface TriageBatchResult {
  ok:      boolean;
  results: TriageResult[];
  summary: {
    total:    number;
    deploy:   number;
    skip:     number;
    review:   number;
    ai_escalations: number;
  };
  error?: string;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface TriageDeps {
  /** AI review for ambiguous items (score 35–65). Returns recommendation + reason. */
  aiReview: (item: TriageItem) => Promise<{
    recommendation: TriageRecommendation;
    reason:         string;
  }>;
}

// ── System URL detection ─────────────────────────────────────────────────────

const SYSTEM_PATHS = [
  '/cart',
  '/account',
  '/checkout',
  '/search',
  '/404',
  '/password',
  '/challenge',
  '/apps/',
  '/tools/',
];

export function isSystemUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return SYSTEM_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  } catch {
    // Relative URL — check directly
    const lower = url.toLowerCase();
    return SYSTEM_PATHS.some((p) => lower === p || lower.startsWith(p + '/'));
  }
}

// ── Low-value page detection ─────────────────────────────────────────────────

const SKIP_PATTERNS = [
  '/pages/privacy-policy',
  '/pages/privacy',
  '/pages/terms-of-service',
  '/pages/terms',
  '/pages/refund-policy',
  '/pages/shipping-policy',
  '/pages/cookie-policy',
  '/pages/disclaimer',
  '/pages/tos',
  '/policies/',
];

function isLowValuePage(url: string): boolean {
  const lower = url.toLowerCase();
  return SKIP_PATTERNS.some((p) => lower.includes(p));
}

// ── Page type scoring ────────────────────────────────────────────────────────

function pageTypeScore(url: string): number {
  const lower = url.toLowerCase();
  if (lower.includes('/products/'))    return 30;   // Highest value — revenue pages
  if (lower.includes('/collections/')) return 25;   // Category pages
  if (lower.includes('/pages/'))       return 15;   // Content pages
  if (lower.includes('/blogs/'))       return 12;   // Blog content
  // Homepage or root
  try {
    const pathname = new URL(url).pathname;
    if (pathname === '/' || pathname === '') return 28;
  } catch {
    if (url === '/' || url === '') return 28;
  }
  return 10; // Other
}

// ── Issue type scoring ───────────────────────────────────────────────────────

const ISSUE_WEIGHTS: Record<string, number> = {
  // Critical — high impact on SEO
  META_TITLE_MISSING:    25,
  title_missing:         25,
  H1_MISSING:            20,
  h1_missing:            20,
  CANONICAL_MISSING:     22,
  canonical_missing:     22,

  // Major — significant impact
  META_DESC_MISSING:     18,
  meta_missing:          18,
  SCHEMA_MISSING:        15,
  schema_missing:        15,
  META_TITLE_DUPLICATE:  12,
  title_duplicate:       12,
  META_DESC_DUPLICATE:   10,
  meta_duplicate:        10,
  H1_DUPLICATE:          10,
  h1_multiple:           10,

  // Minor — helpful but lower priority
  title_too_short:        8,
  title_too_long:         5,
  meta_too_short:         8,
  meta_too_long:          5,
  SCHEMA_INVALID_JSON:   12,
  CANONICAL_MISMATCH:    15,
  CANONICAL_RELATIVE:    10,

  // Errors
  ERR_404:               20,
  ERR_500:               22,
  ERR_REDIRECT_CHAIN:    15,
  ERR_REDIRECT_LOOP:     18,
};

function issueWeight(issueType: string): number {
  return ISSUE_WEIGHTS[issueType] ?? 10;
}

// ── Impact description ───────────────────────────────────────────────────────

function describeImpact(item: TriageItem, score: number): string {
  if (score === 0) return 'System URL — no SEO impact';
  const issueW = issueWeight(item.issue_type);
  if (issueW >= 20) return 'High SEO impact — directly affects search visibility';
  if (issueW >= 12) return 'Medium SEO impact — improves search relevance';
  return 'Low SEO impact — minor optimization';
}

// ── Core scoring ─────────────────────────────────────────────────────────────

/**
 * Score a single item. Pure function, no I/O.
 *
 * Score = pageTypeScore + issueWeight + riskBonus
 * Capped at 100, floored at 0.
 * System URLs always return 0.
 * Low-value pages are capped at 30.
 */
export function scoreItem(item: TriageItem): {
  score:  number;
  reason: string;
} {
  // System URLs — always 0, always skip
  if (isSystemUrl(item.url)) {
    return { score: 0, reason: 'System URL — not a routable page for SEO fixes' };
  }

  const pts = pageTypeScore(item.url);
  const iw  = issueWeight(item.issue_type);
  // Risk score (1-10) adds a small bonus for higher-risk items
  const riskBonus = Math.min(item.risk_score ?? 0, 10) * 2;

  let score = pts + iw + riskBonus;

  // Low-value legal/policy pages — cap score to ensure skip
  if (isLowValuePage(item.url)) {
    score = Math.min(score, 30);
    return {
      score,
      reason: `Low-value page (policy/legal) — capped score; ${item.issue_type} on ${item.url}`,
    };
  }

  score = Math.max(0, Math.min(100, score));

  const pageLabel = item.url.includes('/products/') ? 'product page'
    : item.url.includes('/collections/') ? 'collection page'
    : item.url.includes('/pages/') ? 'content page'
    : 'page';

  return {
    score,
    reason: `${item.issue_type} on ${pageLabel} — score ${score} (page: ${pts}, issue: ${iw}, risk: ${riskBonus})`,
  };
}

/**
 * Derive recommendation from score.
 */
export function recommend(score: number): TriageRecommendation {
  if (score >= 65) return 'deploy';
  if (score <= 35) return 'skip';
  return 'review';
}

// ── Single-item triage ───────────────────────────────────────────────────────

/**
 * Triage a single action_queue item.
 * If score falls in 35–65 (ambiguous), escalates to AI review via deps.
 * Never throws.
 */
export async function triageItem(
  item: TriageItem,
  deps: TriageDeps,
): Promise<TriageResult> {
  const { score, reason } = scoreItem(item);
  const rec = recommend(score);
  const impact = describeImpact(item, score);

  // If ambiguous, escalate to AI
  if (rec === 'review') {
    try {
      const ai = await deps.aiReview(item);
      return {
        action_id:      item.id,
        score,
        recommendation: ai.recommendation,
        reason:         `${reason} → AI: ${ai.reason}`,
        impact,
        ai_reviewed:    true,
      };
    } catch {
      // AI unavailable — keep as review
      return {
        action_id:      item.id,
        score,
        recommendation: 'review',
        reason:         `${reason} → AI review failed, manual review needed`,
        impact,
        ai_reviewed:    false,
      };
    }
  }

  return {
    action_id:      item.id,
    score,
    recommendation: rec,
    reason,
    impact,
    ai_reviewed:    false,
  };
}

// ── Batch triage ─────────────────────────────────────────────────────────────

/**
 * Triage a batch of action_queue items.
 * Never throws — returns result object with error field on failure.
 */
export async function triageBatch(
  items: TriageItem[],
  deps:  TriageDeps,
): Promise<TriageBatchResult> {
  try {
    const results: TriageResult[] = [];
    let deploy = 0, skip = 0, review = 0, aiEscalations = 0;

    for (const item of items) {
      const result = await triageItem(item, deps);
      results.push(result);

      switch (result.recommendation) {
        case 'deploy': deploy++; break;
        case 'skip':   skip++;   break;
        case 'review': review++; break;
      }
      if (result.ai_reviewed) aiEscalations++;
    }

    return {
      ok:      true,
      results,
      summary: {
        total:          items.length,
        deploy,
        skip,
        review,
        ai_escalations: aiEscalations,
      },
    };
  } catch (err) {
    return {
      ok:      false,
      results: [],
      summary: { total: 0, deploy: 0, skip: 0, review: 0, ai_escalations: 0 },
      error:   err instanceof Error ? err.message : String(err),
    };
  }
}
