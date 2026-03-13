/**
 * tools/link_graph/link_depth_calculator.ts
 *
 * Calculates link depth (clicks from homepage) for every page in a site's
 * internal link graph using breadth-first search.
 *
 * Never throws.
 */

import type { InternalLink } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DepthResult {
  url:                string;
  depth:              number;
  path_from_homepage: string[];
  is_reachable:       boolean;
}

export const DEEP_PAGE_THRESHOLD = 3;

// ── buildAdjacencyMap ────────────────────────────────────────────────────────

export function buildAdjacencyMap(
  internal_links: InternalLink[],
): Map<string, string[]> {
  try {
    const map = new Map<string, string[]>();
    if (!Array.isArray(internal_links)) return map;

    for (const link of internal_links) {
      if (!link?.source_url || !link?.destination_url) continue;
      if (link.is_nofollow) continue;
      // Only body_content, breadcrumb, sidebar count for depth
      const lt = link.link_type ?? '';
      if (lt !== 'body_content' && lt !== 'breadcrumb' && lt !== 'sidebar') continue;

      const existing = map.get(link.source_url);
      if (existing) {
        existing.push(link.destination_url);
      } else {
        map.set(link.source_url, [link.destination_url]);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── calculateDepthsBFS ───────────────────────────────────────────────────────

export function calculateDepthsBFS(
  homepage_url:  string,
  adjacency_map: Map<string, string[]>,
  all_urls:      string[],
): Map<string, DepthResult> {
  try {
    const results = new Map<string, DepthResult>();
    const safeUrls = Array.isArray(all_urls) ? all_urls : [];

    if (!homepage_url) {
      for (const url of safeUrls) {
        results.set(url, { url, depth: -1, path_from_homepage: [], is_reachable: false });
      }
      return results;
    }

    // BFS
    const visited = new Set<string>();
    const pathMap = new Map<string, string[]>();
    const queue: Array<{ url: string; depth: number }> = [{ url: homepage_url, depth: 0 }];
    visited.add(homepage_url);
    pathMap.set(homepage_url, [homepage_url]);

    while (queue.length > 0) {
      const { url, depth } = queue.shift()!;
      results.set(url, {
        url,
        depth,
        path_from_homepage: pathMap.get(url) ?? [url],
        is_reachable: true,
      });

      const neighbors = adjacency_map?.get(url) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pathMap.set(neighbor, [...(pathMap.get(url) ?? [url]), neighbor]);
          queue.push({ url: neighbor, depth: depth + 1 });
        }
      }
    }

    // Mark unreachable URLs
    for (const url of safeUrls) {
      if (!results.has(url)) {
        results.set(url, { url, depth: -1, path_from_homepage: [], is_reachable: false });
      }
    }

    return results;
  } catch {
    return new Map();
  }
}

// ── identifyDeepPages ────────────────────────────────────────────────────────

export function identifyDeepPages(
  depth_results: Map<string, DepthResult>,
  threshold:     number,
): DepthResult[] {
  try {
    if (!depth_results || typeof depth_results.values !== 'function') return [];
    const safeThreshold = typeof threshold === 'number' ? threshold : DEEP_PAGE_THRESHOLD;
    const deep: DepthResult[] = [];
    for (const r of depth_results.values()) {
      if (r.is_reachable && r.depth > safeThreshold) {
        deep.push(r);
      }
    }
    deep.sort((a, b) => b.depth - a.depth);
    return deep;
  } catch {
    return [];
  }
}

// ── calculateAverageDepth ────────────────────────────────────────────────────

export function calculateAverageDepth(
  depth_results: Map<string, DepthResult>,
): number | null {
  try {
    if (!depth_results || typeof depth_results.values !== 'function') return null;
    let sum = 0;
    let count = 0;
    for (const r of depth_results.values()) {
      if (r.is_reachable) {
        sum += r.depth;
        count++;
      }
    }
    if (count === 0) return null;
    return Math.round((sum / count) * 100) / 100;
  } catch {
    return null;
  }
}

// ── runDepthAnalysis ─────────────────────────────────────────────────────────

export interface DepthAnalysisDeps {
  loadLinksFn?: (site_id: string) => Promise<{ links: InternalLink[]; all_urls: string[] }>;
}

export async function runDepthAnalysis(
  site_id:      string,
  homepage_url: string,
  deps?:        DepthAnalysisDeps,
): Promise<{
  depth_map:         Map<string, DepthResult>;
  deep_pages:        DepthResult[];
  avg_depth:         number | null;
  max_depth:         number | null;
  unreachable_count: number;
}> {
  const empty = {
    depth_map:         new Map<string, DepthResult>(),
    deep_pages:        [] as DepthResult[],
    avg_depth:         null as number | null,
    max_depth:         null as number | null,
    unreachable_count: 0,
  };

  try {
    if (!site_id || !homepage_url) return empty;

    const loadFn = deps?.loadLinksFn ?? (async () => ({ links: [] as InternalLink[], all_urls: [] as string[] }));
    const { links, all_urls } = await loadFn(site_id);

    const adjacency = buildAdjacencyMap(links);
    const depth_map = calculateDepthsBFS(homepage_url, adjacency, all_urls);
    const deep_pages = identifyDeepPages(depth_map, DEEP_PAGE_THRESHOLD);
    const avg_depth = calculateAverageDepth(depth_map);

    let max_depth: number | null = null;
    let unreachable_count = 0;
    for (const r of depth_map.values()) {
      if (r.is_reachable) {
        if (max_depth === null || r.depth > max_depth) max_depth = r.depth;
      } else {
        unreachable_count++;
      }
    }

    return { depth_map, deep_pages, avg_depth, max_depth, unreachable_count };
  } catch {
    return empty;
  }
}
