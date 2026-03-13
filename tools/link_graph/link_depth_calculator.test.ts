/**
 * tools/link_graph/link_depth_calculator.test.ts
 *
 * Tests for link depth calculator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdjacencyMap,
  calculateDepthsBFS,
  identifyDeepPages,
  calculateAverageDepth,
  runDepthAnalysis,
  DEEP_PAGE_THRESHOLD,
  type DepthResult,
} from './link_depth_calculator.js';
import type { InternalLink } from './types.js';

function link(source: string, dest: string, type = 'body_content', nofollow = false): InternalLink {
  return { source_url: source, destination_url: dest, anchor_text: 'link', link_type: type, is_nofollow: nofollow };
}

// ── DEEP_PAGE_THRESHOLD ──────────────────────────────────────────────────────

describe('DEEP_PAGE_THRESHOLD', () => {
  it('equals 3', () => {
    assert.equal(DEEP_PAGE_THRESHOLD, 3);
  });
});

// ── buildAdjacencyMap ────────────────────────────────────────────────────────

describe('buildAdjacencyMap', () => {
  it('builds correct map from body_content links', () => {
    const links = [link('/a', '/b'), link('/a', '/c'), link('/b', '/c')];
    const map = buildAdjacencyMap(links);
    assert.deepEqual(map.get('/a'), ['/b', '/c']);
    assert.deepEqual(map.get('/b'), ['/c']);
  });

  it('excludes nofollow links', () => {
    const links = [link('/a', '/b', 'body_content', true)];
    const map = buildAdjacencyMap(links);
    assert.equal(map.size, 0);
  });

  it('excludes navigation links', () => {
    const links = [link('/a', '/b', 'navigation')];
    const map = buildAdjacencyMap(links);
    assert.equal(map.size, 0);
  });

  it('excludes footer links', () => {
    const links = [link('/a', '/b', 'footer')];
    const map = buildAdjacencyMap(links);
    assert.equal(map.size, 0);
  });

  it('includes breadcrumb links', () => {
    const links = [link('/a', '/b', 'breadcrumb')];
    const map = buildAdjacencyMap(links);
    assert.deepEqual(map.get('/a'), ['/b']);
  });

  it('includes sidebar links', () => {
    const links = [link('/a', '/b', 'sidebar')];
    const map = buildAdjacencyMap(links);
    assert.deepEqual(map.get('/a'), ['/b']);
  });

  it('returns empty map for empty array', () => {
    assert.equal(buildAdjacencyMap([]).size, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildAdjacencyMap(null as any));
  });
});

// ── calculateDepthsBFS ───────────────────────────────────────────────────────

describe('calculateDepthsBFS', () => {
  const adj = new Map<string, string[]>();
  adj.set('/', ['/about', '/blog']);
  adj.set('/about', ['/about/team']);
  adj.set('/blog', ['/blog/post-1']);

  it('assigns homepage depth 0', () => {
    const results = calculateDepthsBFS('/', adj, ['/', '/about', '/blog', '/about/team', '/blog/post-1']);
    assert.equal(results.get('/')?.depth, 0);
  });

  it('assigns correct depths', () => {
    const results = calculateDepthsBFS('/', adj, ['/', '/about', '/blog', '/about/team', '/blog/post-1']);
    assert.equal(results.get('/about')?.depth, 1);
    assert.equal(results.get('/about/team')?.depth, 2);
  });

  it('marks unreachable pages', () => {
    const results = calculateDepthsBFS('/', adj, ['/', '/about', '/orphan']);
    const orphan = results.get('/orphan');
    assert.equal(orphan?.is_reachable, false);
    assert.equal(orphan?.depth, -1);
  });

  it('tracks path_from_homepage', () => {
    const results = calculateDepthsBFS('/', adj, ['/', '/about', '/about/team']);
    const team = results.get('/about/team');
    assert.deepEqual(team?.path_from_homepage, ['/', '/about', '/about/team']);
  });

  it('handles empty adjacency map', () => {
    const results = calculateDepthsBFS('/', new Map(), ['/']);
    assert.equal(results.get('/')?.depth, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateDepthsBFS(null as any, null as any, null as any));
  });
});

// ── identifyDeepPages ────────────────────────────────────────────────────────

describe('identifyDeepPages', () => {
  it('filters by threshold', () => {
    const map = new Map<string, DepthResult>();
    map.set('/a', { url: '/a', depth: 2, path_from_homepage: [], is_reachable: true });
    map.set('/b', { url: '/b', depth: 5, path_from_homepage: [], is_reachable: true });
    assert.equal(identifyDeepPages(map, 3).length, 1);
    assert.equal(identifyDeepPages(map, 3)[0].url, '/b');
  });

  it('sorts by depth descending', () => {
    const map = new Map<string, DepthResult>();
    map.set('/a', { url: '/a', depth: 4, path_from_homepage: [], is_reachable: true });
    map.set('/b', { url: '/b', depth: 6, path_from_homepage: [], is_reachable: true });
    const deep = identifyDeepPages(map, 3);
    assert.equal(deep[0].url, '/b');
    assert.equal(deep[1].url, '/a');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => identifyDeepPages(null as any, null as any));
  });
});

// ── calculateAverageDepth ────────────────────────────────────────────────────

describe('calculateAverageDepth', () => {
  it('excludes unreachable pages', () => {
    const map = new Map<string, DepthResult>();
    map.set('/', { url: '/', depth: 0, path_from_homepage: [], is_reachable: true });
    map.set('/a', { url: '/a', depth: 2, path_from_homepage: [], is_reachable: true });
    map.set('/x', { url: '/x', depth: -1, path_from_homepage: [], is_reachable: false });
    assert.equal(calculateAverageDepth(map), 1);
  });

  it('returns null for empty map', () => {
    assert.equal(calculateAverageDepth(new Map()), null);
  });

  it('returns null for all unreachable', () => {
    const map = new Map<string, DepthResult>();
    map.set('/x', { url: '/x', depth: -1, path_from_homepage: [], is_reachable: false });
    assert.equal(calculateAverageDepth(map), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateAverageDepth(null as any));
  });
});

// ── runDepthAnalysis ─────────────────────────────────────────────────────────

describe('runDepthAnalysis', () => {
  it('returns analysis results', async () => {
    const links = [link('/', '/a'), link('/a', '/b'), link('/b', '/c'), link('/c', '/d')];
    const r = await runDepthAnalysis('s1', '/', {
      loadLinksFn: async () => ({ links, all_urls: ['/', '/a', '/b', '/c', '/d'] }),
    });
    assert.ok(r.depth_map.size > 0);
    assert.equal(r.max_depth, 4);
    assert.equal(r.unreachable_count, 0);
  });

  it('detects deep pages', async () => {
    const links = [link('/', '/a'), link('/a', '/b'), link('/b', '/c'), link('/c', '/d')];
    const r = await runDepthAnalysis('s1', '/', {
      loadLinksFn: async () => ({ links, all_urls: ['/', '/a', '/b', '/c', '/d'] }),
    });
    assert.ok(r.deep_pages.length > 0);
  });

  it('returns empty for empty site_id', async () => {
    const r = await runDepthAnalysis('', '/');
    assert.equal(r.depth_map.size, 0);
  });

  it('all deps injectable', async () => {
    let called = false;
    await runDepthAnalysis('s1', '/', {
      loadLinksFn: async () => { called = true; return { links: [], all_urls: [] }; },
    });
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => runDepthAnalysis(null as any, null as any, null as any));
  });
});
