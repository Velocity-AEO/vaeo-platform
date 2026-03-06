/**
 * packages/risk-scorer/src/index.ts
 *
 * Risk scorer for Velocity AEO.
 *
 * Takes every DetectedIssue and produces a ScoredIssue with a final
 * risk_score (1–10), deployment constraints, and fix provenance.
 *
 * Scoring pipeline (applied in order):
 *   1. Look up base score from SCORE_MATRIX. Unknown types → 5.
 *   2. Infer fix_source from proposed_fix.action (AI / manual / auto).
 *   3. fix_source='ai_suggested'  → +1 (reflects generation uncertainty).
 *   4. Batch spans ≥50 unique URLs → +2 to all issues (bulk-operation guard).
 *   5. Cap at 10.
 *   6. Derive approval_required: matrix value, OR forced true for AI-suggested
 *      and for risk_score ≥ 7 (high / critical always require explicit sign-off).
 *   7. auto_deploy = score ≤ 3 AND !approval_required.
 *   8. Map score to DEPLOYMENT_BEHAVIOR band string.
 *
 * ActionLog: stage='risk-scorer:complete' with counts per band and
 * total requiring approval.
 */

import type { CmsType } from '../../core/types.js';
import type { DetectedIssue } from '../../detectors/src/index.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Fix source ────────────────────────────────────────────────────────────────

export type FixSource = 'auto_generated' | 'ai_suggested' | 'manual';

// ── ScoredIssue ───────────────────────────────────────────────────────────────

/** DetectedIssue with final risk score, deployment constraints, and fix provenance. */
export interface ScoredIssue extends DetectedIssue {
  /** Final risk score after all modifiers, capped at 10. Overrides detector default. */
  risk_score:          number;
  /** True when a human must approve before the fix is applied. */
  approval_required:   boolean;
  /** True only when risk_score ≤ 3 and approval is not required. */
  auto_deploy:         boolean;
  /** How the proposed fix was or will be generated. */
  fix_source:          FixSource;
  /** Human-readable deployment constraint description. */
  deployment_behavior: string;
}

// ── Score matrix ──────────────────────────────────────────────────────────────

interface MatrixEntry {
  risk_score:        number;
  approval_required: boolean;
}

/**
 * Base risk scores and approval requirements per issue type.
 * Define here — never inline in scoring logic.
 * Any issue_type not present defaults to risk_score=5, approval_required=true.
 */
export const SCORE_MATRIX: Readonly<Record<string, MatrixEntry>> = {
  ERR_404:                  { risk_score: 8,  approval_required: true  },
  ERR_500:                  { risk_score: 10, approval_required: true  },
  ERR_REDIRECT_CHAIN:       { risk_score: 5,  approval_required: false },
  ERR_BROKEN_INTERNAL_LINK: { risk_score: 4,  approval_required: false },
  META_TITLE_MISSING:       { risk_score: 3,  approval_required: false },
  META_TITLE_LONG:          { risk_score: 2,  approval_required: false },
  META_TITLE_DUPLICATE:     { risk_score: 3,  approval_required: false },
  META_DESC_MISSING:        { risk_score: 2,  approval_required: false },
  META_DESC_LONG:           { risk_score: 2,  approval_required: false },
  META_DESC_DUPLICATE:      { risk_score: 3,  approval_required: false },
  H1_MISSING:               { risk_score: 4,  approval_required: false },
  H1_DUPLICATE:             { risk_score: 5,  approval_required: false },
  H2_MISSING:               { risk_score: 3,  approval_required: false },
  H2_DUPLICATE:             { risk_score: 3,  approval_required: false },
  IMG_SIZE_LARGE:           { risk_score: 3,  approval_required: false },
  IMG_ALT_MISSING:          { risk_score: 2,  approval_required: false },
  IMG_LCP_OVERSIZED:        { risk_score: 4,  approval_required: false },
  IMG_DIMENSIONS_MISSING:   { risk_score: 2,  approval_required: false },
  SCHEMA_MISSING:           { risk_score: 3,  approval_required: false },
  SCHEMA_INVALID_JSON:      { risk_score: 4,  approval_required: false },
  SCHEMA_DUPLICATE:         { risk_score: 4,  approval_required: false },
  SCHEMA_MISSING_PRODUCT:   { risk_score: 3,  approval_required: false },
  SCHEMA_MISSING_ORG:       { risk_score: 2,  approval_required: false },
} as const;

/** Applied to any issue_type not present in SCORE_MATRIX. */
const UNKNOWN_ENTRY: MatrixEntry = { risk_score: 5, approval_required: true };

// ── Deployment behavior constants ─────────────────────────────────────────────

/**
 * Human-readable deployment constraint per risk band.
 * Band boundaries: LOW ≤3 | MEDIUM 4-6 | HIGH 7-8 | CRITICAL 9-10.
 */
export const DEPLOYMENT_BEHAVIOR = {
  LOW:      'auto_deploy — no approval needed',
  MEDIUM:   'validation_required — approval optional per tenant',
  HIGH:     'full_playwright_comparison + explicit_approval_required',
  CRITICAL: 'blocked_by_default — senior_operator_override_required',
} as const;

