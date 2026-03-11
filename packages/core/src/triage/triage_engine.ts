/**
 * packages/core/src/triage/triage_engine.ts
 *
 * SEO Triage Engine — scores action_queue items and recommends deploy/skip/review.
 *
 * Page type scores (0–100):
 *   /products/            → 90   highest-value revenue pages
 *   / (homepage)          → 85
 *   /collections/         → 80   category pages
 *   /blogs/ or /articles/ → 70   content
 *   /pages/               → 40   utility/content — review zone
 *   system URLs           → 0    (no SEO impact, always skip)
 *   other                 → 20   (low value, skip zone)
 *
 * Issue + page matrix (overrides score thresholds):
 *   META_TITLE_MISSING / META_DESC_MISSING on non-system → deploy
 *   SCHEMA_MISSING on /products/ or /collections/        → deploy
 *   SCHEMA_MISSING on /pages/                            → skip (AI may override)
 *   IMG_DIMENSIONS_MISSING on /products/                 → deploy
 *   IMG_DIMENSIONS_MISSING elsewhere                     → skip (hard — no AI)
 *   Any issue on system URL                              → score 0, skip, no AI
 *   Policy / legal pages                                 → hard skip, no AI
 *
 * AI escalation — call Claude only when:
 *   1. /pages/ + SCHEMA_MISSING
 *   2. META_TITLE_MISSING + title exists in tracer_field_snapshots
 *   3. triage_score in (35, 65) exclusive — and not a hard-skip case
 *
 * Score thresholds (when matrix / AI do not apply):
 *   score ≥ 65 → deploy
 *   score ≤ 35 → skip
 *   35 < score < 65 → review
 *
 * Pure logic — all I/O through injectable deps.
 * Never throws — returns result objects with error fields on failure.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TriageItem {
  id:                      string;
  issue_type:              string;
  url:                     string;
  risk_score:              number;
  priority:                number;
  execution_status:        string;
  proposed_fix:            Record<string, unknown>;
  /** Field snapshots captured before any changes (AI trigger #2). */
  tracer_field_snapshots?: Record<string, unknown>;
}

export type TriageRecommendation = 'deploy' | 'skip' | 'review';
export type TriageImpact        = 'high' | 'medium' | 'low' | 'none';

export interface TriageResult {
  item_id:        string;
  triage_score:   number;
  recommendation: TriageRecommendation;
  impact:         TriageImpact;
  reason:         string;
  ai_reviewed:    boolean;
}

export interface TriageBatchResult {
  ok:      boolean;
  results: TriageResult[];
  summary: {
    total:          number;
    deploy:         number;
    skip:           number;
    review:         number;
    ai_escalations: number;
  };
  error?: string;
}

// ── Injectable deps ───────────────────────────────────────────────────────────

export interface TracerObservation {
  url:              string;
  issue_type:       string;
  sandbox_status:   'tracer_observation';
  approval_status:  'observation';
  tracer_data:      TriageResult;
}

export interface TriageDeps {
  /**
   * AI review for escalated items.
   *
   * Prompt:
   *   "You are an SEO triage engine. Return JSON only, no markdown:
   *   { recommendation: deploy|skip|review, impact: high|medium|low|none, reason: one sentence }.
   *   URL: {url} Issue: {issue_type} Proposed fix: {proposed_fix}"
   */
  aiReview: (item: TriageItem) => Promise<{
    recommendation: TriageRecommendation;
    impact:         TriageImpact;
    reason:         string;
  }>;
  /**
   * Optional — write a tracer observation to the learning center.
   * Called after every triageItem with the full result.
   * Non-fatal: errors are swallowed.
   */
  writeLearning?: (obs: TracerObservation) => Promise<void>;
}

// ── System URL detection ──────────────────────────────────────────────────────

const SYSTEM_PATHS = [
  '/cart',
  '/account',
  '/checkout',
  '/search',
  '/customer_authentication',
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
    const lower = url.toLowerCase();
    return SYSTEM_PATHS.some((p) => lower === p || lower.startsWith(p + '/'));
  }
}

// ── Low-value / policy page detection ────────────────────────────────────────

