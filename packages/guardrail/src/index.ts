/**
 * packages/guardrail/src/index.ts
 *
 * Guardrail state machine for Velocity AEO.
 *
 * The guardrail is the platform's most important safety system. It enforces a
 * strict priority ladder so that lower-severity issue categories are never
 * patched while higher-severity categories remain unresolved.
 *
 * Priority ladder (1 = highest importance, must be resolved first):
 *   1. errors       — 4xx / 5xx crawl errors (broken pages)
 *   2. redirects    — 3xx redirect chains (crawl budget waste)
 *   3. canonicals   — missing / relative / off-domain canonical tags
 *   4. indexing     — noindex, robots.txt exclusions
 *   5. content      — missing or malformed title / meta description / h1
 *   6. schema       — missing or invalid structured data
 *   7. performance  — Core Web Vitals issues
 *   8. enhancements — image size, link text quality
 *
 * Key exports:
 *   PRIORITY_MAP        — category → priority number constant
 *   canProceed()        — check if a category's prerequisites are resolved
 *   evaluate()          — batch evaluation of proposed actions
 *   ProposedAction      — a patch the pipeline wants to apply
 *   BlockedAction       — a patch that cannot proceed yet
 *   GuardrailDecision   — { allowed, blocked, deferred } result
 *   EvaluateLogContext  — ActionLog context for audit trail
 *
 * Note: The local GuardrailDecision interface is distinct from the
 * packages/core/types.ts GuardrailDecision (which is a boolean pipeline-stage
 * record). This type captures the full categorised outcome of a batch
 * evaluate() call.
 */

import type { CmsType, PatchConfidence } from '../../core/types.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Issue categories ──────────────────────────────────────────────────────────

/** All issue categories recognised by the guardrail priority ladder. */
export type IssueCategory =
  | 'errors'
  | 'redirects'
  | 'canonicals'
  | 'indexing'
  | 'content'
  | 'schema'
  | 'performance'
  | 'enhancements';

// ── Priority map ──────────────────────────────────────────────────────────────

/**
 * Maps each IssueCategory to its priority rank.
 * Lower number = higher importance = must be resolved first.
 * All 8 values are unique so the ordering is unambiguous.
 */
export const PRIORITY_MAP: Record<IssueCategory, number> = {
  errors:       1,
  redirects:    2,
  canonicals:   3,
  indexing:     4,
  content:      5,
  schema:       6,
  performance:  7,
  enhancements: 8,
} as const;

/**
 * Categories sorted by priority ascending (1 → 8).
 * Derived once at module load time for O(n) iteration with early break.
 */
const CATEGORIES_BY_PRIORITY = (
  Object.entries(PRIORITY_MAP) as [IssueCategory, number][]
).sort((a, b) => a[1] - b[1]);

// ── Interfaces ────────────────────────────────────────────────────────────────

/** A patch the pipeline wants to apply. */
export interface ProposedAction {
  /** Unique idempotency key for this action (used for ActionLog deduplication). */
  idempotency_key: string;
  /** Issue category this patch addresses. */
  category: IssueCategory;
  /** Patch type (e.g. "redirect_patch", "theme_patch", "schema_patch"). */
  patch_type: string;
  /** Public URL the patch targets. */
  url: string;
  /**
   * Patch confidence level.
   * 'preview_only' actions are placed in deferred[] even when priority is clear —
   * they are not blocked but require human review before being applied.
   */
  confidence?: PatchConfidence;
  /** Optional human-readable description for ActionLog context. */
  description?: string;
}

/** A proposed action that cannot proceed because prerequisites are unresolved. */
export interface BlockedAction {
  /** The action that was blocked. */
  action: ProposedAction;
  /** Higher-priority categories that are not yet in resolvedCategories. */
  blocked_by_categories: IssueCategory[];
  /** Human-readable explanation written to ActionLog. */
  reason: string;
}

/**
 * Full categorised outcome of a guardrail evaluate() call.
 *
 * Note: This is NOT the same as packages/core/types.ts GuardrailDecision
 * (which records a boolean pipeline-stage pass/fail). This type is local to
 * the guardrail package and carries the full tripartite evaluation result.
 */
