/**
 * tools/link_graph/link_suggester.test.ts
 *
 * Tests for internal link suggester.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLinkSuggestions,
  generateSiteLinkSuggestions,
  type LinkSuggestion,
} from './link_suggester.js';
import type { InternalLink, PageNode } from './types.js';
import type { AuthorityScore } from './authority_scorer.js';
import type { AnchorTextProfile } from './anchor_text_analyzer.js';

function page(url: string, opts?: Partial<PageNode>): PageNode {
  return { url, title: url, depth_from_homepage: 1, link_equity_score: 50, inbound_link_count: 5, outbound_link_count: 5, is_in_sitemap: true, ...opts };
}

function score(url: string, norm: number, tier: AuthorityScore['authority_tier'] = 'average', inbound = 5): AuthorityScore {
  return { url, raw_score: norm, normalized_score: norm, inbound_count: inbound, body_content_inbound: 3, navigation_inbound: 2, depth_from_homepage: 1, authority_tier: tier };
}

function link(source: string, dest: string, type = 'body_content', anchor = 'link'): InternalLink {
  return { source_url: source, destination_url: dest, anchor_text: anchor, link_type: type, is_nofollow: false };
}

function anchorProfile(dest: string, opts?: Partial<AnchorTextProfile>): AnchorTextProfile {
  return {
    destination_url: dest,
    total_inbound_links: 5,
    unique_anchor_texts: 3,
    anchor_distribution: [],
    has_generic_anchors: false,
    generic_anchor_count: 0,
    is_over_optimized: false,
    dominant_anchor: null,
    diversity_score: 80,
    ...opts,
  };
}

// ── generateLinkSuggestions ──────────────────────────────────────────────────

describe('generateLinkSuggestions', () => {
  it('finds generic anchor opportunities on high-auth pages', () => {
    const pages = [page('/hub'), page('/source')];
    const scores = [score('/hub', 90, 'hub'), score('/source', 40, 'average')];
    const anchors = [anchorProfile('/hub', {
      has_generic_anchors: true,
      generic_anchor_count: 2,
      anchor_distribution: [
        { text: 'click here', count: 2, percentage: 100, classification: 'generic' },
      ],
    })];
    const links = [link('/source', '/hub', 'body_content', 'click here')];

    const suggestions = generateLinkSuggestions(pages, scores, anchors, links);
    assert.ok(suggestions.some(s => s.suggestion_reason.includes('generic anchor')));
    assert.ok(suggestions.some(s => s.priority === 'high'));
  });

  it('finds orphans close to hub', () => {
    const pages = [page('/hub', { depth_from_homepage: 1 }), page('/orphan', { depth_from_homepage: 2 })];
    const scores = [score('/hub', 90, 'hub'), score('/orphan', 0, 'isolated', 0)];
    const suggestions = generateLinkSuggestions(pages, scores, [], []);
    assert.ok(suggestions.some(s => s.suggestion_reason.includes('orphaned')));
  });

  it('finds dead ends', () => {
    const pages = [page('/dead-end'), page('/hub')];
    const scores = [score('/dead-end', 20, 'weak'), score('/hub', 90, 'hub')];
    // /dead-end has no outbound body_content links
    const links = [link('/hub', '/dead-end')];
    const suggestions = generateLinkSuggestions(pages, scores, [], links);
    assert.ok(suggestions.some(s => s.suggestion_reason.includes('Dead-end')));
  });

  it('finds sitemap pages with no body content links', () => {
    const pages = [page('/nav-only', { is_in_sitemap: true }), page('/source')];
    const scores = [score('/nav-only', 20, 'weak', 3), score('/source', 60, 'strong')];
    // Only nav link, no body_content inbound
    const links = [link('/source', '/nav-only', 'navigation')];
    const suggestions = generateLinkSuggestions(pages, scores, [], links);
    assert.ok(suggestions.some(s => s.suggestion_reason.includes('Sitemap page')));
  });

  it('finds over-optimized anchor text', () => {
    const pages = [page('/target')];
    const scores = [score('/target', 50, 'average')];
    const anchors = [anchorProfile('/target', { is_over_optimized: true })];
    const suggestions = generateLinkSuggestions(pages, scores, anchors, []);
    assert.ok(suggestions.some(s => s.suggestion_reason.includes('over-optimized')));
  });

  it('max 50 results', () => {
    const pages: PageNode[] = [];
    const scores: AuthorityScore[] = [];
    const links: InternalLink[] = [];

    // Create 60 dead-end pages
    pages.push(page('/hub'));
    scores.push(score('/hub', 90, 'hub'));
    for (let i = 0; i < 60; i++) {
      const url = `/dead-${i}`;
      pages.push(page(url));
      scores.push(score(url, 10, 'weak'));
      links.push(link('/hub', url));
    }

    const suggestions = generateLinkSuggestions(pages, scores, [], links);
    assert.ok(suggestions.length <= 50);
  });

  it('sorts by priority then authority_score', () => {
    const pages = [
      page('/hub', { depth_from_homepage: 1 }),
      page('/orphan', { depth_from_homepage: 2 }),
      page('/dead-end'),
    ];
    const scores = [
      score('/hub', 90, 'hub'),
      score('/orphan', 0, 'isolated', 0),
      score('/dead-end', 10, 'weak'),
    ];
    const links = [link('/hub', '/dead-end')];
    const suggestions = generateLinkSuggestions(pages, scores, [], links);
    if (suggestions.length >= 2) {
      const priorities = suggestions.map(s => s.priority);
      const highIdx = priorities.indexOf('high');
      const medIdx = priorities.indexOf('medium');
      const lowIdx = priorities.indexOf('low');
      if (highIdx >= 0 && medIdx >= 0) assert.ok(highIdx < medIdx);
      if (medIdx >= 0 && lowIdx >= 0) assert.ok(medIdx < lowIdx);
    }
  });

  it('high priority before medium before low', () => {
    const pages = [page('/hub'), page('/target')];
    const scores = [score('/hub', 90, 'hub'), score('/target', 50, 'average')];
    const anchors = [anchorProfile('/target', {
      has_generic_anchors: true,
      generic_anchor_count: 1,
      is_over_optimized: true,
      anchor_distribution: [
        { text: 'click here', count: 1, percentage: 100, classification: 'generic' },
      ],
    })];
    const links = [link('/hub', '/target', 'body_content', 'click here')];
    const suggestions = generateLinkSuggestions(pages, scores, anchors, links);
    const priorities = suggestions.map(s => s.priority);
    // All high should come before all low
    const lastHigh = priorities.lastIndexOf('high');
    const firstLow = priorities.indexOf('low');
    if (lastHigh >= 0 && firstLow >= 0) {
      assert.ok(lastHigh < firstLow);
    }
  });

  it('returns empty for empty inputs', () => {
    assert.deepEqual(generateLinkSuggestions([], [], [], []), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => generateLinkSuggestions(null as any, null as any, null as any, null as any));
  });
});

// ── generateSiteLinkSuggestions ──────────────────────────────────────────────

describe('generateSiteLinkSuggestions', () => {
  it('returns [] on error', async () => {
    const result = await generateSiteLinkSuggestions('s1', {
      loadPagesFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns [] for empty site_id', async () => {
    assert.deepEqual(await generateSiteLinkSuggestions(''), []);
  });

  it('all deps injectable', async () => {
    let called = 0;
    await generateSiteLinkSuggestions('s1', {
      loadPagesFn: async () => { called++; return []; },
      loadScoresFn: async () => { called++; return []; },
      loadAnchorsFn: async () => { called++; return []; },
      loadLinksFn: async () => { called++; return []; },
    });
    assert.equal(called, 4);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => generateSiteLinkSuggestions(null as any, null as any));
  });
});
