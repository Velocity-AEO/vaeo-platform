/**
 * tools/link_graph/link_graph_pipeline.ts
 *
 * Orchestrates link graph construction: crawl, extract, classify, build nodes,
 * load sitemap, detect orphans/dead-ends, group pagination.
 * Never throws.
 */

import type { InternalLink, ExternalLink, PageNode, LinkGraph, LinkGraphSummary } from './link_graph_types.js';
import { extractLinksFromHTML, countLinksPerPage, exceedsLinkLimit, LINK_LIMIT_PER_PAGE, type LinkExtractionResult } from './link_extractor.js';
import { isPaginationUrl, extractPaginationRoot, groupPaginationUrls } from './link_type_classifier.js';
import { loadSitemap, findSitemapDiscrepancies } from './sitemap_loader.js';

// ── Build deps interface ──────────────────────────────────────────────────────

export interface BuildLinkGraphDeps {
  crawlFn?:      (site_id: string, site_domain: string) => Promise<Array<{ url: string; html: string }>>;
  extractFn?:    (html: string, page_url: string, site_domain: string) => LinkExtractionResult;
  playwrightFn?: (url: string, site_domain: string) => Promise<LinkExtractionResult>;
  sitemapFn?:    (site_domain: string) => Promise<{ urls: string[] }>;
  saveFn?:       (graph: LinkGraph) => Promise<boolean>;
}

// ── JS-heavy indicator ────────────────────────────────────────────────────────

function isJsHeavy(html: string): boolean {
  try {
    const h = html ?? '';
    const linkCount   = (h.match(/<a\s/gi) ?? []).length;
    const scriptCount = (h.match(/<script[^>]*src=/gi) ?? []).length;
    return linkCount < 5 && scriptCount > 3;
  } catch {
    return false;
  }
}

// ── buildLinkGraph ────────────────────────────────────────────────────────────

export async function buildLinkGraph(
  site_id:     string,
  site_domain: string,
  _platform:   'shopify' | 'wordpress',
  deps?:       BuildLinkGraphDeps,
): Promise<LinkGraph> {
  const now = new Date().toISOString();

  try {
    if (!site_id || !site_domain) {
      return emptyGraph(site_id ?? '', now);
    }

    const crawlFn   = deps?.crawlFn   ?? defaultCrawlFn;
    const extractFn = deps?.extractFn ?? extractLinksFromHTML;
    const sitemapFn = deps?.sitemapFn ?? ((domain: string) => loadSitemap(domain));

    // 1. Crawl pages
    const pages = await crawlFn(site_id, site_domain).catch(() => [] as Array<{ url: string; html: string }>);

    // 2. Extract links from each page
    const allInternalLinks: InternalLink[] = [];
    const allExternalLinks: ExternalLink[] = [];

    for (const { url, html } of pages) {
      try {
        let result = extractFn(html, url, site_domain);

        // If page is JS-heavy and playwrightFn provided, merge
        if (deps?.playwrightFn && isJsHeavy(html)) {
          try {
            const jsResult = await deps.playwrightFn(url, site_domain);
            const htmlPairs = new Set(result.internal_links.map(l => l.destination_url));
            const jsOnly = jsResult.internal_links.filter(l => !htmlPairs.has(l.destination_url));
            result = { ...result, internal_links: [...result.internal_links, ...jsOnly] };
          } catch {
            // Non-fatal
          }
        }

        allInternalLinks.push(...result.internal_links);
        allExternalLinks.push(...result.external_links);
      } catch {
        // Per-page failure is non-fatal
      }
    }

    // 3. Load sitemap
    let sitemap_urls: string[] = [];
    try {
      const sm = await sitemapFn(site_domain);
      sitemap_urls = sm?.urls ?? [];
    } catch {
      // Non-fatal
    }

    // 4. Build URL sets
    const crawledUrls = pages.map(p => p.url);
    const sitemapSet  = new Set(sitemap_urls);

    // 5. Calculate inbound counts per destination URL
    const inboundCount = new Map<string, number>();
    for (const link of allInternalLinks) {
      inboundCount.set(link.destination_url, (inboundCount.get(link.destination_url) ?? 0) + 1);
    }

    // 6. Calculate outbound internal/external counts per source URL
    const outboundInternalCount = new Map<string, number>();
    const outboundExternalCount = new Map<string, number>();
    for (const link of allInternalLinks) {
      outboundInternalCount.set(link.source_url, (outboundInternalCount.get(link.source_url) ?? 0) + 1);
    }
    for (const link of allExternalLinks) {
      outboundExternalCount.set(link.source_url, (outboundExternalCount.get(link.source_url) ?? 0) + 1);
    }

    // 7. Detect redirect chain sources
    const redirectChainUrls = new Set<string>(
      allInternalLinks.filter(l => l.is_redirect).map(l => l.source_url),
    );

    // 8. Build PageNode array
    const pageNodes: PageNode[] = crawledUrls.map(url => {
      const outInt  = outboundInternalCount.get(url) ?? 0;
      const outExt  = outboundExternalCount.get(url) ?? 0;
      const inbound = inboundCount.get(url) ?? 0;
      const isPag   = isPaginationUrl(url);

      return {
        url,
        site_id,
        title:                   null,
        is_canonical:            true,
        canonical_url:           null,
        is_noindex:              false,
        is_paginated:            isPag,
        pagination_root:         isPag ? extractPaginationRoot(url) : null,
        depth_from_homepage:     null,
        inbound_internal_count:  inbound,
        outbound_internal_count: outInt,
        outbound_external_count: outExt,
        total_link_count:        outInt + outExt,
        is_in_sitemap:           sitemapSet.has(url),
        is_orphaned:             inbound === 0,
        is_dead_end:             outInt === 0,
        has_redirect_chain:      redirectChainUrls.has(url),
        link_equity_score:       null,
        last_crawled_at:         now,
      };
    });

    // 9. Aggregate graph-level lists
    const orphaned_pages       = pageNodes.filter(p => p.is_orphaned).map(p => p.url);
    const dead_end_pages       = pageNodes.filter(p => p.is_dead_end).map(p => p.url);
    const redirect_chain_links = allInternalLinks.filter(l => l.is_redirect);
    const sitemap_discrepancies = findSitemapDiscrepancies(sitemap_urls, crawledUrls, []);
    const allUrls               = [...new Set([...crawledUrls, ...sitemap_urls])];
    const pagination_groups     = groupPaginationUrls(allUrls);
    const deep_pages: string[]  = [];

    const graph: LinkGraph = {
      site_id,
      built_at:              now,
      total_pages:           pageNodes.length,
      total_internal_links:  allInternalLinks.length,
      total_external_links:  allExternalLinks.length,
      orphaned_pages,
      dead_end_pages,
      deep_pages,
      redirect_chain_links,
      pages:                 pageNodes,
      internal_links:        allInternalLinks,
      external_links:        allExternalLinks,
      sitemap_urls,
      sitemap_discrepancies,
      pagination_groups,
    };

    process.stderr.write(
      `[LINK_GRAPH] site=${site_id} pages=${pageNodes.length} ` +
      `internal_links=${allInternalLinks.length} ` +
      `orphaned=${orphaned_pages.length} dead_ends=${dead_end_pages.length}\n`,
    );

    if (deps?.saveFn) {
      await deps.saveFn(graph).catch(() => {});
    }

    return graph;
  } catch {
    return emptyGraph(site_id ?? '', now);
  }
}

