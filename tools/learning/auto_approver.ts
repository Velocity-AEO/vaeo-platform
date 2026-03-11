/**
 * tools/learning/auto_approver.ts
 *
 * Evaluates queued fix items against historical confidence data and
 * auto-approves those that meet the configured thresholds.
 *
 * Injectable DB — never throws.
 */

import { scoreConfidence } from './confidence_scorer.ts';
import type { PatternDb } from './pattern_engine.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoApprovalConfig {
  min_confidence:        number;
  min_samples:           number;
  eligible_issue_types:  string[];
  blocked_issue_types:   string[];
  max_auto_per_run:      number;
}

export interface AutoApprovalResult {
  item_id:          string;
  url:              string;
  issue_type:       string;
  approved:         boolean;
  reason:           string;
  confidence:       number;
  confidence_tier:  string;
  auto_approved_at: string;
}

export type ApprovalItem = {
  id:           string;
  url:          string;
  issue_type:   string;
  proposed_fix: string;
};

// ── Default config ────────────────────────────────────────────────────────────

export const DEFAULT_AUTO_CONFIG: AutoApprovalConfig = {
  min_confidence:       0.85,
  min_samples:          5,
  eligible_issue_types: [
    'SCHEMA_MISSING',
    'TITLE_MISSING',
    'META_DESC_MISSING',
    'TITLE_TOO_SHORT',
    'META_DESC_TOO_SHORT',
    'DEFER_SCRIPT',
    'LAZY_IMAGE',
    'FONT_DISPLAY',
  ],
  blocked_issue_types: ['CANONICAL_MISSING', 'REDIRECT_CHAIN'],
  max_auto_per_run:    50,
};

// ── evaluateForAutoApproval ───────────────────────────────────────────────────

/**
 * Decide whether a single fix item qualifies for auto-approval.
 * ALL checks must pass for approved=true.
 */
export async function evaluateForAutoApproval(
  item:   ApprovalItem,
  config: AutoApprovalConfig,
  db:     unknown,
): Promise<AutoApprovalResult> {
  const now = new Date().toISOString();

  // Gate 1: not blocked
  if (config.blocked_issue_types.includes(item.issue_type)) {
    return {
      item_id:          item.id,
      url:              item.url,
      issue_type:       item.issue_type,
      approved:         false,
      reason:           `issue_type ${item.issue_type} is in blocked_issue_types`,
      confidence:       0,
      confidence_tier:  'insufficient',
      auto_approved_at: now,
    };
  }

  // Gate 2: eligible
  if (!config.eligible_issue_types.includes(item.issue_type)) {
    return {
      item_id:          item.id,
      url:              item.url,
      issue_type:       item.issue_type,
      approved:         false,
      reason:           `issue_type ${item.issue_type} is not in eligible_issue_types`,
      confidence:       0,
      confidence_tier:  'insufficient',
      auto_approved_at: now,
    };
  }

  // Gate 3 & 4: confidence thresholds
  let score;
  try {
    score = await scoreConfidence(item.issue_type, item.proposed_fix, db as PatternDb);
  } catch (err) {
    return {
      item_id:          item.id,
      url:              item.url,
      issue_type:       item.issue_type,
      approved:         false,
      reason:           `scoreConfidence error: ${err instanceof Error ? err.message : String(err)}`,
      confidence:       0,
      confidence_tier:  'insufficient',
      auto_approved_at: now,
    };
  }

  if (score.samples < config.min_samples) {
    return {
      item_id:          item.id,
      url:              item.url,
      issue_type:       item.issue_type,
      approved:         false,
      reason:           `insufficient samples: ${score.samples} < ${config.min_samples}`,
      confidence:       score.score,
      confidence_tier:  score.tier,
      auto_approved_at: now,
    };
  }

  if (score.score < config.min_confidence) {
    return {
      item_id:          item.id,
      url:              item.url,
      issue_type:       item.issue_type,
      approved:         false,
      reason:           `confidence too low: ${score.score.toFixed(3)} < ${config.min_confidence}`,
      confidence:       score.score,
      confidence_tier:  score.tier,
      auto_approved_at: now,
    };
  }

  return {
    item_id:          item.id,
    url:              item.url,
    issue_type:       item.issue_type,
    approved:         true,
    reason:           `all checks passed (confidence=${score.score.toFixed(3)}, samples=${score.samples})`,
    confidence:       score.score,
    confidence_tier:  score.tier,
    auto_approved_at: now,
  };
}

// ── runAutoApprovalBatch ──────────────────────────────────────────────────────

/**
 * Evaluate a batch of items, respecting max_auto_per_run.
 * Returns separate approved and skipped lists.
 */
export async function runAutoApprovalBatch(
  items:  ApprovalItem[],
  config: AutoApprovalConfig,
  db:     unknown,
): Promise<{ approved: AutoApprovalResult[]; skipped: AutoApprovalResult[]; total: number }> {
  const approved: AutoApprovalResult[] = [];
  const skipped:  AutoApprovalResult[] = [];

  for (const item of items) {
    // Enforce per-run limit on approved count
    if (approved.length >= config.max_auto_per_run) {
      skipped.push({
        item_id:          item.id,
        url:              item.url,
        issue_type:       item.issue_type,
        approved:         false,
        reason:           `max_auto_per_run limit (${config.max_auto_per_run}) reached`,
        confidence:       0,
        confidence_tier:  'insufficient',
        auto_approved_at: new Date().toISOString(),
      });
      continue;
    }

    const result = await evaluateForAutoApproval(item, config, db);
    if (result.approved) approved.push(result);
    else                 skipped.push(result);
  }

  return { approved, skipped, total: items.length };
}
