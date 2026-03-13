/**
 * tools/learning/fix_risk_matrix.ts
 *
 * Per-fix-type risk profiles that drive auto-approval thresholds.
 * Higher-impact changes require higher confidence before auto-approving.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FixRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface FixRiskProfile {
  issue_type:                 string;
  risk_level:                 FixRiskLevel;
  auto_approval_threshold:    number;
  requires_sandbox:           boolean;
  requires_viewport_qa:       boolean;
  max_auto_approvals_per_day: number;
  reason:                     string;
}

// ── Risk Matrix ───────────────────────────────────────────────────────────────

function low(
  issue_type: string,
  reason: string,
  max = 50,
): FixRiskProfile {
  return {
    issue_type,
    risk_level:                 'low',
    auto_approval_threshold:    0.75,
    requires_sandbox:           false,
    requires_viewport_qa:       false,
    max_auto_approvals_per_day: max,
    reason,
  };
}

function medium(
  issue_type:          string,
  reason:              string,
  requires_viewport_qa = false,
  max = 30,
): FixRiskProfile {
  return {
    issue_type,
    risk_level:                 'medium',
    auto_approval_threshold:    0.85,
    requires_sandbox:           false,
    requires_viewport_qa,
    max_auto_approvals_per_day: max,
    reason,
  };
}

function high(
  issue_type: string,
  reason:     string,
  max = 10,
): FixRiskProfile {
  return {
    issue_type,
    risk_level:                 'high',
    auto_approval_threshold:    0.92,
    requires_sandbox:           true,
    requires_viewport_qa:       false,
    max_auto_approvals_per_day: max,
    reason,
  };
}

function critical(
  issue_type: string,
  reason:     string,
  max = 3,
): FixRiskProfile {
  return {
    issue_type,
    risk_level:                 'critical',
    auto_approval_threshold:    0.97,
    requires_sandbox:           true,
    requires_viewport_qa:       true,
    max_auto_approvals_per_day: max,
    reason,
  };
}

export const FIX_RISK_MATRIX: Record<string, FixRiskProfile> = {
  // ── Low risk (threshold: 0.75) ────────────────────────────────────────────
  TITLE_MISSING: low(
    'TITLE_MISSING',
    'Title changes are safe and easily reversible',
  ),
  TITLE_LONG: low(
    'TITLE_LONG',
    'Title changes are safe and easily reversible',
  ),
  TITLE_SHORT: low(
    'TITLE_SHORT',
    'Title changes are safe and easily reversible',
  ),
  META_DESC_MISSING: low(
    'META_DESC_MISSING',
    'Meta description changes are safe and easily reversible',
  ),
  META_DESC_LONG: low(
    'META_DESC_LONG',
    'Meta description changes are safe and easily reversible',
  ),

  // ── Medium risk (threshold: 0.85) ─────────────────────────────────────────
  OG_MISSING: medium(
    'OG_MISSING',
    'OG tags affect social sharing — moderate care required',
  ),
  OG_TITLE: medium(
    'OG_TITLE',
    'OG tags affect social sharing — moderate care required',
  ),
  OG_DESC: medium(
    'OG_DESC',
    'OG tags affect social sharing — moderate care required',
  ),
  ALT_MISSING: medium(
    'ALT_MISSING',
    'Alt text changes affect accessibility rendering',
    true, // requires_viewport_qa
  ),

  // ── High risk (threshold: 0.92) ───────────────────────────────────────────
  CANONICAL_MISSING: high(
    'CANONICAL_MISSING',
    'Canonical errors can cause significant indexing damage',
  ),
  CANONICAL_WRONG: high(
    'CANONICAL_WRONG',
    'Canonical errors can cause significant indexing damage',
  ),
  SCHEMA_MISSING: high(
    'SCHEMA_MISSING',
    'Schema injection modifies structured data — high impact',
  ),
  SCHEMA_INVALID: high(
    'SCHEMA_INVALID',
    'Schema injection modifies structured data — high impact',
  ),

  // ── Never auto-approve ────────────────────────────────────────────────────
  ORPHANED_PAGE: {
    issue_type:                 'ORPHANED_PAGE',
    risk_level:                 'low' as FixRiskLevel,
    auto_approval_threshold:    1.1, // > 1.0 — mathematically impossible to satisfy
    requires_sandbox:           false,
    requires_viewport_qa:       false,
    max_auto_approvals_per_day: 0,
    reason:                     'Internal linking requires human judgment — never auto-approve',
  },

  // ── Critical risk (threshold: 0.97) ──────────────────────────────────────
  ROBOTS_NOINDEX: critical(
    'ROBOTS_NOINDEX',
    'Robots directives control indexability — extreme care required',
  ),
  ROBOTS_DISALLOW: critical(
    'ROBOTS_DISALLOW',
    'Robots directives control indexability — extreme care required',
  ),
  HREFLANG_MISSING: critical(
    'HREFLANG_MISSING',
    'Hreflang errors affect international SEO globally',
  ),
  HREFLANG_WRONG: critical(
    'HREFLANG_WRONG',
    'Hreflang errors affect international SEO globally',
  ),
};

// ── DEFAULT_HIGH_RISK_PROFILE ─────────────────────────────────────────────────

/** Returned for unknown issue types — conservative fallback. */
const DEFAULT_HIGH_RISK_PROFILE: FixRiskProfile = high(
  'UNKNOWN',
  'Unknown issue type — treating as high risk by default',
);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getRiskProfile(issue_type: string): FixRiskProfile {
  try {
    return FIX_RISK_MATRIX[issue_type ?? ''] ?? {
      ...DEFAULT_HIGH_RISK_PROFILE,
      issue_type: issue_type ?? 'UNKNOWN',
    };
  } catch {
    return DEFAULT_HIGH_RISK_PROFILE;
  }
}

export function getAutoApprovalThreshold(issue_type: string): number {
  try {
    return getRiskProfile(issue_type).auto_approval_threshold;
  } catch {
    return 0.92;
  }
}

export function requiresSandboxForAutoApproval(issue_type: string): boolean {
  try {
    return getRiskProfile(issue_type).requires_sandbox;
  } catch {
    return true;
  }
}

export function requiresViewportQAForAutoApproval(issue_type: string): boolean {
  try {
    return getRiskProfile(issue_type).requires_viewport_qa;
  } catch {
    return false;
  }
}

export function getMaxAutoApprovalsPerDay(issue_type: string): number {
  try {
    return getRiskProfile(issue_type).max_auto_approvals_per_day;
  } catch {
    return 10;
  }
}
