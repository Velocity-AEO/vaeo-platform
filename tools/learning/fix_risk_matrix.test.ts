/**
 * tools/learning/fix_risk_matrix.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_RISK_MATRIX,
  getRiskProfile,
  getAutoApprovalThreshold,
  requiresSandboxForAutoApproval,
  requiresViewportQAForAutoApproval,
  getMaxAutoApprovalsPerDay,
} from './fix_risk_matrix.ts';

// ── getRiskProfile ────────────────────────────────────────────────────────────

describe('getRiskProfile', () => {
  it('returns low for TITLE_MISSING', () => {
    assert.equal(getRiskProfile('TITLE_MISSING').risk_level, 'low');
  });

  it('returns low for META_DESC_MISSING', () => {
    assert.equal(getRiskProfile('META_DESC_MISSING').risk_level, 'low');
  });

  it('returns medium for OG_MISSING', () => {
    assert.equal(getRiskProfile('OG_MISSING').risk_level, 'medium');
  });

  it('returns medium for ALT_MISSING', () => {
    assert.equal(getRiskProfile('ALT_MISSING').risk_level, 'medium');
  });

  it('returns high for SCHEMA_MISSING', () => {
    assert.equal(getRiskProfile('SCHEMA_MISSING').risk_level, 'high');
  });

  it('returns high for CANONICAL_MISSING', () => {
    assert.equal(getRiskProfile('CANONICAL_MISSING').risk_level, 'high');
  });

  it('returns critical for ROBOTS_NOINDEX', () => {
    assert.equal(getRiskProfile('ROBOTS_NOINDEX').risk_level, 'critical');
  });

  it('returns critical for HREFLANG_MISSING', () => {
    assert.equal(getRiskProfile('HREFLANG_MISSING').risk_level, 'critical');
  });

  it('returns high default for unknown type', () => {
    assert.equal(getRiskProfile('TOTALLY_UNKNOWN_ISSUE').risk_level, 'high');
  });

  it('default profile has threshold 0.92', () => {
    assert.equal(getRiskProfile('UNKNOWN_XYZ').auto_approval_threshold, 0.92);
  });

  it('never throws for unknown issue_type', () => {
    assert.doesNotThrow(() => getRiskProfile('NOT_IN_MATRIX'));
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => getRiskProfile(null as never));
  });
});

// ── getAutoApprovalThreshold ──────────────────────────────────────────────────

describe('getAutoApprovalThreshold', () => {
  it('returns 0.75 for low risk (TITLE_MISSING)', () => {
    assert.equal(getAutoApprovalThreshold('TITLE_MISSING'), 0.75);
  });

  it('returns 0.75 for low risk (META_DESC_LONG)', () => {
    assert.equal(getAutoApprovalThreshold('META_DESC_LONG'), 0.75);
  });

  it('returns 0.85 for medium risk (OG_MISSING)', () => {
    assert.equal(getAutoApprovalThreshold('OG_MISSING'), 0.85);
  });

  it('returns 0.92 for high risk (SCHEMA_MISSING)', () => {
    assert.equal(getAutoApprovalThreshold('SCHEMA_MISSING'), 0.92);
  });

  it('returns 0.97 for critical risk (ROBOTS_NOINDEX)', () => {
    assert.equal(getAutoApprovalThreshold('ROBOTS_NOINDEX'), 0.97);
  });

  it('returns 0.92 for unknown issue type', () => {
    assert.equal(getAutoApprovalThreshold('BOGUS'), 0.92);
  });
});

// ── requiresSandboxForAutoApproval ────────────────────────────────────────────

describe('requiresSandboxForAutoApproval', () => {
  it('returns true for SCHEMA_MISSING', () => {
    assert.equal(requiresSandboxForAutoApproval('SCHEMA_MISSING'), true);
  });

  it('returns true for CANONICAL_MISSING', () => {
    assert.equal(requiresSandboxForAutoApproval('CANONICAL_MISSING'), true);
  });

  it('returns true for ROBOTS_NOINDEX (critical)', () => {
    assert.equal(requiresSandboxForAutoApproval('ROBOTS_NOINDEX'), true);
  });

  it('returns false for TITLE_MISSING (low risk)', () => {
    assert.equal(requiresSandboxForAutoApproval('TITLE_MISSING'), false);
  });

  it('returns false for META_DESC_MISSING', () => {
    assert.equal(requiresSandboxForAutoApproval('META_DESC_MISSING'), false);
  });

  it('returns false for OG_MISSING (medium)', () => {
    assert.equal(requiresSandboxForAutoApproval('OG_MISSING'), false);
  });
});

// ── requiresViewportQAForAutoApproval ─────────────────────────────────────────

describe('requiresViewportQAForAutoApproval', () => {
  it('returns true for ROBOTS_NOINDEX', () => {
    assert.equal(requiresViewportQAForAutoApproval('ROBOTS_NOINDEX'), true);
  });

  it('returns true for HREFLANG_MISSING', () => {
    assert.equal(requiresViewportQAForAutoApproval('HREFLANG_MISSING'), true);
  });

  it('returns true for ALT_MISSING (medium, viewport required)', () => {
    assert.equal(requiresViewportQAForAutoApproval('ALT_MISSING'), true);
  });

  it('returns false for META_DESC_MISSING', () => {
    assert.equal(requiresViewportQAForAutoApproval('META_DESC_MISSING'), false);
  });

  it('returns false for SCHEMA_MISSING (high, no viewport required)', () => {
    assert.equal(requiresViewportQAForAutoApproval('SCHEMA_MISSING'), false);
  });
});

// ── getMaxAutoApprovalsPerDay ─────────────────────────────────────────────────

describe('getMaxAutoApprovalsPerDay', () => {
  it('returns 50 for low risk (TITLE_MISSING)', () => {
    assert.equal(getMaxAutoApprovalsPerDay('TITLE_MISSING'), 50);
  });

  it('returns 50 for low risk (META_DESC_LONG)', () => {
    assert.equal(getMaxAutoApprovalsPerDay('META_DESC_LONG'), 50);
  });

  it('returns 30 for medium risk (OG_MISSING)', () => {
    assert.equal(getMaxAutoApprovalsPerDay('OG_MISSING'), 30);
  });

  it('returns 10 for high risk (SCHEMA_MISSING)', () => {
    assert.equal(getMaxAutoApprovalsPerDay('SCHEMA_MISSING'), 10);
  });

  it('returns 3 for critical risk (ROBOTS_NOINDEX)', () => {
    assert.equal(getMaxAutoApprovalsPerDay('ROBOTS_NOINDEX'), 3);
  });

  it('returns 3 for critical risk (HREFLANG_WRONG)', () => {
    assert.equal(getMaxAutoApprovalsPerDay('HREFLANG_WRONG'), 3);
  });
});

// ── FIX_RISK_MATRIX completeness ──────────────────────────────────────────────

describe('FIX_RISK_MATRIX', () => {
  const ALL_TYPES = [
    'TITLE_MISSING', 'TITLE_LONG', 'TITLE_SHORT',
    'META_DESC_MISSING', 'META_DESC_LONG',
    'OG_MISSING', 'OG_TITLE', 'OG_DESC',
    'ALT_MISSING',
    'CANONICAL_MISSING', 'CANONICAL_WRONG',
    'SCHEMA_MISSING', 'SCHEMA_INVALID',
    'ROBOTS_NOINDEX', 'ROBOTS_DISALLOW',
    'HREFLANG_MISSING', 'HREFLANG_WRONG',
  ];

  it('has entries for all specified issue types', () => {
    for (const t of ALL_TYPES) {
      assert.ok(FIX_RISK_MATRIX[t], `Missing entry for ${t}`);
    }
  });

  it('every profile has a non-empty reason string', () => {
    for (const [, profile] of Object.entries(FIX_RISK_MATRIX)) {
      assert.ok(profile.reason.length > 0);
    }
  });

  it('every auto-approvable threshold is between 0 and 1', () => {
    for (const [, profile] of Object.entries(FIX_RISK_MATRIX)) {
      // Entries with max_auto_approvals_per_day=0 may use threshold > 1 as a "never" sentinel
      if (profile.max_auto_approvals_per_day === 0) continue;
      assert.ok(profile.auto_approval_threshold > 0 && profile.auto_approval_threshold <= 1);
    }
  });
});
