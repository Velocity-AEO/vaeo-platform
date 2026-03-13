/**
 * apps/dashboard/lib/health_score_display.test.ts
 *
 * Tests for health score display helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIssueTypeLabel,
  getSeverityBadgeColor,
  formatScoreImpact,
} from './health_score_display.js';

// ── formatIssueTypeLabel ─────────────────────────────────────────────────────

describe('formatIssueTypeLabel', () => {
  it('returns human label for TITLE_MISSING', () => {
    assert.equal(formatIssueTypeLabel('TITLE_MISSING'), 'Missing Title Tag');
  });

  it('returns human label for META_DESC_MISSING', () => {
    assert.equal(formatIssueTypeLabel('META_DESC_MISSING'), 'Missing Meta Description');
  });

  it('returns human label for SCHEMA_MISSING', () => {
    assert.equal(formatIssueTypeLabel('SCHEMA_MISSING'), 'Missing Schema Markup');
  });

  it('returns human label for CANONICAL_MISSING', () => {
    assert.equal(formatIssueTypeLabel('CANONICAL_MISSING'), 'Missing Canonical Tag');
  });

  it('returns human label for ROBOTS_NOINDEX', () => {
    assert.equal(formatIssueTypeLabel('ROBOTS_NOINDEX'), 'Noindex Directive');
  });

  it('returns human label for ALT_MISSING', () => {
    assert.equal(formatIssueTypeLabel('ALT_MISSING'), 'Missing Image Alt Text');
  });

  it('passes through unknown types', () => {
    assert.equal(formatIssueTypeLabel('SOME_NEW_TYPE'), 'SOME_NEW_TYPE');
  });

  it('is case-insensitive', () => {
    assert.equal(formatIssueTypeLabel('title_missing'), 'Missing Title Tag');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatIssueTypeLabel(null as any));
  });
});

// ── getSeverityBadgeColor ────────────────────────────────────────────────────

describe('getSeverityBadgeColor', () => {
  it('returns red for critical', () => {
    assert.equal(getSeverityBadgeColor('critical'), 'bg-red-100 text-red-700');
  });

  it('returns orange for high', () => {
    assert.equal(getSeverityBadgeColor('high'), 'bg-orange-100 text-orange-700');
  });

  it('returns yellow for medium', () => {
    assert.equal(getSeverityBadgeColor('medium'), 'bg-yellow-100 text-yellow-700');
  });

  it('returns grey for low', () => {
    assert.equal(getSeverityBadgeColor('low'), 'bg-gray-100 text-gray-600');
  });

  it('never throws on unknown', () => {
    assert.doesNotThrow(() => getSeverityBadgeColor('unknown' as any));
  });
});

// ── formatScoreImpact ────────────────────────────────────────────────────────

describe('formatScoreImpact', () => {
  it('formats impact correctly', () => {
    assert.equal(formatScoreImpact(15), '-15 pts');
  });

  it('formats zero', () => {
    assert.equal(formatScoreImpact(0), '-0 pts');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatScoreImpact(null as any));
  });
});
