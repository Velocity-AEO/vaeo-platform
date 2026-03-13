import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkForMissingHomepage,
  checkForDuplicateNodes,
  checkForOrphanedLinkRefs,
  checkForInvalidDepths,
  countDisconnectedComponents,
  checkGraphIntegrity,
} from './graph_integrity_checker.js';
import type { PageNode, InternalLink } from './link_graph_types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(url: string, overrides?: Partial<PageNode>): PageNode {
  return {
    url, site_id: 'site_1', title: 'Page', is_canonical: true, canonical_url: url,
    is_noindex: false, is_paginated: false, pagination_root: null,
    depth_from_homepage: 1, inbound_internal_count: 1, outbound_internal_count: 1,
    outbound_external_count: 0, total_link_count: 1, is_in_sitemap: true,
    is_orphaned: false, is_dead_end: false, has_redirect_chain: false,
    link_equity_score: 0.5, last_crawled_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeLink(src: string, dst: string): InternalLink {
  return {
    source_url: src, destination_url: dst, anchor_text: 'link', link_type: 'body_content',
    link_source: 'html_static', is_nofollow: false, is_redirect: false,
    redirect_destination: null, position_in_page: 0, discovered_at: new Date().toISOString(),
  };
}

// ── checkForMissingHomepage ─────────────────────────────────────────────────

describe('checkForMissingHomepage', () => {
  it('returns true when homepage absent', () => {
    const nodes = [makeNode('https://example.com/about'), makeNode('https://example.com/blog')];
    assert.equal(checkForMissingHomepage(nodes, 'example.com'), true);
  });

  it('returns false when homepage present', () => {
    const nodes = [makeNode('https://example.com/'), makeNode('https://example.com/about')];
    assert.equal(checkForMissingHomepage(nodes, 'example.com'), false);
  });

  it('returns false for homepage without trailing slash', () => {
    const nodes = [makeNode('https://example.com')];
    assert.equal(checkForMissingHomepage(nodes, 'example.com'), false);
  });

  it('handles www prefix', () => {
    const nodes = [makeNode('https://www.example.com/')];
    assert.equal(checkForMissingHomepage(nodes, 'example.com'), false);
  });

  it('returns true for empty nodes', () => {
    assert.equal(checkForMissingHomepage([], 'example.com'), true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => checkForMissingHomepage(null as any, null as any));
  });
});

// ── checkForDuplicateNodes ──────────────────────────────────────────────────

describe('checkForDuplicateNodes', () => {
  it('returns count of duplicate URLs', () => {
    const nodes = [
      makeNode('https://a.com/p1'),
      makeNode('https://a.com/p1'),
      makeNode('https://a.com/p2'),
    ];
    assert.equal(checkForDuplicateNodes(nodes), 1);
  });

  it('returns 0 for unique nodes', () => {
    const nodes = [makeNode('https://a.com/p1'), makeNode('https://a.com/p2')];
    assert.equal(checkForDuplicateNodes(nodes), 0);
  });

  it('returns 0 for empty array', () => {
    assert.equal(checkForDuplicateNodes([]), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => checkForDuplicateNodes(null as any));
  });
});

// ── checkForOrphanedLinkRefs ────────────────────────────────────────────────

describe('checkForOrphanedLinkRefs', () => {
  it('returns count of missing node references', () => {
    const links = [
      makeLink('https://a.com/', 'https://a.com/p1'),
      makeLink('https://a.com/', 'https://a.com/missing'),
    ];
    const nodes = [makeNode('https://a.com/'), makeNode('https://a.com/p1')];
    assert.equal(checkForOrphanedLinkRefs(links, nodes), 1);
  });

  it('returns 0 when all links have targets', () => {
    const links = [makeLink('https://a.com/', 'https://a.com/p1')];
    const nodes = [makeNode('https://a.com/'), makeNode('https://a.com/p1')];
    assert.equal(checkForOrphanedLinkRefs(links, nodes), 0);
  });

  it('returns 0 for empty inputs', () => {
    assert.equal(checkForOrphanedLinkRefs([], []), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => checkForOrphanedLinkRefs(null as any, null as any));
  });
});

// ── checkForInvalidDepths ───────────────────────────────────────────────────

describe('checkForInvalidDepths', () => {
  it('returns count of invalid values', () => {
    const nodes = [
      makeNode('https://a.com/', { depth_from_homepage: 1 }),
      makeNode('https://a.com/bad', { depth_from_homepage: -5 }),
    ];
    assert.equal(checkForInvalidDepths(nodes), 1);
  });

  it('excludes -1 (unreachable)', () => {
    const nodes = [makeNode('https://a.com/', { depth_from_homepage: -1 })];
    assert.equal(checkForInvalidDepths(nodes), 0);
  });

  it('returns 0 for valid depths', () => {
    const nodes = [
      makeNode('https://a.com/', { depth_from_homepage: 0 }),
      makeNode('https://a.com/p', { depth_from_homepage: 2 }),
    ];
    assert.equal(checkForInvalidDepths(nodes), 0);
  });

  it('returns 0 for empty array', () => {
    assert.equal(checkForInvalidDepths([]), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => checkForInvalidDepths(null as any));
  });
});

// ── countDisconnectedComponents ─────────────────────────────────────────────

describe('countDisconnectedComponents', () => {
  it('returns 1 for fully connected graph', () => {
    const nodes = [makeNode('https://a.com/'), makeNode('https://a.com/p1'), makeNode('https://a.com/p2')];
    const links = [
      makeLink('https://a.com/', 'https://a.com/p1'),
      makeLink('https://a.com/p1', 'https://a.com/p2'),
    ];
    assert.equal(countDisconnectedComponents(nodes, links), 1);
  });

  it('returns correct count for split graph', () => {
    const nodes = [
      makeNode('https://a.com/'),
      makeNode('https://a.com/p1'),
      makeNode('https://a.com/isolated1'),
      makeNode('https://a.com/isolated2'),
    ];
    const links = [
      makeLink('https://a.com/', 'https://a.com/p1'),
      makeLink('https://a.com/isolated1', 'https://a.com/isolated2'),
    ];
    assert.equal(countDisconnectedComponents(nodes, links), 2);
  });

  it('returns count equal to nodes when no links', () => {
    const nodes = [makeNode('https://a.com/'), makeNode('https://a.com/p1')];
    assert.equal(countDisconnectedComponents(nodes, []), 2);
  });

  it('returns 0 for empty nodes', () => {
    assert.equal(countDisconnectedComponents([], []), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => countDisconnectedComponents(null as any, null as any));
  });
});

// ── checkGraphIntegrity ─────────────────────────────────────────────────────

describe('checkGraphIntegrity', () => {
  it('is_valid=false for critical issues (missing homepage)', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => ({
        pages: [makeNode('https://example.com/about')],
        internal_links: [],
        external_link_count: 0,
        site_domain: 'example.com',
      }),
    });
    assert.equal(result.is_valid, false);
    assert.ok(result.issues.some((i) => i.type === 'missing_homepage'));
  });

  it('is_valid=true for no critical issues', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => ({
        pages: [makeNode('https://example.com/'), makeNode('https://example.com/about')],
        internal_links: [makeLink('https://example.com/', 'https://example.com/about')],
        external_link_count: 5,
        site_domain: 'example.com',
      }),
    });
    assert.equal(result.is_valid, true);
  });

  it('returns failed report on error', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.is_valid, false);
  });

  it('returns failed report for null graph', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => null,
    });
    assert.equal(result.is_valid, false);
  });

  it('has all fields in GraphIntegrityReport', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => ({
        pages: [makeNode('https://a.com/')],
        internal_links: [],
        external_link_count: 3,
        site_domain: 'a.com',
      }),
    });
    assert.equal(typeof result.site_id, 'string');
    assert.equal(typeof result.checked_at, 'string');
    assert.equal(typeof result.is_valid, 'boolean');
    assert.ok(Array.isArray(result.issues));
    assert.equal(typeof result.page_count, 'number');
    assert.equal(typeof result.internal_link_count, 'number');
    assert.equal(typeof result.external_link_count, 'number');
    assert.equal(typeof result.orphaned_count, 'number');
    assert.equal(typeof result.duplicate_nodes, 'number');
    assert.equal(typeof result.missing_homepage, 'boolean');
    assert.equal(typeof result.disconnected_components, 'number');
  });

  it('detects duplicate nodes', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => ({
        pages: [makeNode('https://a.com/'), makeNode('https://a.com/p'), makeNode('https://a.com/p')],
        internal_links: [],
        external_link_count: 0,
        site_domain: 'a.com',
      }),
    });
    assert.ok(result.duplicate_nodes > 0);
  });

  it('detects orphaned link references', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => ({
        pages: [makeNode('https://a.com/')],
        internal_links: [makeLink('https://a.com/', 'https://a.com/missing')],
        external_link_count: 0,
        site_domain: 'a.com',
      }),
    });
    assert.ok(result.issues.some((i) => i.type === 'orphaned_link_references'));
  });

  it('detects disconnected components', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadGraphFn: async () => ({
        pages: [
          makeNode('https://a.com/'),
          makeNode('https://a.com/p1'),
          makeNode('https://a.com/island'),
        ],
        internal_links: [makeLink('https://a.com/', 'https://a.com/p1')],
        external_link_count: 0,
        site_domain: 'a.com',
      }),
    });
    assert.ok(result.disconnected_components >= 2);
  });

  it('all deps injectable', async () => {
    let calledSite = '';
    await checkGraphIntegrity('test_site', {
      loadGraphFn: async (s) => { calledSite = s; return null; },
    });
    assert.equal(calledSite, 'test_site');
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => checkGraphIntegrity(null as any, null as any));
  });
});
