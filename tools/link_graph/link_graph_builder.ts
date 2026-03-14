/**
 * tools/link_graph/link_graph_builder.ts
 *
 * Orchestrates building a complete link graph with depth, authority,
 * anchor, and equity analysis for a site. Intended to run after each crawl.
 *
 * Analysis failures are non-fatal — raw graph data is always saved.
 * Never throws.
 */

import type { InternalLink, ExternalLink, PageNode } from './types.js';
import type { InternalLink as RichInternalLink, ExternalLink as RichExternalLink, PageNode as RichPageNode } from './link_graph_types.js';
import { runDepthAnalysis, type DepthResult } from './link_depth_calculator.js';
import { scoreAllPages, type AuthorityScore } from './authority_scorer.js';
import { analyzeAllAnchors, type AnchorTextProfile } from './anchor_text_analyzer.js';
import { detectAllEquityLeaks, type EquityLeak } from './equity_leak_detector.js';
import { scanSiteForCanonicalConflicts } from './canonical_conflict_detector.js';
import { scanAllPagesForLinkLimits } from './link_limit_enforcer.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LinkGraphResult {
  site_id:           string;
  pages:             PageNode[];
  depth_results:     Map<string, DepthResult>;
  authority_scores:  AuthorityScore[];
  anchor_profiles:   AnchorTextProfile[];
  equity_leaks:      EquityLeak[];
  built_at:          string;
  analysis_errors:   string[];
}

export interface LinkGraphBuilderDeps {
  loadPagesFn?:       (site_id: string) => Promise<PageNode[]>;
  loadInternalFn?:    (site_id: string) => Promise<InternalLink[]>;
  loadExternalFn?:    (site_id: string) => Promise<ExternalLink[]>;
  saveGraphFn?:       (result: LinkGraphResult) => Promise<void>;
  getHomepageFn?:     (site_id: string) => Promise<string>;
}

// ── buildLinkGraph ───────────────────────────────────────────────────────────

export async function buildLinkGraph(
  site_id: string,
  deps?:   LinkGraphBuilderDeps,
): Promise<LinkGraphResult> {
  const empty: LinkGraphResult = {
    site_id:          site_id ?? '',
    pages:            [],
    depth_results:    new Map(),
    authority_scores: [],
    anchor_profiles:  [],
    equity_leaks:     [],
    built_at:         new Date().toISOString(),
    analysis_errors:  [],
  };

  try {
    if (!site_id) return empty;

    const loadPages    = deps?.loadPagesFn ?? (async () => [] as PageNode[]);
    const loadInternal = deps?.loadInternalFn ?? (async () => [] as InternalLink[]);
    const loadExternal = deps?.loadExternalFn ?? (async () => [] as ExternalLink[]);
    const saveGraph    = deps?.saveGraphFn ?? (async () => {});
    const getHomepage  = deps?.getHomepageFn ?? (async () => '');

    const [pages, internalLinks, externalLinks, homepage_url] = await Promise.all([
      loadPages(site_id),
      loadInternal(site_id),
      loadExternal(site_id),
      getHomepage(site_id),
    ]);

    const analysis_errors: string[] = [];

    // 1. Depth analysis
    let depth_results = new Map<string, DepthResult>();
    try {
      const allUrls = (pages ?? []).map(p => p?.url).filter(Boolean) as string[];
      const depthResult = await runDepthAnalysis(site_id, homepage_url, {
        loadLinksFn: async () => ({ links: internalLinks ?? [], all_urls: allUrls }),
      });
      depth_results = depthResult.depth_map;

      // Update pages with depth
      for (const page of (pages ?? [])) {
        if (!page?.url) continue;
        const dr = depth_results.get(page.url);
        if (dr) page.depth_from_homepage = dr.depth;
      }
    } catch (err) {
      analysis_errors.push(`depth: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. Authority scoring
    let authority_scores: AuthorityScore[] = [];
    try {
      authority_scores = await scoreAllPages(site_id, {
        loadLinksFn: async () => internalLinks ?? [],
        loadPagesFn: async () => pages ?? [],
      });

      // Update pages with authority
      const scoreMap = new Map<string, number>();
      for (const s of authority_scores) scoreMap.set(s.url, s.normalized_score);
      for (const page of (pages ?? [])) {
        if (!page?.url) continue;
        page.link_equity_score = scoreMap.get(page.url) ?? null;
      }
    } catch (err) {
      analysis_errors.push(`authority: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Anchor analysis (non-fatal)
    let anchor_profiles: AnchorTextProfile[] = [];
    try {
      anchor_profiles = await analyzeAllAnchors(site_id, {
        loadLinksFn: async () => internalLinks ?? [],
      });
    } catch (err) {
      analysis_errors.push(`anchors: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4. Equity leak detection (non-fatal)
    let equity_leaks: EquityLeak[] = [];
    try {
      equity_leaks = await detectAllEquityLeaks(site_id, {
        loadLinksFn: async () => ({ internal: internalLinks ?? [], external: externalLinks ?? [] }),
        loadScoresFn: async () => {
          const m = new Map<string, number>();
          for (const s of authority_scores) m.set(s.url, s.normalized_score);
          return m;
        },
      });
    } catch (err) {
      analysis_errors.push(`equity: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 5. Canonical conflict scan (non-fatal)
    let canonical_conflicts_count = 0;
    try {
      const canonicalResult = await scanSiteForCanonicalConflicts(site_id, {
        loadLinksFn: async (_sid: string) => (internalLinks ?? []) as unknown as RichInternalLink[],
        loadPagesFn: async (_sid: string) => (pages ?? []) as unknown as RichPageNode[],
      });
      canonical_conflicts_count = canonicalResult.total_conflicts;
    } catch (err) {
      analysis_errors.push(`canonical: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 6. Link limit scan (non-fatal)
    let link_limit_violations_count = 0;
    try {
      const limitResult = await scanAllPagesForLinkLimits(site_id, {
        loadPagesFn: async (_sid: string) => (pages ?? []).map((p) => ({ url: p.url, title: p.title })),
        loadLinksFn: async (_sid: string) => ({ internal: (internalLinks ?? []) as unknown as RichInternalLink[], external: (externalLinks ?? []) as unknown as RichExternalLink[] }),
      });
      link_limit_violations_count = limitResult.violations.length;
    } catch (err) {
      analysis_errors.push(`link_limits: ${err instanceof Error ? err.message : String(err)}`);
    }

    process.stderr.write(
      `[LINK_GRAPH] canonical_conflicts=${canonical_conflicts_count} link_limit_violations=${link_limit_violations_count}\n`,
    );

    const result: LinkGraphResult = {
      site_id,
      pages: pages ?? [],
      depth_results,
      authority_scores,
      anchor_profiles,
      equity_leaks,
      built_at: new Date().toISOString(),
      analysis_errors,
    };

    try {
      await saveGraph(result);
    } catch {
      // save failure is non-fatal
    }

    return result;
  } catch {
    return empty;
  }
}