export type DeploymentBand = keyof typeof DEPLOYMENT_BEHAVIOR;

/** Maps a numeric risk score to its risk band label. */
export function scoreToBand(score: number): DeploymentBand {
  if (score <= 3) return 'LOW';
  if (score <= 6) return 'MEDIUM';
  if (score <= 8) return 'HIGH';
  return 'CRITICAL';
}

// ── Fix source inference ──────────────────────────────────────────────────────

/**
 * Proposed-fix actions that involve AI content generation.
 * Issues whose proposed_fix.action is in this set receive fix_source='ai_suggested'
 * and a +1 risk modifier.
 */
export const AI_ACTIONS = new Set([
  'generate_title',
  'generate_meta_desc',
  'generate_alt_text',
  'generate_from_template',
]);

/**
 * Proposed-fix actions that require manual operator input.
 * These cannot be auto-deployed or AI-generated.
 */
export const MANUAL_ACTIONS = new Set([
  'map_redirect',
  'alert_operator',
]);

/** Infers fix_source from proposed_fix.action. */
export function inferFixSource(fix: Record<string, unknown>): FixSource {
  const action = fix['action'] as string | undefined;
  if (!action)                    return 'auto_generated';
  if (AI_ACTIONS.has(action))     return 'ai_suggested';
  if (MANUAL_ACTIONS.has(action)) return 'manual';
  return 'auto_generated';
}

// ── scoreIssues ───────────────────────────────────────────────────────────────

/** Optional explicit ActionLog context. Auto-derived from issues[0] if omitted. */
export interface ScorerCtx {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  cms:       CmsType;
}

/**
 * Assigns final risk scores and deployment constraints to every detected issue.
 *
 * Modifiers applied to base matrix score (in order):
 *   +1  fix_source = 'ai_suggested'    (AI uncertainty)
 *   +2  batch affects ≥ 50 unique URLs (bulk operation guard)
 *   cap result at 10
 *
 * approval_required is forced true when:
 *   - matrix entry says true, OR
 *   - fix_source = 'ai_suggested'     (confidence gate), OR
 *   - final risk_score ≥ 7            (high/critical always need sign-off)
 *
 * Writes ActionLog stage='risk-scorer:complete' with band distribution
 * and approval count.
 *
 * @param issues  DetectedIssue[] from runAllDetectors().
 * @param ctx     ActionLog context; auto-derived from issues[0] if omitted.
 */
export function scoreIssues(
  issues: DetectedIssue[],
  ctx?:   ScorerCtx,
): ScoredIssue[] {
  // Bulk-operation guard: any batch touching 50+ unique URLs adds +2 to all scores.
  const uniqueUrls = new Set(issues.map((i) => i.url));
  const isBulk     = uniqueUrls.size >= 50;

  const scored: ScoredIssue[] = issues.map((issue) => {
    const entry     = SCORE_MATRIX[issue.issue_type] ?? UNKNOWN_ENTRY;
    const fixSource = inferFixSource(issue.proposed_fix);

    // Apply modifiers and cap.
    let score = entry.risk_score;
    if (fixSource === 'ai_suggested') score += 1;
    if (isBulk)                       score += 2;
    score = Math.min(10, score);

    // Approval is required when the matrix says so, when AI is involved,
    // or when the final score lands in the high/critical tier.
    const approvalRequired =
      entry.approval_required ||
      fixSource === 'ai_suggested' ||
      score >= 7;

    // Auto-deploy only when genuinely safe and no approval gate.
    const autoDeploy = score <= 3 && !approvalRequired;

    const band     = scoreToBand(score);
    const behavior = DEPLOYMENT_BEHAVIOR[band];

    return {
      ...issue,
      risk_score:          score,
      approval_required:   approvalRequired,
      auto_deploy:         autoDeploy,
      fix_source:          fixSource,
      deployment_behavior: behavior,
    };
  });

  // Resolve ActionLog context — explicit ctx > first issue > skip.
  const logCtx: ScorerCtx | undefined =
    ctx ??
    (issues.length > 0
      ? {
          run_id:    issues[0].run_id,
          tenant_id: issues[0].tenant_id,
          site_id:   issues[0].site_id,
          cms:       issues[0].cms,
        }
      : undefined);

  if (logCtx) {
    const log = createLogger({ ...logCtx, command: 'risk-scorer' });

    // Tally by band and approval.
    const byBand: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    let approvalCount = 0;
    for (const s of scored) {
      const key = scoreToBand(s.risk_score).toLowerCase();
      byBand[key] = (byBand[key] ?? 0) + 1;
      if (s.approval_required) approvalCount++;
    }

    log({
      stage:    'risk-scorer:complete',
      status:   'ok',
      metadata: {
        total:             scored.length,
        by_band:           byBand,
        approval_required: approvalCount,
        bulk_operation:    isBulk,
      },
    });
  }

  return scored;
}
