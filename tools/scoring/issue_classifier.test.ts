/**
 * tools/scoring/issue_classifier.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFields, type FieldSnapshot, type IssueReport } from './issue_classifier.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function snap(overrides: Partial<FieldSnapshot> & { url?: string; field_type?: string }): FieldSnapshot {
  return {
    url:           'https://example.com/page',
    field_type:    'title',
    current_value: 'Default Title Value Here for Testing',
    char_count:    37,
    ...overrides,
  };
}

function findIssues(reports: IssueReport[], issueType: string): IssueReport[] {
  return reports.filter((r) => r.issue_type === issueType);
}

// ── Title rules ──────────────────────────────────────────────────────────────

describe('title rules', () => {
  it('title_missing: fires when current_value is null', () => {
    const issues = classifyFields([snap({ current_value: null, char_count: 0 })]);
    const found = findIssues(issues, 'title_missing');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'critical');
    assert.equal(found[0].points_deducted, 3);
  });

  it('title_missing: fires when current_value is empty string', () => {
    const issues = classifyFields([snap({ current_value: '', char_count: 0 })]);
    assert.equal(findIssues(issues, 'title_missing').length, 1);
  });

  it('title_missing: fires when current_value is whitespace only', () => {
    const issues = classifyFields([snap({ current_value: '   ', char_count: 3 })]);
    assert.equal(findIssues(issues, 'title_missing').length, 1);
  });

  it('title_too_short: fires when char_count < 30', () => {
    const issues = classifyFields([snap({ current_value: 'Short', char_count: 5 })]);
    const found = findIssues(issues, 'title_too_short');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'minor');
    assert.equal(found[0].points_deducted, 1);
  });

  it('title_too_short: does not fire at exactly 30 chars', () => {
    const issues = classifyFields([snap({ current_value: 'x'.repeat(30), char_count: 30 })]);
    assert.equal(findIssues(issues, 'title_too_short').length, 0);
  });

  it('title_too_short: does not fire when value is missing (missing takes priority)', () => {
    const issues = classifyFields([snap({ current_value: null, char_count: 0 })]);
    assert.equal(findIssues(issues, 'title_too_short').length, 0);
  });

  it('title_too_long: fires when char_count > 60', () => {
    const issues = classifyFields([snap({ current_value: 'x'.repeat(61), char_count: 61 })]);
    const found = findIssues(issues, 'title_too_long');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'minor');
    assert.equal(found[0].points_deducted, 1);
  });

  it('title_too_long: does not fire at exactly 60 chars', () => {
    const issues = classifyFields([snap({ current_value: 'x'.repeat(60), char_count: 60 })]);
    assert.equal(findIssues(issues, 'title_too_long').length, 0);
  });

  it('title_duplicate: fires when 2+ URLs share the same title', () => {
    const issues = classifyFields([
      snap({ url: 'https://example.com/a', current_value: 'Same Title', char_count: 10 }),
      snap({ url: 'https://example.com/b', current_value: 'Same Title', char_count: 10 }),
    ]);
    const found = findIssues(issues, 'title_duplicate');
    assert.equal(found.length, 2); // one report per URL
    assert.equal(found[0].severity, 'major');
    assert.equal(found[0].points_deducted, 2);
  });

  it('title_duplicate: does not fire for unique titles', () => {
    const issues = classifyFields([
      snap({ url: 'https://example.com/a', current_value: 'Title A', char_count: 7 }),
      snap({ url: 'https://example.com/b', current_value: 'Title B', char_count: 7 }),
    ]);
    assert.equal(findIssues(issues, 'title_duplicate').length, 0);
  });

  it('title_duplicate: does not fire for empty values', () => {
    const issues = classifyFields([
      snap({ url: 'https://example.com/a', current_value: '', char_count: 0 }),
      snap({ url: 'https://example.com/b', current_value: '', char_count: 0 }),
    ]);
    assert.equal(findIssues(issues, 'title_duplicate').length, 0);
  });

  it('title_duplicate: fires for 3+ URLs with same title', () => {
    const issues = classifyFields([
      snap({ url: 'https://example.com/a', current_value: 'Dupe', char_count: 4 }),
      snap({ url: 'https://example.com/b', current_value: 'Dupe', char_count: 4 }),
      snap({ url: 'https://example.com/c', current_value: 'Dupe', char_count: 4 }),
    ]);
    assert.equal(findIssues(issues, 'title_duplicate').length, 3);
  });
});

// ── Meta description rules ───────────────────────────────────────────────────

describe('meta_description rules', () => {
  it('meta_missing: fires when value is null', () => {
    const issues = classifyFields([snap({ field_type: 'meta_description', current_value: null, char_count: 0 })]);
    const found = findIssues(issues, 'meta_missing');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'major');
    assert.equal(found[0].points_deducted, 2);
  });

  it('meta_missing: fires when value is empty', () => {
    const issues = classifyFields([snap({ field_type: 'meta_description', current_value: '', char_count: 0 })]);
    assert.equal(findIssues(issues, 'meta_missing').length, 1);
  });

  it('meta_too_short: fires when char_count < 120', () => {
    const issues = classifyFields([snap({ field_type: 'meta_description', current_value: 'Short desc', char_count: 10 })]);
    const found = findIssues(issues, 'meta_too_short');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'minor');
  });

  it('meta_too_short: does not fire at exactly 120 chars', () => {
    const issues = classifyFields([snap({ field_type: 'meta_description', current_value: 'x'.repeat(120), char_count: 120 })]);
    assert.equal(findIssues(issues, 'meta_too_short').length, 0);
  });

  it('meta_too_long: fires when char_count > 155', () => {
    const issues = classifyFields([snap({ field_type: 'meta_description', current_value: 'x'.repeat(156), char_count: 156 })]);
    const found = findIssues(issues, 'meta_too_long');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'minor');
  });

  it('meta_too_long: does not fire at exactly 155 chars', () => {
    const issues = classifyFields([snap({ field_type: 'meta_description', current_value: 'x'.repeat(155), char_count: 155 })]);
    assert.equal(findIssues(issues, 'meta_too_long').length, 0);
  });

  it('meta_duplicate: fires when 2+ URLs share the same meta', () => {
    const issues = classifyFields([
      snap({ field_type: 'meta_description', url: 'https://example.com/a', current_value: 'Same meta description text here for test', char_count: 40 }),
      snap({ field_type: 'meta_description', url: 'https://example.com/b', current_value: 'Same meta description text here for test', char_count: 40 }),
    ]);
    const found = findIssues(issues, 'meta_duplicate');
    assert.equal(found.length, 2);
    assert.equal(found[0].severity, 'major');
  });
});

// ── H1 rules ─────────────────────────────────────────────────────────────────

describe('h1 rules', () => {
  it('h1_missing: fires when value is null', () => {
    const issues = classifyFields([snap({ field_type: 'h1', current_value: null, char_count: 0 })]);
    const found = findIssues(issues, 'h1_missing');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'critical');
    assert.equal(found[0].points_deducted, 3);
  });

  it('h1_missing: fires when value is empty', () => {
    const issues = classifyFields([snap({ field_type: 'h1', current_value: '', char_count: 0 })]);
    assert.equal(findIssues(issues, 'h1_missing').length, 1);
  });

  it('h1_multiple: fires when same URL has 2+ non-empty H1 snapshots', () => {
    const issues = classifyFields([
      snap({ field_type: 'h1', url: 'https://example.com/page', current_value: 'First H1', char_count: 8 }),
      snap({ field_type: 'h1', url: 'https://example.com/page', current_value: 'Second H1', char_count: 9 }),
    ]);
    const found = findIssues(issues, 'h1_multiple');
    assert.equal(found.length, 2);
    assert.equal(found[0].severity, 'major');
    assert.equal(found[0].points_deducted, 2);
  });

  it('h1_multiple: does not fire for single H1', () => {
    const issues = classifyFields([
      snap({ field_type: 'h1', current_value: 'Only H1', char_count: 7 }),
    ]);
    assert.equal(findIssues(issues, 'h1_multiple').length, 0);
  });

  it('h1_multiple: does not fire across different URLs', () => {
    const issues = classifyFields([
      snap({ field_type: 'h1', url: 'https://example.com/a', current_value: 'H1 A', char_count: 4 }),
      snap({ field_type: 'h1', url: 'https://example.com/b', current_value: 'H1 B', char_count: 4 }),
    ]);
    assert.equal(findIssues(issues, 'h1_multiple').length, 0);
  });
});

// ── Canonical rules ──────────────────────────────────────────────────────────

describe('canonical rules', () => {
  it('canonical_missing: fires when value is null', () => {
    const issues = classifyFields([snap({ field_type: 'canonical', current_value: null, char_count: 0 })]);
    const found = findIssues(issues, 'canonical_missing');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'critical');
    assert.equal(found[0].points_deducted, 3);
  });

  it('canonical_missing: fires when value is empty', () => {
    const issues = classifyFields([snap({ field_type: 'canonical', current_value: '', char_count: 0 })]);
    assert.equal(findIssues(issues, 'canonical_missing').length, 1);
  });

  it('canonical_missing: does not fire when value present', () => {
    const issues = classifyFields([snap({ field_type: 'canonical', current_value: 'https://example.com/', char_count: 20 })]);
    assert.equal(findIssues(issues, 'canonical_missing').length, 0);
  });
});

// ── Schema rules ─────────────────────────────────────────────────────────────

describe('schema rules', () => {
  it('schema_missing: fires when value is null', () => {
    const issues = classifyFields([snap({ field_type: 'schema', current_value: null, char_count: 0 })]);
    const found = findIssues(issues, 'schema_missing');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'major');
    assert.equal(found[0].points_deducted, 2);
  });

  it('schema_missing: does not fire when value present', () => {
    const issues = classifyFields([snap({ field_type: 'schema', current_value: '{"@type":"Product"}', char_count: 19 })]);
    assert.equal(findIssues(issues, 'schema_missing').length, 0);
  });
});

// ── Mixed scenarios ──────────────────────────────────────────────────────────

describe('mixed scenarios', () => {
  it('returns empty array for clean snapshots', () => {
    const issues = classifyFields([
      snap({ field_type: 'title', current_value: 'A Perfectly Good Page Title Here', char_count: 31 }),
      snap({ field_type: 'meta_description', current_value: 'x'.repeat(130), char_count: 130 }),
      snap({ field_type: 'h1', current_value: 'Main Heading', char_count: 12 }),
      snap({ field_type: 'canonical', current_value: 'https://example.com/page', char_count: 24 }),
      snap({ field_type: 'schema', current_value: '{"@type":"Product"}', char_count: 19 }),
    ]);
    assert.equal(issues.length, 0);
  });

  it('multiple issue types can fire for the same URL', () => {
    const issues = classifyFields([
      snap({ field_type: 'title', current_value: null, char_count: 0 }),
      snap({ field_type: 'h1', current_value: null, char_count: 0 }),
      snap({ field_type: 'canonical', current_value: null, char_count: 0 }),
    ]);
    assert.equal(issues.length, 3);
    const types = issues.map((i) => i.issue_type);
    assert.ok(types.includes('title_missing'));
    assert.ok(types.includes('h1_missing'));
    assert.ok(types.includes('canonical_missing'));
  });

  it('ignores unknown field_type', () => {
    const issues = classifyFields([snap({ field_type: 'og_image', current_value: null, char_count: 0 })]);
    assert.equal(issues.length, 0);
  });

  it('preserves url and current_value in report', () => {
    const issues = classifyFields([
      snap({ url: 'https://shop.com/product/1', field_type: 'title', current_value: 'Hi', char_count: 2 }),
    ]);
    const found = findIssues(issues, 'title_too_short');
    assert.equal(found[0].url, 'https://shop.com/product/1');
    assert.equal(found[0].current_value, 'Hi');
    assert.equal(found[0].char_count, 2);
    assert.equal(found[0].field, 'title');
  });
});