const POLICY_PATTERNS = [
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

function isPolicyPage(url: string): boolean {
  const lower = url.toLowerCase();
  return POLICY_PATTERNS.some((p) => lower.includes(p));
}

// ── Page type score ───────────────────────────────────────────────────────────

export function pageTypeScore(url: string): number {
  if (isSystemUrl(url)) return 0;
  const lower = url.toLowerCase();
  if (lower.includes('/products/'))                               return 90;
  if (lower.includes('/collections/'))                            return 80;
  if (lower.includes('/blogs/') || lower.includes('/articles/')) return 70;
  if (lower.includes('/pages/'))                                  return 40;
  try {
    const pathname = new URL(url).pathname;
    if (pathname === '/' || pathname === '') return 85;
  } catch {
    if (url === '/' || url === '') return 85;
  }
  return 20;
}

// ── scoreItem — pure score (page type only) ───────────────────────────────────

/**
 * Score a single item. Pure function, no I/O.
 * Returns triage_score (page type score) and a reason string.
 * System URLs always return score 0.
 */
export function scoreItem(item: TriageItem): { triage_score: number; reason: string } {
  if (isSystemUrl(item.url)) {
    return { triage_score: 0, reason: 'System URL — no SEO impact' };
  }

  const triage_score = pageTypeScore(item.url);

  const pageLabel = item.url.includes('/products/')    ? 'product page'
    : item.url.includes('/collections/') ? 'collection page'
    : item.url.includes('/blogs/')        ? 'blog page'
    : item.url.includes('/articles/')     ? 'article page'
    : item.url.includes('/pages/')        ? 'content page'
    : 'page';

  return {
    triage_score,
    reason: `${item.issue_type} on ${pageLabel} — score ${triage_score}`,
  };
}

// ── Recommendation from score ─────────────────────────────────────────────────

export function recommend(score: number): TriageRecommendation {
  if (score >= 65) return 'deploy';
  if (score <= 35) return 'skip';
  return 'review';
}

// ── Impact from score ─────────────────────────────────────────────────────────

function scoreToImpact(score: number): TriageImpact {
  if (score === 0)  return 'none';
  if (score >= 70)  return 'high';
  if (score >= 40)  return 'medium';
  return 'low';
}

// ── Issue type helpers ────────────────────────────────────────────────────────

function isMetaTitleIssue(issueType: string): boolean {
  const t = issueType.toUpperCase();
  return t === 'META_TITLE_MISSING' || t === 'TITLE_MISSING';
}

function isMetaDescIssue(issueType: string): boolean {
  const t = issueType.toUpperCase();
  return t === 'META_DESC_MISSING' || t === 'META_MISSING';
}

function isSchemaIssue(issueType: string): boolean {
  return issueType.toUpperCase() === 'SCHEMA_MISSING';
}

function isImgDimensionsIssue(issueType: string): boolean {
  const t = issueType.toUpperCase();
  return t === 'IMG_DIMENSIONS_MISSING' || t === 'IMAGE_MISSING_DIMENSIONS';
}

// ── Matrix ────────────────────────────────────────────────────────────────────

type MatrixDecision =
  | { kind: 'deploy'; hard: false }
  | { kind: 'skip';   hard: boolean }
  | null;

function applyMatrix(issueType: string, url: string): MatrixDecision {
  const lower       = url.toLowerCase();
  const isProducts  = lower.includes('/products/');
  const isCollections = lower.includes('/collections/');
  const isPages     = lower.includes('/pages/');

  // META_TITLE_MISSING / META_DESC_MISSING → deploy on any non-system page
  if (isMetaTitleIssue(issueType) || isMetaDescIssue(issueType)) {
    return { kind: 'deploy', hard: false };
  }

  // SCHEMA_MISSING
  if (isSchemaIssue(issueType)) {
    if (isProducts || isCollections) return { kind: 'deploy', hard: false };
    if (isPages) return { kind: 'skip', hard: false }; // soft — AI trigger #1 may override
  }

  // IMG_DIMENSIONS_MISSING
  if (isImgDimensionsIssue(issueType)) {
    if (isProducts) return { kind: 'deploy', hard: false };
    return { kind: 'skip', hard: true }; // hard — no AI escalation
  }

  return null;
}

// ── AI escalation check ───────────────────────────────────────────────────────

function shouldEscalateToAI(
  item:   TriageItem,
  score:  number,
  matrix: MatrixDecision,
): boolean {
  // Hard skip cases: no AI, period
  if (matrix?.hard === true) return false;

  const lower   = item.url.toLowerCase();
  const isPages = lower.includes('/pages/');

  // Trigger 1: /pages/ + SCHEMA_MISSING (AI may override matrix skip)
  if (isPages && isSchemaIssue(item.issue_type)) return true;

  // Trigger 2: META_TITLE_MISSING + title exists in tracer_field_snapshots
  if (isMetaTitleIssue(item.issue_type)) {
    const snaps = item.tracer_field_snapshots ?? {};
    if (snaps['title'] || snaps['meta_title']) return true;
  }

  // Trigger 3: ambiguous score band
  if (score > 35 && score < 65) return true;

  return false;
}

// ── Single-item triage ────────────────────────────────────────────────────────

/** Core triage logic (no observation write). */
async function triageItemCore(
  item: TriageItem,
  deps: TriageDeps,
): Promise<TriageResult> {
  // 1. System URL — hard skip, no AI
  if (isSystemUrl(item.url)) {
    return {
      item_id:        item.id,
      triage_score:   0,
      recommendation: 'skip',
      impact:         'none',
      reason:         'System URL — no SEO impact; skip always',
      ai_reviewed:    false,
    };
  }

  // 2. Policy / legal page — hard skip, no AI
  if (isPolicyPage(item.url)) {
    return {
      item_id:        item.id,
      triage_score:   pageTypeScore(item.url),
      recommendation: 'skip',
      impact:         'low',
      reason:         `Policy/legal page — low SEO value; skip (${item.issue_type})`,
      ai_reviewed:    false,
    };
  }

  const score  = pageTypeScore(item.url);
  const matrix = applyMatrix(item.issue_type, item.url);
  const impact = scoreToImpact(score);

  // 3. AI escalation
  if (shouldEscalateToAI(item, score, matrix)) {
    try {
      const ai = await deps.aiReview(item);
      return {
        item_id:        item.id,
        triage_score:   score,
        recommendation: ai.recommendation,
        impact:         ai.impact,
        reason:         ai.reason,
        ai_reviewed:    true,
      };
    } catch {
      // AI unavailable — fall through to matrix / score, keep as review
      const fallbackRec = matrix
        ? (matrix.kind === 'deploy' ? 'deploy' : 'review')
        : (score > 35 && score < 65 ? 'review' : recommend(score));
      return {
        item_id:        item.id,
        triage_score:   score,
        recommendation: fallbackRec,
        impact,
        reason:         `${item.issue_type} — AI review failed, manual review needed`,
        ai_reviewed:    false,
      };
    }
  }

  // 4. Matrix decision (no AI trigger)
  if (matrix) {
    const reason = matrix.kind === 'deploy'
      ? `${item.issue_type} on high-value page — auto-deploy`
      : `${item.issue_type} on low-priority page — skip`;
    return {
      item_id:        item.id,
      triage_score:   score,
      recommendation: matrix.kind,
      impact,
      reason,
      ai_reviewed:    false,
    };
  }

  // 5. Score-based fallback
  const rec = recommend(score);
  return {
    item_id:        item.id,
    triage_score:   score,
    recommendation: rec,
    impact,
    reason:         `${item.issue_type} on page (score ${score}) → ${rec}`,
    ai_reviewed:    false,
  };
}

/**
 * Triage a single action_queue item.
 * Applies matrix rules, escalates to AI when needed.
 * Writes a tracer observation to the learning center (non-fatal).
 * Never throws.
 */
export async function triageItem(
  item: TriageItem,
  deps: TriageDeps,
): Promise<TriageResult> {
  const result = await triageItemCore(item, deps);

  // Write tracer observation — non-fatal
  if (deps.writeLearning) {
    try {
      await deps.writeLearning({
        url:             item.url,
        issue_type:      item.issue_type,
        sandbox_status:  'tracer_observation',
        approval_status: 'observation',
        tracer_data:     result,
      });
    } catch { /* non-fatal */ }
  }

  return result;
}

// ── Batch triage ──────────────────────────────────────────────────────────────

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
      summary: { total: items.length, deploy, skip, review, ai_escalations: aiEscalations },
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
