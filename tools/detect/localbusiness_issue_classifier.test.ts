/**
 * tools/detect/localbusiness_issue_classifier.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocalBusinessIssues } from './localbusiness_issue_classifier.ts';
import type { LocalBusinessSignals } from './localbusiness_detect.ts';

const BASE_URL = 'https://example.com/contact';

function signals(overrides: Partial<LocalBusinessSignals> = {}): LocalBusinessSignals {
  return {
    has_localbusiness_schema: false,
    has_address:              false,
    has_phone:                false,
    has_hours:                false,
    has_geo:                  false,
    has_price_range:          false,
    has_same_as:              false,
    is_local_business_page:   true,
    issues:                   [],
    ...overrides,
  };
}

const FULL_SIGNALS = signals({
  has_localbusiness_schema: true,
  has_address:              true,
  has_phone:                true,
  has_hours:                true,
  has_geo:                  true,
  has_price_range:          true,
  has_same_as:              true,
  detected_phone:           '555-123-4567',
});

describe('classifyLocalBusinessIssues', () => {
  it('returns empty array for non-local page', () => {
    const s = signals({ is_local_business_page: false });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    assert.equal(issues.length, 0);
  });

  it('flags missing_localbusiness_schema as high severity', () => {
    const issues = classifyLocalBusinessIssues(signals(), '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_localbusiness_schema');
    assert.ok(issue, 'should have missing_localbusiness_schema');
    assert.equal(issue.severity, 'high');
  });

  it('flags missing_address as high severity', () => {
    const issues = classifyLocalBusinessIssues(signals(), '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_address');
    assert.ok(issue, 'should have missing_address');
    assert.equal(issue.severity, 'high');
  });

  it('flags missing_phone as high severity', () => {
    const issues = classifyLocalBusinessIssues(signals(), '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_phone');
    assert.ok(issue, 'should have missing_phone');
    assert.equal(issue.severity, 'high');
  });

  it('flags missing_hours as medium when schema present but no hours', () => {
    const s = signals({ has_localbusiness_schema: true, has_address: true, has_phone: true });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_hours');
    assert.ok(issue, 'should have missing_hours');
    assert.equal(issue.severity, 'medium');
  });

  it('does not flag missing_hours when schema is absent (expected — no schema yet)', () => {
    const s = signals({ has_localbusiness_schema: false });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    assert.ok(!issues.find((i) => i.type === 'missing_hours'));
  });

  it('flags missing_geo_coordinates as medium when schema present', () => {
    const s = signals({ has_localbusiness_schema: true, has_address: true, has_phone: true });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_geo_coordinates');
    assert.ok(issue, 'should have missing_geo_coordinates');
    assert.equal(issue.severity, 'medium');
  });

  it('flags missing_same_as as medium when schema present but no sameAs', () => {
    const s = signals({ has_localbusiness_schema: true, has_address: true, has_phone: true });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_same_as');
    assert.ok(issue, 'should have missing_same_as');
    assert.equal(issue.severity, 'medium');
  });

  it('flags missing_price_range as low', () => {
    const s = signals({ has_localbusiness_schema: true, has_address: true, has_phone: true });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    const issue = issues.find((i) => i.type === 'missing_price_range');
    assert.ok(issue, 'should have missing_price_range');
    assert.equal(issue.severity, 'low');
  });

  it('flags nap_inconsistency when text phone differs from schema phone', () => {
    const s = signals({
      has_localbusiness_schema: true,
      has_address: true,
      has_phone: true,
      detected_phone: '555-999-0000',
    });
    // HTML body has a different phone number (outside JSON-LD)
    const html = '<p>Call us at (555) 111-2222 for reservations.</p>';
    const issues = classifyLocalBusinessIssues(s, html, BASE_URL);
    const issue = issues.find((i) => i.type === 'nap_inconsistency');
    assert.ok(issue, 'should have nap_inconsistency');
    assert.equal(issue.severity, 'high');
  });

  it('does NOT flag nap_inconsistency when text phone matches schema phone', () => {
    const s = signals({
      has_localbusiness_schema: true,
      has_address: true,
      has_phone: true,
      detected_phone: '5551234567',
    });
    const html = '<p>Call (555) 123-4567 today.</p>';
    const issues = classifyLocalBusinessIssues(s, html, BASE_URL);
    assert.ok(!issues.find((i) => i.type === 'nap_inconsistency'));
  });

  it('no issues when all signals are present and complete', () => {
    const issues = classifyLocalBusinessIssues(FULL_SIGNALS, '', BASE_URL);
    assert.equal(issues.length, 0);
  });

  it('returns issues sorted high → medium → low', () => {
    const s = signals({
      has_localbusiness_schema: true,
      has_address: false,    // high
      has_phone: true,
      has_hours: false,      // medium
      has_geo: false,        // medium
      has_same_as: false,    // medium
      has_price_range: false,// low
    });
    const issues = classifyLocalBusinessIssues(s, '', BASE_URL);
    const sevOrder = issues.map((i) => i.severity);
    for (let i = 1; i < sevOrder.length; i++) {
      const prev = sevOrder[i - 1]!;
      const curr = sevOrder[i]!;
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      assert.ok(
        (order[prev] ?? 3) <= (order[curr] ?? 3),
        `Expected sorted: ${sevOrder.join(', ')}`,
      );
    }
  });

  it('never throws on null html', () => {
    assert.doesNotThrow(() =>
      classifyLocalBusinessIssues(signals(), null as unknown as string, BASE_URL),
    );
  });

  it('never throws on null signals', () => {
    assert.doesNotThrow(() =>
      classifyLocalBusinessIssues(null as unknown as LocalBusinessSignals, '', BASE_URL),
    );
  });

  it('issue descriptions are non-empty strings', () => {
    const issues = classifyLocalBusinessIssues(signals(), '', BASE_URL);
    for (const issue of issues) {
      assert.ok(issue.description.length > 0);
      assert.ok(issue.recommendation.length > 0);
    }
  });
});
