/**
 * tools/link_graph/link_fix_issue_builder.test.ts
 *
 * Tests for link fix issue builder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRedirectChainIssue,
  buildCanonicalConflictIssue,
  buildGenericAnchorIssue,
  buildBrokenExternalIssue,
  buildAllLinkGraphIssues,
  type SEOIssue,
} from './link_fix_issue_builder.js';
import type { RedirectChain } from './redirect_chain_detector.js';
import type { CanonicalConflict } from './canonical_conflict_detector.js';
import type { AnchorTextProfile } from './anchor_text_analyzer.js';
import type { InternalLink } from './types.js';
import type { ExternalLinkCheckResult } from './external_link_checker.js';

function makeChain(overrides?: Partial<RedirectChain>): RedirectChain {
  return {
    source_url: 'https://example.com/page-a',
    link_url: 'https://example.com/old-path',
    final_url: 'https://example.com/new-path',
    hop_count: 2,
    chain: ['https://example.com/old-path', 'https://example.com/mid', 'https://example.com/new-path'],
    fix_action: 'update_link_to_final',
    ...overrides,
  };
}

function makeConflict(overrides?: Partial<CanonicalConflict>): CanonicalConflict {
  return {
    source_url: 'https://example.com/page-a',
    linked_url: 'https://example.com/page-b?ref=1',
    canonical_url: 'https://example.com/page-b',
    conflict_type: 'links_to_non_canonical',
    equity_impact: 'medium',
    fix_action: 'update_link_to_canonical',
    fix_href: 'https://example.com/page-b',
    description: 'Link points to non-canonical',
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<AnchorTextProfile>): AnchorTextProfile {
  return {
    destination_url: 'https://example.com/products',
    total_inbound_links: 10,
    unique_anchor_texts: 5,
    anchor_distribution: [],
    has_generic_anchors: true,
    generic_anchor_count: 5,
    is_over_optimized: false,
    dominant_anchor: 'click here',
    diversity_score: 40,
    ...overrides,
  };
}

function makeLink(overrides?: Partial<InternalLink>): InternalLink {
  return {
    source_url: 'https://example.com/page-a',
    destination_url: 'https://example.com/products',
    anchor_text: 'click here',
    link_type: 'body_content',
    is_nofollow: false,
    ...overrides,
  };
}

function makeCheck(overrides?: Partial<ExternalLinkCheckResult>): ExternalLinkCheckResult {
  return {
    url: 'https://example.com/page-a',
    destination_url: 'https://broken.com/404',
    destination_domain: 'broken.com',
    status_code: 404,
    is_broken: true,
    is_redirect: false,
    final_url: null,
    redirect_hops: 0,
    response_time_ms: 200,
    is_nofollow: false,
    domain_reputation: 'unknown',
    check_error: null,
    checked_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── buildRedirectChainIssue ──────────────────────────────────────────────────

describe('buildRedirectChainIssue', () => {
  it('returns correct issue_type', () => {
    const issue = buildRedirectChainIssue(makeChain(), 's1');
    assert.equal(issue.issue_type, 'REDIRECT_CHAIN_INTERNAL_LINK');
  });

  it('sets current_value to chain link_url', () => {
    const issue = buildRedirectChainIssue(makeChain(), 's1');
    assert.equal(issue.current_value, 'https://example.com/old-path');
  });

  it('sets expected_value to final_url', () => {
    const issue = buildRedirectChainIssue(makeChain(), 's1');
    assert.equal(issue.expected_value, 'https://example.com/new-path');
  });

  it('severity is medium', () => {
    const issue = buildRedirectChainIssue(makeChain(), 's1');
    assert.equal(issue.severity, 'medium');
  });

  it('description includes hop count', () => {
    const issue = buildRedirectChainIssue(makeChain({ hop_count: 3 }), 's1');
    assert.ok(issue.description.includes('3'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildRedirectChainIssue(null as any, null as any));
  });
});

// ── buildCanonicalConflictIssue ──────────────────────────────────────────────

describe('buildCanonicalConflictIssue', () => {
  it('returns null for non-fixable', () => {
    const issue = buildCanonicalConflictIssue(makeConflict({ fix_action: 'investigate' }), 's1');
    assert.equal(issue, null);
  });

  it('returns issue for update_link_to_canonical', () => {
    const issue = buildCanonicalConflictIssue(makeConflict(), 's1');
    assert.ok(issue);
    assert.equal(issue!.issue_type, 'CANONICAL_CONFLICT_LINK');
  });

  it('sets severity from equity_impact', () => {
    assert.equal(buildCanonicalConflictIssue(makeConflict({ equity_impact: 'high' }), 's1')!.severity, 'high');
    assert.equal(buildCanonicalConflictIssue(makeConflict({ equity_impact: 'low' }), 's1')!.severity, 'low');
  });

  it('description mentions canonical URL', () => {
    const issue = buildCanonicalConflictIssue(makeConflict(), 's1');
    assert.ok(issue!.description.includes('page-b'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildCanonicalConflictIssue(null as any, null as any));
  });
});

// ── buildGenericAnchorIssue ──────────────────────────────────────────────────

describe('buildGenericAnchorIssue', () => {
  it('returns null for fewer than 3 generics', () => {
    const issue = buildGenericAnchorIssue(makeProfile({ generic_anchor_count: 2 }), makeLink(), 's1');
    assert.equal(issue, null);
  });

  it('returns issue for 3+ generics', () => {
    const issue = buildGenericAnchorIssue(makeProfile({ generic_anchor_count: 3 }), makeLink(), 's1');
    assert.ok(issue);
    assert.equal(issue!.issue_type, 'GENERIC_ANCHOR_TEXT');
  });

  it('severity is low', () => {
    const issue = buildGenericAnchorIssue(makeProfile(), makeLink(), 's1');
    assert.equal(issue!.severity, 'low');
  });

  it('description includes count', () => {
    const issue = buildGenericAnchorIssue(makeProfile({ generic_anchor_count: 7 }), makeLink(), 's1');
    assert.ok(issue!.description.includes('7'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildGenericAnchorIssue(null as any, null as any, null as any));
  });
});

// ── buildBrokenExternalIssue ─────────────────────────────────────────────────

describe('buildBrokenExternalIssue', () => {
  it('includes status_code in description', () => {
    const issue = buildBrokenExternalIssue(makeCheck({ status_code: 404 }), 's1');
    assert.ok(issue.description.includes('404'));
  });

  it('sets expected_value to removed', () => {
    const issue = buildBrokenExternalIssue(makeCheck(), 's1');
    assert.equal(issue.expected_value, 'removed');
  });

  it('issue_type is BROKEN_EXTERNAL_LINK_REMOVE', () => {
    const issue = buildBrokenExternalIssue(makeCheck(), 's1');
    assert.equal(issue.issue_type, 'BROKEN_EXTERNAL_LINK_REMOVE');
  });

  it('handles null status_code', () => {
    const issue = buildBrokenExternalIssue(makeCheck({ status_code: null }), 's1');
    assert.ok(issue.description.includes('unreachable'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildBrokenExternalIssue(null as any, null as any));
  });
});

// ── buildAllLinkGraphIssues ──────────────────────────────────────────────────

describe('buildAllLinkGraphIssues', () => {
  it('returns [] on error', async () => {
    const result = await buildAllLinkGraphIssues('s1', {
      loadChainsFn: async () => { throw new Error('boom'); },
      loadConflictsFn: async () => { throw new Error('boom'); },
      loadAnchorsFn: async () => { throw new Error('boom'); },
      loadChecksFn: async () => { throw new Error('boom'); },
    });
    assert.deepEqual(result, []);
  });

  it('deduplicates by type+url+value', async () => {
    const chain = makeChain();
    const result = await buildAllLinkGraphIssues('s1', {
      loadChainsFn: async () => [chain, chain],
    });
    const redirectIssues = result.filter(i => i.issue_type === 'REDIRECT_CHAIN_INTERNAL_LINK');
    assert.equal(redirectIssues.length, 1);
  });

  it('sorts by severity desc', async () => {
    const result = await buildAllLinkGraphIssues('s1', {
      loadChainsFn: async () => [makeChain()], // medium
      loadConflictsFn: async () => [makeConflict({ equity_impact: 'high' })], // high
    });
    assert.equal(result[0].severity, 'high');
    assert.equal(result[1].severity, 'medium');
  });

  it('returns [] for empty site_id', async () => {
    const result = await buildAllLinkGraphIssues('');
    assert.deepEqual(result, []);
  });

  it('all deps injectable', async () => {
    let chainsCalled = false;
    let conflictsCalled = false;
    let anchorsCalled = false;
    let checksCalled = false;
    await buildAllLinkGraphIssues('s1', {
      loadChainsFn: async () => { chainsCalled = true; return []; },
      loadConflictsFn: async () => { conflictsCalled = true; return []; },
      loadAnchorsFn: async () => { anchorsCalled = true; return { profiles: [], links: [] }; },
      loadChecksFn: async () => { checksCalled = true; return []; },
    });
    assert.ok(chainsCalled);
    assert.ok(conflictsCalled);
    assert.ok(anchorsCalled);
    assert.ok(checksCalled);
  });

  it('includes broken external links', async () => {
    const result = await buildAllLinkGraphIssues('s1', {
      loadChecksFn: async () => [makeCheck()],
    });
    assert.ok(result.some(i => i.issue_type === 'BROKEN_EXTERNAL_LINK_REMOVE'));
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => buildAllLinkGraphIssues(null as any, null as any));
  });
});
