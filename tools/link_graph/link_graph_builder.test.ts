/**
 * tools/link_graph/link_graph_builder.test.ts
 *
 * Tests for buildLinkGraph, saveLinkGraph, summarizeLinkGraph
 * from link_graph_pipeline.ts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinkGraph,
  saveLinkGraph,
  summarizeLinkGraph,
} from './link_graph_pipeline.js';
import type { LinkGraph } from './link_graph_types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePages(urls: string[]): Array<{ url: string; html: string }> {
  return urls.map(url => ({ url, html: '<html></html>' }));
}

function pageWithLinks(pageUrl: string, links: string[]): { url: string; html: string } {
  const anchors = links.map(l => `<a href="${l}">Link</a>`).join('');
  return { url: pageUrl, html: `<html><body>${anchors}</body></html>` };
}

function makeGraph(overrides: Partial<LinkGraph> = {}): LinkGraph {
  return {
    site_id:              'site_1',
    built_at:             new Date().toISOString(),
    total_pages:          3,
    total_internal_links: 4,
    total_external_links: 1,
    orphaned_pages:       ['https://example.com/orphan'],
    dead_end_pages:       ['https://example.com/dead'],
    deep_pages:           ['https://example.com/a/b/c/d'],
    redirect_chain_links: [],
    pages:                [],
    internal_links:       [],
    external_links:       [{ source_url: 'x', destination_url: 'https://g.com', destination_domain: 'g.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: true, discovered_at: '' }],
    sitemap_urls:         [],
    sitemap_discrepancies:['https://example.com/missing'],
    pagination_groups:    [],
    ...overrides,
  };
}

// ── buildLinkGraph ────────────────────────────────────────────────────────────

describe('buildLinkGraph', () => {
  it('calculates inbound_internal_count for linked pages', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [
        pageWithLinks('https://example.com/', ['/about', '/contact']),
        { url: 'https://example.com/about', html: '<html></html>' },
        { url: 'https://example.com/contact', html: '<html></html>' },
      ],
      sitemapFn: async () => ({ urls: [] }),
    });
    const aboutNode = graph.pages.find(p => p.url === 'https://example.com/about');
    assert.ok(aboutNode, 'about page node should exist');
    assert.equal(aboutNode?.inbound_internal_count, 1);
  });

  it('marks orphaned pages (inbound_internal_count = 0)', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [
        { url: 'https://example.com/', html: '<html></html>' },
        { url: 'https://example.com/orphan', html: '<html></html>' },
      ],
      sitemapFn: async () => ({ urls: [] }),
    });
    assert.ok(graph.orphaned_pages.includes('https://example.com/orphan'));
  });

  it('marks dead-end pages (outbound_internal_count = 0)', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [
        { url: 'https://example.com/deadend', html: '<html></html>' },
      ],
      sitemapFn: async () => ({ urls: [] }),
    });
    assert.ok(graph.dead_end_pages.includes('https://example.com/deadend'));
  });

  it('detects redirect chains when is_redirect=true', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [
        { url: 'https://example.com/source', html: '<html></html>' },
      ],
      extractFn: (_html, page_url, _domain) => ({
        url: page_url,
        internal_links: [{
          source_url: page_url,
          destination_url: 'https://example.com/redirected',
          anchor_text: 'Redirect',
          link_type: 'body_content',
          link_source: 'html_static',
          is_nofollow: false,
          is_redirect: true,
          redirect_destination: 'https://example.com/final',
          position_in_page: 0,
          discovered_at: new Date().toISOString(),
        }],
        external_links: [],
        extraction_source: 'html_static',
        extracted_at: new Date().toISOString(),
      }),
      sitemapFn: async () => ({ urls: [] }),
    });
    assert.equal(graph.redirect_chain_links.length, 1);
    const sourceNode = graph.pages.find(p => p.url === 'https://example.com/source');
    assert.equal(sourceNode?.has_redirect_chain, true);
  });

  it('loads sitemap via sitemapFn', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [],
      sitemapFn: async () => ({ urls: ['https://example.com/sm-page'] }),
    });
    assert.ok(graph.sitemap_urls.includes('https://example.com/sm-page'));
  });

  it('finds sitemap discrepancies', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [
        { url: 'https://example.com/', html: '<html></html>' },
      ],
      sitemapFn: async () => ({ urls: ['https://example.com/', 'https://example.com/missing'] }),
    });
    assert.ok(graph.sitemap_discrepancies.includes('https://example.com/missing'));
  });

  it('groups pagination urls', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [
        { url: 'https://example.com/blog?page=2', html: '<html></html>' },
        { url: 'https://example.com/blog?page=3', html: '<html></html>' },
      ],
      sitemapFn: async () => ({ urls: [] }),
    });
    assert.equal(graph.pagination_groups.length, 1);
    assert.equal(graph.pagination_groups[0]!.paginated_urls.length, 2);
  });

  it('sets total_pages from crawl result', async () => {
    const graph = await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => makePages([
        'https://example.com/',
        'https://example.com/about',
        'https://example.com/contact',
      ]),
      sitemapFn: async () => ({ urls: [] }),
    });
    assert.equal(graph.total_pages, 3);
  });

  it('all deps are injectable', async () => {
    let crawlCalled = false;
    let sitemapCalled = false;
    await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => { crawlCalled = true; return []; },
      sitemapFn: async () => { sitemapCalled = true; return { urls: [] }; },
    });
    assert.equal(crawlCalled, true);
    assert.equal(sitemapCalled, true);
  });

  it('calls saveFn with graph when provided', async () => {
    let saved = false;
    await buildLinkGraph('site_1', 'example.com', 'shopify', {
      crawlFn: async () => [],
      sitemapFn: async () => ({ urls: [] }),
      saveFn: async () => { saved = true; return true; },
    });
    assert.equal(saved, true);
  });

  it('returns empty graph for missing site_id', async () => {
    const graph = await buildLinkGraph('', 'example.com', 'shopify');
    assert.equal(graph.total_pages, 0);
  });

  it('never throws when crawlFn throws', async () => {
    await assert.doesNotReject(() =>
      buildLinkGraph('site_1', 'example.com', 'shopify', {
        crawlFn: async () => { throw new Error('crawl fail'); },
        sitemapFn: async () => ({ urls: [] }),
      }),
    );
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => buildLinkGraph(null as any, null as any, null as any));
  });
});

// ── saveLinkGraph ─────────────────────────────────────────────────────────────

describe('saveLinkGraph', () => {
  it('calls saveFn with graph', async () => {
    let received: any = null;
    const graph = makeGraph();
    await saveLinkGraph(graph, { saveFn: async (g) => { received = g; return true; } });
    assert.equal(received?.site_id, 'site_1');
  });

  it('returns true on success', async () => {
    const result = await saveLinkGraph(makeGraph(), { saveFn: async () => true });
    assert.equal(result, true);
  });

  it('returns false when saveFn throws', async () => {
    const result = await saveLinkGraph(makeGraph(), {
      saveFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result, false);
  });

  it('returns false when graph has no site_id', async () => {
    const result = await saveLinkGraph(makeGraph({ site_id: '' }), {
      saveFn: async () => true,
    });
    assert.equal(result, false);
  });

  it('returns false on null graph', async () => {
    const result = await saveLinkGraph(null as any);
    assert.equal(result, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => saveLinkGraph(null as any));
  });
});

// ── summarizeLinkGraph ────────────────────────────────────────────────────────

describe('summarizeLinkGraph', () => {
  it('counts orphaned pages correctly', () => {
    const summary = summarizeLinkGraph(makeGraph());
    assert.equal(summary.orphaned_count, 1);
  });

  it('counts dead-end pages correctly', () => {
    const summary = summarizeLinkGraph(makeGraph());
    assert.equal(summary.dead_end_count, 1);
  });

  it('counts deep pages correctly', () => {
    const summary = summarizeLinkGraph(makeGraph());
    assert.equal(summary.deep_pages_count, 1);
  });

  it('counts broken external links correctly', () => {
    const summary = summarizeLinkGraph(makeGraph());
    assert.equal(summary.broken_external_count, 1);
  });

  it('counts sitemap discrepancies correctly', () => {
    const summary = summarizeLinkGraph(makeGraph());
    assert.equal(summary.sitemap_discrepancy_count, 1);
  });

  it('returns link_limit = 100', () => {
    const summary = summarizeLinkGraph(makeGraph());
    assert.equal(summary.link_limit, 100);
  });

  it('returns null avg_depth when no pages have depth', () => {
    const graph = makeGraph({ pages: [] });
    const summary = summarizeLinkGraph(graph);
    assert.equal(summary.avg_depth, null);
  });

  it('calculates avg_depth from pages with depth', () => {
    const pages = [
      { url: 'a', depth_from_homepage: 2, total_link_count: 0 } as any,
      { url: 'b', depth_from_homepage: 4, total_link_count: 0 } as any,
    ];
    const summary = summarizeLinkGraph(makeGraph({ pages }));
    assert.equal(summary.avg_depth, 3);
  });

  it('counts pages exceeding link limit', () => {
    const pages = [
      { url: 'a', depth_from_homepage: null, total_link_count: 150 } as any,
      { url: 'b', depth_from_homepage: null, total_link_count: 50 } as any,
    ];
    const summary = summarizeLinkGraph(makeGraph({ pages }));
    assert.equal(summary.pages_exceeding_link_limit, 1);
  });

  it('never throws on null graph', () => {
    assert.doesNotThrow(() => summarizeLinkGraph(null as any));
  });
});
