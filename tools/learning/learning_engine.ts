/**
 * tools/learning/learning_engine.ts
 *
 * Risk-adjusted auto-approval engine.
 * Replaces flat confidence thresholds with per-fix-type risk profiles.
 *
 * Never throws.
 */

import {
  getRiskProfile,
  getAutoApprovalThreshold,
  requiresSandboxForAutoApproval,
  requiresViewportQAForAutoApproval,
  getMaxAutoApprovalsPerDay,
  type FixRiskLevel,
} from './fix_risk_matrix.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShouldAutoApproveInput {
  issue_type:          string;
  confidence:          number;
  sandbox_passed?:     boolean;
  viewport_qa_passed?: boolean;
}

export interface AutoApprovalDecision {
  approved:              boolean;
  reason:                string;
  risk_level:            FixRiskLevel;
  threshold_used:        number;
  sandbox_required:      boolean;
  sandbox_passed:        boolean;
  viewport_qa_required:  boolean;
  viewport_qa_passed:    boolean;
  daily_count:           number;
  daily_limit:           number;
}

export interface LearningEngineDeps {
  getDailyCount?: (issue_type: string, site_id: string) => Promise<number>;
  logFn?:         (msg: string) => void;
}

// ── shouldAutoApprove ─────────────────────────────────────────────────────────

export async function shouldAutoApprove(
  input:   ShouldAutoApproveInput,
  site_id: string,
  deps?:   LearningEngineDeps,
): Promise<AutoApprovalDecision> {
  const logFn = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    const issue_type        = input?.issue_type  ?? '';
    const confidence        = input?.confidence  ?? 0;
    const sandbox_passed_in = input?.sandbox_passed    ?? false;
    const viewport_passed_in = input?.viewport_qa_passed ?? false;

    const profile            = getRiskProfile(issue_type);
    const threshold_used     = getAutoApprovalThreshold(issue_type);
    const sandbox_required   = requiresSandboxForAutoApproval(issue_type);
    const viewport_required  = requiresViewportQAForAutoApproval(issue_type);
    const daily_limit        = getMaxAutoApprovalsPerDay(issue_type);

    const base: Omit<AutoApprovalDecision, 'approved' | 'reason'> = {
      risk_level:           profile.risk_level,
      threshold_used,
      sandbox_required,
      sandbox_passed:       sandbox_passed_in,
      viewport_qa_required: viewport_required,
      viewport_qa_passed:   viewport_passed_in,
      daily_count:          0,
      daily_limit,
    };

    // Gate 1: confidence threshold
    if (confidence < threshold_used) {
      return {
        ...base,
        approved: false,
        reason:   `confidence ${confidence.toFixed(3)} below threshold ${threshold_used} for ${issue_type}`,
      };
    }

    // Gate 2: sandbox requirement
    if (sandbox_required && !sandbox_passed_in) {
      return {
        ...base,
        approved: false,
        reason:   `sandbox required for ${issue_type} but sandbox_passed=false`,
      };
    }

    // Gate 3: viewport QA requirement
    if (viewport_required && !viewport_passed_in) {
      return {
        ...base,
        approved: false,
        reason:   `viewport QA required for ${issue_type} but viewport_qa_passed=false`,
      };
    }

    // Gate 4: daily limit
    const countFn     = deps?.getDailyCount ?? defaultGetDailyCount;
    const daily_count = await countFn(issue_type, site_id ?? '').catch(() => 0);

    if (daily_count >= daily_limit) {
      logFn(
        `[LEARNING] Daily auto-approval limit reached for ${issue_type}: ${daily_count}/${daily_limit}`,
      );
      return {
        ...base,
        daily_count,
        approved: false,
        reason:   `daily limit reached for ${issue_type}: ${daily_count}/${daily_limit}`,
      };
    }

    return {
      ...base,
      daily_count,
      approved: true,
      reason:   `all checks passed (confidence=${confidence.toFixed(3)}, threshold=${threshold_used}, daily=${daily_count}/${daily_limit})`,
    };
  } catch {
    return {
      approved:              false,
      reason:                'unexpected error in shouldAutoApprove',
      risk_level:            'high',
      threshold_used:        0.92,
      sandbox_required:      false,
      sandbox_passed:        false,
      viewport_qa_required:  false,
      viewport_qa_passed:    false,
      daily_count:           0,
      daily_limit:           0,
    };
  }
}

// ── getDailyAutoApprovalCount ─────────────────────────────────────────────────

export async function getDailyAutoApprovalCount(
  issue_type: string,
  site_id:    string,
  deps?:      { countFn?: (issue_type: string, site_id: string) => Promise<number> },
): Promise<number> {
  try {
    const fn = deps?.countFn ?? defaultGetDailyCount;
    return await fn(issue_type ?? '', site_id ?? '');
  } catch {
    return 0;
  }
}

// ── Default implementations ───────────────────────────────────────────────────

async function defaultGetDailyCount(
  _issue_type: string,
  _site_id:    string,
): Promise<number> {
  return 0;
}
