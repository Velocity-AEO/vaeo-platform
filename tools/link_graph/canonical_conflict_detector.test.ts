import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCanonicalConflicts,
  resolveCanonicalChain,
  groupConflictsByType,
  prioritizeConflicts,
  scanSiteForCanonicalConflicts,
  type CanonicalConflict,
  type CanonicalConflictType,
} from './canonical_conflict_detector.js';
import type { InternalLink, PageNode } from './link_graph_types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLink(src: string, dst: string): InternalLink {
  return {
    source_url: src, destination_url: dst, anchor_text: 'link', link_type: 'body_content',
    link_source: 'html_static', is_nofollow: false, is_redirect: false,
    redirect_destination: null, position_in_page: 0, discovered_at: new Date().toISOString(),
  };
}

function makeNode(url: string, overrides?: Partial<PageNode>): PageNode {
  return {
    url, site_id: 'site_1', title: 'Page', is_canonical: true, canonical_url: url,
    is_noindex: false, is_paginated: false, pagination_root: null,
    depth_from_homepage: 1, inbound_internal_count: 1, outbound_internal_count: 1,
    outbound_external_count: 0, total_link_count: 1, is_in_sitemap: true,
    is_orphaned: false, is_dead_end: false, has_redirect_chain: false,
    link_equity_score: null, last_crawled_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── detectCanonicalConflicts ─────────────────────────────────────────────────

describe('detectCanonicalConflicts', () => {
  it('finds links_to_non_canonical', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/page?sort=1')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/page?sort=1', { is_canonical: false, canonical_url: 'https://a.com/page' }),
      makeNode('https://a.com/page'),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.ok(conflicts.some((c) => c.conflict_type === 'links_to_non_canonical'));
  });

  it('finds canonical_chain', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/a')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/a', { is_canonical: false, canonical_url: 'https://a.com/b' }),
      makeNode('https://a.com/b', { canonical_url: 'https://a.com/c' }),
      makeNode('https://a.com/c'),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.ok(conflicts.some((c) => c.conflict_type === 'canonical_chain'));
  });

  it('finds self_canonical_mismatch', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/old')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/old', { is_canonical: true, canonical_url: 'https://a.com/new' }),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.ok(conflicts.some((c) => c.conflict_type === 'self_canonical_mismatch'));
  });

  it('finds missing_canonical_on_target', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/dup')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/dup', { canonical_url: null, is_noindex: false, inbound_internal_count: 5 }),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.ok(conflicts.some((c) => c.conflict_type === 'missing_canonical_on_target'));
  });

  it('deduplicates source+destination pairs', () => {
    const links = [
      makeLink('https://a.com/', 'https://a.com/page?v=1'),
      makeLink('https://a.com/', 'https://a.com/page?v=1'),
    ];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/page?v=1', { is_canonical: false, canonical_url: 'https://a.com/page' }),
      makeNode('https://a.com/page'),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.equal(conflicts.length, 1);
  });

  it('sets equity_impact high for links_to_non_canonical', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/x')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/x', { is_canonical: false, canonical_url: 'https://a.com/y' }),
      makeNode('https://a.com/y'),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.equal(conflicts[0]?.equity_impact, 'high');
  });

  it('sets fix_action correctly for auto-fixable', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/x')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/x', { is_canonical: false, canonical_url: 'https://a.com/y' }),
      makeNode('https://a.com/y'),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.equal(conflicts[0]?.fix_action, 'update_link_to_canonical');
  });

  it('sets fix_href for update type', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/x')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/x', { is_canonical: false, canonical_url: 'https://a.com/y' }),
      makeNode('https://a.com/y'),
    ];
    const conflicts = detectCanonicalConflicts(links, nodes);
    assert.equal(conflicts[0]?.fix_href, 'https://a.com/y');
  });

  it('returns [] for empty input', () => {
    assert.deepEqual(detectCanonicalConflicts([], []), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectCanonicalConflicts(null as any, null as any));
  });
});

// ── resolveCanonicalChain ────────────────────────────────────────────────────