// ── saveLinkGraph ─────────────────────────────────────────────────────────────

export async function saveLinkGraph(
  graph: LinkGraph,
  deps?: { saveFn?: (graph: LinkGraph) => Promise<boolean> },
): Promise<boolean> {
  try {
    if (!graph?.site_id) return false;
    const fn = deps?.saveFn ?? defaultSaveFn;
    return await fn(graph);
  } catch {
    return false;
  }
}

// ── summarizeLinkGraph ────────────────────────────────────────────────────────

export function summarizeLinkGraph(graph: LinkGraph): LinkGraphSummary {
  try {
    const pages  = graph?.pages ?? [];
    const depths = pages.map(p => p.depth_from_homepage).filter((d): d is number => d !== null);
    const avg_depth = depths.length > 0
      ? Math.round((depths.reduce((a, b) => a + b, 0) / depths.length) * 10) / 10
      : null;
    const max_depth = depths.length > 0 ? Math.max(...depths) : null;

    return {
      site_id:                    graph?.site_id ?? '',
      built_at:                   graph?.built_at ?? new Date().toISOString(),
      total_pages:                pages.length,
      orphaned_count:             (graph?.orphaned_pages ?? []).length,
      dead_end_count:             (graph?.dead_end_pages ?? []).length,
      deep_pages_count:           (graph?.deep_pages ?? []).length,
      broken_external_count:      (graph?.external_links ?? []).filter(l => l.is_broken).length,
      redirect_chain_count:       (graph?.redirect_chain_links ?? []).length,
      sitemap_discrepancy_count:  (graph?.sitemap_discrepancies ?? []).length,
      avg_depth,
      max_depth,
      pages_exceeding_link_limit: pages.filter(p => exceedsLinkLimit(p.total_link_count)).length,
      link_limit:                 LINK_LIMIT_PER_PAGE,
    };
  } catch {
    return {
      site_id:                    graph?.site_id ?? '',
      built_at:                   new Date().toISOString(),
      total_pages:                0,
      orphaned_count:             0,
      dead_end_count:             0,
      deep_pages_count:           0,
      broken_external_count:      0,
      redirect_chain_count:       0,
      sitemap_discrepancy_count:  0,
      avg_depth:                  null,
      max_depth:                  null,
      pages_exceeding_link_limit: 0,
      link_limit:                 LINK_LIMIT_PER_PAGE,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyGraph(site_id: string, now: string): LinkGraph {
  return {
    site_id,
    built_at:              now,
    total_pages:           0,
    total_internal_links:  0,
    total_external_links:  0,
    orphaned_pages:        [],
    dead_end_pages:        [],
    deep_pages:            [],
    redirect_chain_links:  [],
    pages:                 [],
    internal_links:        [],
    external_links:        [],
    sitemap_urls:          [],
    sitemap_discrepancies: [],
    pagination_groups:     [],
  };
}

async function defaultCrawlFn(
  _site_id: string,
  _site_domain: string,
): Promise<Array<{ url: string; html: string }>> {
  return [];
}

async function defaultSaveFn(_graph: LinkGraph): Promise<boolean> {
  return false;
}
