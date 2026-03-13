/**
 * tools/link_graph/authority_scorer.test.ts
 *
 * Tests for internal authority scorer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRawAuthority,
  normalizeAuthorityScores,
  classifyAuthorityTier,
  scoreAllPages,
  getTopAuthorityPages,
  AUTHORITY_WEIGHTS,
  type AuthorityScore,
} from './authority_scorer.js';
import type { InternalLink } from './types.js';

function link(source: string, dest: string, type = 'body_content'): InternalLink {
  return { source_url: source, destination_url: dest, anchor_text: 'link', link_type: type, is_nofollow: false };
}

// ── AUTHORITY_WEIGHTS ────────────────────────────────────────────────────────

describe('AUTHORITY_WEIGHTS', () => {
  it('body_content_link is higher than navigation_link', () => {
    assert.ok(AUTHORITY_WEIGHTS.body_content_link > AUTHORITY_WEIGHTS.navigation_link);
  });

  it('body_content_link equals 3.0', () => {
    assert.equal(AUTHORITY_WEIGHTS.body_content_link, 3.0);
  });
});

// ── calculateRawAuthority ────────────────────────────────────────────────────

describe('calculateRawAuthority', () => {
  it('sums weights correctly', () => {
    const links = [link('/a', '/target', 'body_content'), link('/b', '/target', 'body_content')];
    assert.equal(calculateRawAuthority('/target', links), 6);
  });

  it('uses AUTHORITY_WEIGHTS per link_type', () => {
    const links = [link('/a', '/target', 'navigation'), link('/b', '/target', 'footer')];
    assert.equal(calculateRawAuthority('/target', links), 0.8); // 0.5 + 0.3
  });

  it('weights body_content higher than navigation', () => {
    const bodyScore = calculateRawAuthority('/t', [link('/a', '/t', 'body_content')]);
    const navScore = calculateRawAuthority('/t', [link('/a', '/t', 'navigation')]);
    assert.ok(bodyScore > navScore);
  });

  it('returns 0 for no inbound', () => {
    assert.equal(calculateRawAuthority('/target', [link('/a', '/other')]), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateRawAuthority(null as any, null as any));
  });
});

// ── normalizeAuthorityScores ─────────────────────────────────────────────────

describe('normalizeAuthorityScores', () => {
  it('returns 0-100 range', () => {
    const raw = new Map([['a', 10], ['b', 5], ['c', 0]]);
    const norm = normalizeAuthorityScores(raw);
    assert.equal(norm.get('a'), 100);
    assert.equal(norm.get('b'), 50);
    assert.equal(norm.get('c'), 0);
  });

  it('handles empty map', () => {
    assert.equal(normalizeAuthorityScores(new Map()).size, 0);
  });

  it('handles all zeros', () => {
    const raw = new Map([['a', 0], ['b', 0]]);
    const norm = normalizeAuthorityScores(raw);
    assert.equal(norm.get('a'), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => normalizeAuthorityScores(null as any));
  });
});

// ── classifyAuthorityTier ────────────────────────────────────────────────────

describe('classifyAuthorityTier', () => {
  it('returns hub for >= 80', () => {
    assert.equal(classifyAuthorityTier(80, 10), 'hub');
    assert.equal(classifyAuthorityTier(100, 20), 'hub');
  });

  it('returns strong for >= 60', () => {
    assert.equal(classifyAuthorityTier(60, 5), 'strong');
    assert.equal(classifyAuthorityTier(79, 5), 'strong');
  });

  it('returns average for >= 30', () => {
    assert.equal(classifyAuthorityTier(30, 2), 'average');
  });

  it('returns weak for > 0 and < 30', () => {
    assert.equal(classifyAuthorityTier(10, 1), 'weak');
  });

  it('returns isolated for score=0 inbound=0', () => {
    assert.equal(classifyAuthorityTier(0, 0), 'isolated');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => classifyAuthorityTier(NaN, NaN));
  });
});

// ── scoreAllPages ────────────────────────────────────────────────────────────

describe('scoreAllPages', () => {
  it('sorts by score desc', async () => {
    const links = [
      link('/a', '/hub', 'body_content'),
      link('/b', '/hub', 'body_content'),
      link('/c', '/hub', 'body_content'),
      link('/a', '/other', 'footer'),
    ];
    const pages = [
      { url: '/hub', title: 'Hub', depth_from_homepage: 1, link_equity_score: null, inbound_link_count: 3, outbound_link_count: 0, is_in_sitemap: true },
      { url: '/other', title: 'Other', depth_from_homepage: 2, link_equity_score: null, inbound_link_count: 1, outbound_link_count: 0, is_in_sitemap: true },
    ];
    const scores = await scoreAllPages('s1', {
      loadLinksFn: async () => links,
      loadPagesFn: async () => pages,
    });
    assert.ok(scores.length > 0);
    assert.ok(scores[0].normalized_score >= scores[scores.length - 1].normalized_score);
  });

  it('returns empty for empty site_id', async () => {
    const scores = await scoreAllPages('');
    assert.equal(scores.length, 0);
  });

  it('all deps injectable', async () => {
    let called = false;
    await scoreAllPages('s1', {
      loadLinksFn: async () => { called = true; return []; },
      loadPagesFn: async () => [],
    });
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => scoreAllPages(null as any, null as any));
  });
});

// ── getTopAuthorityPages ─────────────────────────────────────────────────────

describe('getTopAuthorityPages', () => {
  const scores: AuthorityScore[] = [
    { url: '/a', raw_score: 10, normalized_score: 100, inbound_count: 5, body_content_inbound: 3, navigation_inbound: 2, depth_from_homepage: 1, authority_tier: 'hub' },
    { url: '/b', raw_score: 5, normalized_score: 50, inbound_count: 2, body_content_inbound: 1, navigation_inbound: 1, depth_from_homepage: 2, authority_tier: 'average' },
    { url: '/c', raw_score: 1, normalized_score: 10, inbound_count: 1, body_content_inbound: 0, navigation_inbound: 1, depth_from_homepage: 3, authority_tier: 'weak' },
  ];

  it('respects limit', () => {
    assert.equal(getTopAuthorityPages(scores, 2).length, 2);
  });

  it('returns sorted by score desc', () => {
    const top = getTopAuthorityPages(scores, 10);
    assert.equal(top[0].url, '/a');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getTopAuthorityPages(null as any, null as any));
  });
});