describe('resolveCanonicalChain', () => {
  it('follows chain to end', () => {
    const nodes = [
      makeNode('https://a.com/a', { canonical_url: 'https://a.com/b' }),
      makeNode('https://a.com/b', { canonical_url: 'https://a.com/c' }),
      makeNode('https://a.com/c'),
    ];
    assert.equal(resolveCanonicalChain('https://a.com/a', nodes, 5), 'https://a.com/c');
  });

  it('respects max_depth', () => {
    const nodes = [
      makeNode('https://a.com/a', { canonical_url: 'https://a.com/b' }),
      makeNode('https://a.com/b', { canonical_url: 'https://a.com/c' }),
      makeNode('https://a.com/c', { canonical_url: 'https://a.com/d' }),
    ];
    const result = resolveCanonicalChain('https://a.com/a', nodes, 1);
    assert.equal(result, 'https://a.com/b');
  });

  it('returns start_url when no canonical', () => {
    const nodes = [makeNode('https://a.com/x')];
    assert.equal(resolveCanonicalChain('https://a.com/x', nodes, 5), 'https://a.com/x');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => resolveCanonicalChain(null as any, null as any, null as any));
  });
});

// ── groupConflictsByType ─────────────────────────────────────────────────────

describe('groupConflictsByType', () => {
  it('groups correctly', () => {
    const conflicts: CanonicalConflict[] = [
      { source_url: 'a', linked_url: 'b', canonical_url: 'c', conflict_type: 'links_to_non_canonical', equity_impact: 'high', fix_action: 'update_link_to_canonical', fix_href: 'c', description: '' },
      { source_url: 'x', linked_url: 'y', canonical_url: null, conflict_type: 'missing_canonical_on_target', equity_impact: 'low', fix_action: 'add_canonical_to_target', fix_href: null, description: '' },
    ];
    const grouped = groupConflictsByType(conflicts);
    assert.equal(grouped.links_to_non_canonical.length, 1);
    assert.equal(grouped.missing_canonical_on_target.length, 1);
    assert.equal(grouped.canonical_chain.length, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => groupConflictsByType(null as any));
  });
});

// ── prioritizeConflicts ──────────────────────────────────────────────────────

describe('prioritizeConflicts', () => {
  it('sorts high impact first', () => {
    const conflicts: CanonicalConflict[] = [
      { source_url: '', linked_url: '', canonical_url: null, conflict_type: 'missing_canonical_on_target', equity_impact: 'low', fix_action: 'investigate', fix_href: null, description: '' },
      { source_url: '', linked_url: '', canonical_url: '', conflict_type: 'links_to_non_canonical', equity_impact: 'high', fix_action: 'update_link_to_canonical', fix_href: '', description: '' },
    ];
    const sorted = prioritizeConflicts(conflicts);
    assert.equal(sorted[0].equity_impact, 'high');
  });

  it('sorts by type within same impact', () => {
    const conflicts: CanonicalConflict[] = [
      { source_url: '', linked_url: '', canonical_url: '', conflict_type: 'canonical_chain', equity_impact: 'high', fix_action: 'update_link_to_canonical', fix_href: '', description: '' },
      { source_url: '', linked_url: '', canonical_url: '', conflict_type: 'links_to_non_canonical', equity_impact: 'high', fix_action: 'update_link_to_canonical', fix_href: '', description: '' },
    ];
    const sorted = prioritizeConflicts(conflicts);
    assert.equal(sorted[0].conflict_type, 'links_to_non_canonical');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => prioritizeConflicts(null as any));
  });
});

// ── scanSiteForCanonicalConflicts ────────────────────────────────────────────

describe('scanSiteForCanonicalConflicts', () => {
  it('returns empty on error', async () => {
    const result = await scanSiteForCanonicalConflicts('site_1', {
      loadLinksFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.total_conflicts, 0);
  });

  it('counts high_impact correctly', async () => {
    const links = [makeLink('https://a.com/', 'https://a.com/x')];
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/x', { is_canonical: false, canonical_url: 'https://a.com/y' }),
      makeNode('https://a.com/y'),
    ];
    const result = await scanSiteForCanonicalConflicts('site_1', {
      loadLinksFn: async () => links,
      loadPagesFn: async () => nodes,
    });
    assert.ok(result.high_impact_count >= 1);
  });

  it('all deps injectable', async () => {
    let calledSite = '';
    await scanSiteForCanonicalConflicts('test_site', {
      loadLinksFn: async (s) => { calledSite = s; return []; },
      loadPagesFn: async () => [],
    });
    assert.equal(calledSite, 'test_site');
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => scanSiteForCanonicalConflicts(null as any, null as any));
  });
});
