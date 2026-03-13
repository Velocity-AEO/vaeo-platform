/**
 * tools/health/health_score_weights.test.ts
 *
 * Tests for severity-weighted issue matrix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ISSUE_WEIGHT_MATRIX,
  DEFAULT_WEIGHT_PROFILE,
  getIssueWeight,
  getIssueSeverity,
  getTotalPossibleScore,
  type IssueSeverity,
} from './health_score_weights.js';

// ── getIssueWeight — severity checks ─────────────────────────────────────────

describe('getIssueWeight', () => {
  it('returns critical for TITLE_MISSING', () => {
    const p = getIssueWeight('TITLE_MISSING');
    assert.equal(p.severity, 'critical');
  });

  it('returns critical for ROBOTS_NOINDEX', () => {
    const p = getIssueWeight('ROBOTS_NOINDEX');
    assert.equal(p.severity, 'critical');
  });

  it('returns critical for CANONICAL_WRONG', () => {
    const p = getIssueWeight('CANONICAL_WRONG');
    assert.equal(p.severity, 'critical');
  });

  it('returns high for META_DESC_MISSING', () => {
    const p = getIssueWeight('META_DESC_MISSING');
    assert.equal(p.severity, 'high');
  });

  it('returns high for SCHEMA_MISSING', () => {
    const p = getIssueWeight('SCHEMA_MISSING');
    assert.equal(p.severity, 'high');
  });

  it('returns high for SCHEMA_INVALID', () => {
    const p = getIssueWeight('SCHEMA_INVALID');
    assert.equal(p.severity, 'high');
  });

  it('returns high for CANONICAL_MISSING', () => {
    const p = getIssueWeight('CANONICAL_MISSING');
    assert.equal(p.severity, 'high');
  });

  it('returns medium for OG_MISSING', () => {
    const p = getIssueWeight('OG_MISSING');
    assert.equal(p.severity, 'medium');
  });

  it('returns medium for HREFLANG_MISSING', () => {
    const p = getIssueWeight('HREFLANG_MISSING');
    assert.equal(p.severity, 'medium');
  });

  it('returns low for ALT_MISSING', () => {
    const p = getIssueWeight('ALT_MISSING');
    assert.equal(p.severity, 'low');
  });

  it('returns low for SPEAKABLE_MISSING', () => {
    const p = getIssueWeight('SPEAKABLE_MISSING');
    assert.equal(p.severity, 'low');
  });

  it('returns low for ORPHANED_PAGE', () => {
    const p = getIssueWeight('ORPHANED_PAGE');
    assert.equal(p.severity, 'low');
  });

  it('returns default for unknown type', () => {
    const p = getIssueWeight('TOTALLY_UNKNOWN');
    assert.equal(p.severity, DEFAULT_WEIGHT_PROFILE.severity);
    assert.equal(p.weight, DEFAULT_WEIGHT_PROFILE.weight);
  });

  it('is case-insensitive', () => {
    const p = getIssueWeight('title_missing');
    assert.equal(p.severity, 'critical');
  });
});

// ── score_impact values ──────────────────────────────────────────────────────

describe('score_impact values', () => {
  it('score_impact 15 for critical severity', () => {
    assert.equal(getIssueWeight('TITLE_MISSING').score_impact, 15);
    assert.equal(getIssueWeight('ROBOTS_NOINDEX').score_impact, 15);
    assert.equal(getIssueWeight('CANONICAL_WRONG').score_impact, 15);
  });

  it('score_impact 10 for high severity', () => {
    assert.equal(getIssueWeight('META_DESC_MISSING').score_impact, 10);
    assert.equal(getIssueWeight('SCHEMA_MISSING').score_impact, 10);
    assert.equal(getIssueWeight('TITLE_LONG').score_impact, 10);
  });

  it('score_impact 5 for medium severity', () => {
    assert.equal(getIssueWeight('OG_MISSING').score_impact, 5);
    assert.equal(getIssueWeight('META_DESC_LONG').score_impact, 5);
  });

  it('score_impact 2 for low severity', () => {
    assert.equal(getIssueWeight('ALT_MISSING').score_impact, 2);
    assert.equal(getIssueWeight('ORPHANED_PAGE').score_impact, 2);
  });

  it('default score_impact is 8', () => {
    assert.equal(DEFAULT_WEIGHT_PROFILE.score_impact, 8);
  });
});

// ── getIssueSeverity ─────────────────────────────────────────────────────────

describe('getIssueSeverity', () => {
  it('returns correct severity per type', () => {
    assert.equal(getIssueSeverity('TITLE_MISSING'), 'critical');
    assert.equal(getIssueSeverity('META_DESC_MISSING'), 'high');
    assert.equal(getIssueSeverity('OG_MISSING'), 'medium');
    assert.equal(getIssueSeverity('ALT_MISSING'), 'low');
  });

  it('returns high for unknown type', () => {
    assert.equal(getIssueSeverity('SOMETHING_WEIRD'), 'high');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getIssueSeverity(null as any));
  });
});

// ── getTotalPossibleScore ────────────────────────────────────────────────────

describe('getTotalPossibleScore', () => {
  it('sums score_impact correctly', () => {
    const total = getTotalPossibleScore(['TITLE_MISSING', 'ALT_MISSING']);
    assert.equal(total, 15 + 2);
  });

  it('handles empty array', () => {
    assert.equal(getTotalPossibleScore([]), 0);
  });

  it('uses default for unknown types', () => {
    assert.equal(getTotalPossibleScore(['UNKNOWN_TYPE']), 8);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getTotalPossibleScore(null as any));
  });
});

// ── ISSUE_WEIGHT_MATRIX ──────────────────────────────────────────────────────

describe('ISSUE_WEIGHT_MATRIX', () => {
  it('has all expected issue types', () => {
    const expected = [
      'TITLE_MISSING', 'ROBOTS_NOINDEX', 'CANONICAL_WRONG',
      'TITLE_LONG', 'TITLE_SHORT', 'META_DESC_MISSING',
      'SCHEMA_MISSING', 'SCHEMA_INVALID', 'CANONICAL_MISSING',
      'META_DESC_LONG', 'OG_MISSING', 'OG_TITLE', 'OG_DESC',
      'HREFLANG_MISSING', 'HREFLANG_WRONG',
      'ALT_MISSING', 'SPEAKABLE_MISSING', 'ORPHANED_PAGE',
    ];
    for (const key of expected) {
      assert.ok(ISSUE_WEIGHT_MATRIX[key], `missing: ${key}`);
    }
  });

  it('every entry has required fields', () => {
    for (const [key, profile] of Object.entries(ISSUE_WEIGHT_MATRIX)) {
      assert.ok(profile.issue_type, `${key} missing issue_type`);
      assert.ok(profile.severity, `${key} missing severity`);
      assert.ok(typeof profile.weight === 'number', `${key} missing weight`);
      assert.ok(typeof profile.score_impact === 'number', `${key} missing score_impact`);
      assert.ok(profile.description, `${key} missing description`);
    }
  });
});

// ── Never-throws ─────────────────────────────────────────────────────────────

describe('never throws', () => {
  it('getIssueWeight never throws', () => {
    assert.doesNotThrow(() => getIssueWeight(null as any));
    assert.doesNotThrow(() => getIssueWeight(undefined as any));
    assert.doesNotThrow(() => getIssueWeight(''));
  });

  it('getIssueSeverity never throws', () => {
    assert.doesNotThrow(() => getIssueSeverity(null as any));
    assert.doesNotThrow(() => getIssueSeverity(undefined as any));
  });

  it('getTotalPossibleScore never throws', () => {
    assert.doesNotThrow(() => getTotalPossibleScore(null as any));
    assert.doesNotThrow(() => getTotalPossibleScore(undefined as any));
  });
});
