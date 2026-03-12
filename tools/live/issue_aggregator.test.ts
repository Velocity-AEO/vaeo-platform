/**
 * tools/live/issue_aggregator.test.ts
 *
 * Tests for issue aggregator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssueFromPage,
  aggregateIssues,
  type AggregatedIssue,
} from './issue_aggregator.js';
import type { DiscoveredPage } from './page_discovery.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function page(url: string): DiscoveredPage {
  return {
    url,
    status_code: 200,
    depth: 1,
    page_type: 'product',
    priority: 'high',
  };
}

const FIX_TYPES = [
  'title_missing',
  'meta_description_missing',
  'image_alt_missing',
  'schema_missing',
  'canonical_missing',
  'lang_missing',
];

// ── buildIssueFromPage ───────────────────────────────────────────────────────

describe('buildIssueFromPage', () => {
  it('maps title_missing to critical severity', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'title_missing');
    assert.equal(issue.severity, 'critical');
  });

  it('maps meta_description_missing to high severity', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'meta_description_missing');
    assert.equal(issue.severity, 'high');
  });

  it('maps schema_missing to high severity', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'schema_missing');
    assert.equal(issue.severity, 'high');
  });

  it('maps image_alt_missing to medium severity', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'image_alt_missing');
    assert.equal(issue.severity, 'medium');
  });

  it('maps lang_missing to low severity', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'lang_missing');
    assert.equal(issue.severity, 'low');
  });

  it('sets auto_fixable to true for known fix types', () => {
    for (const ft of FIX_TYPES) {
      const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', ft);
      assert.equal(issue.auto_fixable, true, `${ft} should be auto_fixable`);
    }
  });

  it('sets confidence to 0.9 for critical/high', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'title_missing');
    assert.equal(issue.confidence, 0.9);
  });

  it('sets confidence to 0.75 for medium/low', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'image_alt_missing');
    assert.equal(issue.confidence, 0.75);
  });

  it('generates issue_id starting with iss_', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'title_missing');
    assert.ok(issue.issue_id.startsWith('iss_'));
  });

  it('sets detected_at to ISO string', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'title_missing');
    assert.ok(issue.detected_at.includes('T'));
  });

  it('maps unknown fix_type to low severity', () => {
    const issue = buildIssueFromPage(page('https://x.com/'), 'site_1', 'unknown_type');
    assert.equal(issue.severity, 'low');
  });
});

// ── aggregateIssues ──────────────────────────────────────────────────────────

describe('aggregateIssues', () => {
  const pages = [
    page('https://example.com/'),
    page('https://example.com/products/a'),
    page('https://example.com/products/b'),
  ];

  it('returns total_issues count', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    assert.ok(agg.total_issues > 0);
  });

  it('by_severity sums to total_issues', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    const sum = Object.values(agg.by_severity).reduce((a, b) => a + b, 0);
    assert.equal(sum, agg.total_issues);
  });

  it('by_fix_type sums to total_issues', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    const sum = Object.values(agg.by_fix_type).reduce((a, b) => a + b, 0);
    assert.equal(sum, agg.total_issues);
  });

  it('is deterministic — same inputs same output count', () => {
    const a = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    const b = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    assert.equal(a.total_issues, b.total_issues);
  });

  it('auto_fixable_count + requires_review_count = total', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    assert.equal(agg.auto_fixable_count + agg.requires_review_count, agg.total_issues);
  });

  it('sets aggregated_at', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    assert.ok(agg.aggregated_at.includes('T'));
  });

  it('handles empty pages', () => {
    const agg = aggregateIssues('site_1', 'run_1', [], FIX_TYPES);
    assert.equal(agg.total_issues, 0);
  });

  it('handles empty fix_types', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, []);
    assert.equal(agg.total_issues, 0);
  });

  it('preserves site_id and run_id', () => {
    const agg = aggregateIssues('site_1', 'run_1', pages, FIX_TYPES);
    assert.equal(agg.site_id, 'site_1');
    assert.equal(agg.run_id, 'run_1');
  });
});