export interface GuardrailDecision {
  /** Actions that may proceed: priority prerequisites met, confidence ≠ 'preview_only'. */
  allowed: ProposedAction[];
  /** Actions blocked because one or more higher-priority categories are unresolved. */
  blocked: BlockedAction[];
  /**
   * Actions where priority prerequisites are met but confidence='preview_only'.
   * These should be written as preview artifacts and surfaced to an operator
   * before being applied.
   */
  deferred: ProposedAction[];
}

/** ActionLog context fields required to emit audit entries from evaluate(). */
export interface EvaluateLogContext {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  cms:       CmsType;
}

// ── canProceed ────────────────────────────────────────────────────────────────

/**
 * Returns true if all categories with a higher priority (lower number) than
 * `category` are present in `resolvedCategories`.
 *
 * Examples:
 *   canProceed('errors',  new Set())                → true  (nothing outranks errors)
 *   canProceed('redirects', new Set())              → false (errors not resolved)
 *   canProceed('redirects', new Set(['errors']))    → true
 *   canProceed('canonicals', new Set(['errors']))   → false (redirects still open)
 *
 * @param category           The category to test.
 * @param resolvedCategories Categories that have been fully addressed in this run.
 */
export function canProceed(
  category: IssueCategory,
  resolvedCategories: Set<IssueCategory>,
): boolean {
  const targetPriority = PRIORITY_MAP[category];

  for (const [cat, priority] of CATEGORIES_BY_PRIORITY) {
    // Only inspect categories with higher importance (lower priority number).
    if (priority >= targetPriority) break;
    if (!resolvedCategories.has(cat)) return false;
  }

  return true;
}

// ── evaluate ──────────────────────────────────────────────────────────────────

/**
 * Evaluates a batch of proposed actions against the priority ladder.
 *
 * Each action is placed in exactly one of three buckets:
 *   allowed   — can proceed immediately
 *   blocked   — higher-priority category unresolved; not safe to apply yet
 *   deferred  — priority is clear but confidence='preview_only'; human gate required
 *
 * If `logCtx` is provided the function also writes to ActionLog:
 *   - One `guardrail:blocked / skipped` entry per blocked action.
 *   - One `guardrail:evaluated / ok` summary entry at the end.
 *
 * @param actions             Actions the pipeline wants to apply.
 * @param resolvedCategories  Categories fully addressed in this run (default: empty).
 * @param logCtx              ActionLog context; omit to suppress audit entries.
 */
export function evaluate(
  actions: ProposedAction[],
  resolvedCategories: Set<IssueCategory> | IssueCategory[] = new Set(),
  logCtx?: EvaluateLogContext,
): GuardrailDecision {
  const resolved: Set<IssueCategory> =
    resolvedCategories instanceof Set
      ? resolvedCategories
      : new Set(resolvedCategories);

  const log = logCtx
    ? createLogger({ ...logCtx, command: 'guardrail' })
    : null;

  const decision: GuardrailDecision = { allowed: [], blocked: [], deferred: [] };

  for (const action of actions) {
    if (!canProceed(action.category, resolved)) {
      // Identify which higher-priority categories are still unresolved.
      const targetPriority = PRIORITY_MAP[action.category];
      const blockedBy: IssueCategory[] = CATEGORIES_BY_PRIORITY
        .filter(([, p]) => p < targetPriority)
        .map(([cat]) => cat)
        .filter((cat) => !resolved.has(cat));

      const blocked: BlockedAction = {
        action,
        blocked_by_categories: blockedBy,
        reason: `Unresolved higher-priority categories: ${blockedBy.join(', ')}`,
      };

      decision.blocked.push(blocked);

      log?.({
        stage:    'guardrail:blocked',
        status:   'skipped',
        url:      action.url,
        metadata: {
          idempotency_key:       action.idempotency_key,
          category:              action.category,
          patch_type:            action.patch_type,
          blocked_by_categories: blockedBy,
          reason:                blocked.reason,
        },
      });
    } else if (action.confidence === 'preview_only') {
      decision.deferred.push(action);
    } else {
      decision.allowed.push(action);
    }
  }

  // Summary audit entry — always status='ok' (the guardrail ran successfully
  // regardless of how many actions it blocked).
  log?.({
    stage:    'guardrail:evaluated',
    status:   'ok',
    metadata: {
      total:    actions.length,
      allowed:  decision.allowed.length,
      blocked:  decision.blocked.length,
      deferred: decision.deferred.length,
    },
  });

  return decision;
}
