/**
 * tools/link_graph/link_suggester.ts
 *
 * Generates actionable internal link suggestions based on graph analysis.
 * Never throws.
 */

import type { InternalLink, PageNode } from './types.js';
import type { AuthorityScore } from './authority_scorer.js';
import type { AnchorTextProfile } from './anchor_text_analyzer.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LinkSuggestion {
  source_url:                  string;
  source_title:                string | null;
  destination_url:             string;
  destination_title:           string | null;
  suggested_anchor_text:       string;
  suggestion_reason:           string;
  priority:                    'high' | 'medium' | 'low';
  destination_authority_score: number;
  destination_inbound_count:   number;
}

// ── Priority sort order ──────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

// ── generateLinkSuggestions ──────────────────────────────────────────────────

export function generateLinkSuggestions(
  pages:            PageNode[],
  authority_scores: AuthorityScore[],
  anchor_profiles:  AnchorTextProfile[],
  internal_links:   InternalLink[],
): LinkSuggestion[] {
  try {
    const safePages   = Array.isArray(pages) ? pages : [];
    const safeScores  = Array.isArray(authority_scores) ? authority_scores : [];
    const safeAnchors = Array.isArray(anchor_profiles) ? anchor_profiles : [];
    const safeLinks   = Array.isArray(internal_links) ? internal_links : [];

    const suggestions: LinkSuggestion[] = [];

    // Index helpers
    const scoreByUrl = new Map<string, AuthorityScore>();
    for (const s of safeScores) if (s?.url) scoreByUrl.set(s.url, s);

    const anchorByUrl = new Map<string, AnchorTextProfile>();
    for (const a of safeAnchors) if (a?.destination_url) anchorByUrl.set(a.destination_url, a);

    const pageByUrl = new Map<string, PageNode>();
    for (const p of safePages) if (p?.url) pageByUrl.set(p.url, p);

    // Outbound links by source
    const outboundBySource = new Map<string, Set<string>>();
    for (const link of safeLinks) {
      if (!link?.source_url || !link?.destination_url) continue;
      const set = outboundBySource.get(link.source_url) ?? new Set();
      set.add(link.destination_url);
      outboundBySource.set(link.source_url, set);
    }

    // Inbound body_content links by destination
    const bodyInboundByDest = new Map<string, Set<string>>();
    for (const link of safeLinks) {
      if (!link?.destination_url || link.link_type !== 'body_content') continue;
      const set = bodyInboundByDest.get(link.destination_url) ?? new Set();
      set.add(link.source_url);
      bodyInboundByDest.set(link.destination_url, set);
    }

    // 1. High-authority pages with generic anchors
    for (const profile of safeAnchors) {
      if (!profile?.has_generic_anchors || profile.generic_anchor_count === 0) continue;
      const score = scoreByUrl.get(profile.destination_url);
      if (!score || score.normalized_score < 50) continue;
      const destPage = pageByUrl.get(profile.destination_url);

      for (const entry of profile.anchor_distribution) {
        if (entry.classification !== 'generic') continue;
        // Find source pages that link with this generic anchor
        for (const link of safeLinks) {
          if (link.destination_url !== profile.destination_url) continue;
          if ((link.anchor_text ?? '').toLowerCase().trim() !== entry.text.toLowerCase().trim()) continue;

          suggestions.push({
            source_url: link.source_url,
            source_title: pageByUrl.get(link.source_url)?.title ?? null,
            destination_url: profile.destination_url,
            destination_title: destPage?.title ?? null,
            suggested_anchor_text: destPage?.title ?? profile.destination_url,
            suggestion_reason: `Replace generic anchor "${entry.text}" with descriptive text`,
            priority: 'high',
            destination_authority_score: score.normalized_score,
            destination_inbound_count: score.inbound_count,
          });
          break; // one suggestion per generic anchor per destination
        }
      }
    }

    // 2. Orphaned pages close to hub pages (depth difference <= 2)
    const hubPages = safeScores.filter(s => s.authority_tier === 'hub');
    const isolatedPages = safeScores.filter(s => s.authority_tier === 'isolated');

    for (const orphan of isolatedPages) {
      const orphanPage = pageByUrl.get(orphan.url);
      if (!orphanPage) continue;

      for (const hub of hubPages) {
        const hubPage = pageByUrl.get(hub.url);
        if (!hubPage) continue;
        const hubDepth = hubPage.depth_from_homepage ?? 0;
        const orphanDepth = orphanPage.depth_from_homepage;
        if (orphanDepth !== null && Math.abs(orphanDepth - hubDepth) <= 2) {
          suggestions.push({
            source_url: hub.url,
            source_title: hubPage.title,
            destination_url: orphan.url,
            destination_title: orphanPage.title,
            suggested_anchor_text: orphanPage.title ?? orphan.url,
            suggestion_reason: 'Add link from hub page to nearby orphaned page',
            priority: 'high',
            destination_authority_score: orphan.normalized_score,
            destination_inbound_count: orphan.inbound_count,
          });
          break; // one suggestion per orphan
        }
      }
    }

    // 3. Dead-end pages (no outbound body_content links) to related high-authority content
    for (const page of safePages) {
      if (!page?.url) continue;
      const outbound = outboundBySource.get(page.url);
      const hasBodyOutbound = safeLinks.some(
        l => l.source_url === page.url && l.link_type === 'body_content',
      );
      if (hasBodyOutbound) continue;

      // Suggest linking to top authority page
      const topAuth = safeScores.find(s => s.url !== page.url && s.authority_tier === 'hub');
      if (topAuth) {
        const destPage = pageByUrl.get(topAuth.url);
        suggestions.push({
          source_url: page.url,
          source_title: page.title,
          destination_url: topAuth.url,
          destination_title: destPage?.title ?? null,
          suggested_anchor_text: destPage?.title ?? topAuth.url,
          suggestion_reason: 'Dead-end page — add outbound link to high-authority content',
          priority: 'medium',
          destination_authority_score: topAuth.normalized_score,
          destination_inbound_count: topAuth.inbound_count,
        });
      }
    }

    // 4. Sitemap pages with zero body_content inbound links
    for (const page of safePages) {
      if (!page?.url || !page.is_in_sitemap) continue;
      const bodyInbound = bodyInboundByDest.get(page.url);
      if (bodyInbound && bodyInbound.size > 0) continue;

      // Has any inbound at all? (nav/footer only)
      const score = scoreByUrl.get(page.url);
      if (!score || score.inbound_count === 0) continue; // truly orphaned, handled above

      // Find a suitable source page
      const potentialSource = safeScores.find(
        s => s.url !== page.url && s.authority_tier !== 'isolated' && s.authority_tier !== 'weak',
      );
      if (potentialSource) {
        const sourcePage = pageByUrl.get(potentialSource.url);
        suggestions.push({
          source_url: potentialSource.url,
          source_title: sourcePage?.title ?? null,
          destination_url: page.url,
          destination_title: page.title,
          suggested_anchor_text: page.title ?? page.url,
          suggestion_reason: 'Sitemap page has no body content links — only nav/footer',
          priority: 'medium',
          destination_authority_score: score.normalized_score,
          destination_inbound_count: score.inbound_count,
        });
      }
    }

    // 5. Over-optimized anchor text
    for (const profile of safeAnchors) {
      if (!profile?.is_over_optimized) continue;
      const score = scoreByUrl.get(profile.destination_url);
      const destPage = pageByUrl.get(profile.destination_url);

      suggestions.push({
        source_url: '',
        source_title: null,
        destination_url: profile.destination_url,
        destination_title: destPage?.title ?? null,
        suggested_anchor_text: destPage?.title ?? profile.destination_url,
        suggestion_reason: 'Anchor text is over-optimized — diversify with alternative text',
        priority: 'low',
        destination_authority_score: score?.normalized_score ?? 0,
        destination_inbound_count: score?.inbound_count ?? 0,
      });
    }

    // Dedupe by source+destination pair
    const deduped = new Map<string, LinkSuggestion>();
    for (const s of suggestions) {
      const key = `${s.source_url}→${s.destination_url}→${s.suggestion_reason}`;
      if (!deduped.has(key)) deduped.set(key, s);
    }

    const result = [...deduped.values()];

    // Sort by priority then authority_score desc
    result.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return b.destination_authority_score - a.destination_authority_score;
    });

    // Max 50 per site
    return result.slice(0, 50);
  } catch {
    return [];
  }
}

// ── generateSiteLinkSuggestions ──────────────────────────────────────────────

export interface LinkSuggesterDeps {
  loadPagesFn?:   (site_id: string) => Promise<PageNode[]>;
  loadScoresFn?:  (site_id: string) => Promise<AuthorityScore[]>;
  loadAnchorsFn?: (site_id: string) => Promise<AnchorTextProfile[]>;
  loadLinksFn?:   (site_id: string) => Promise<InternalLink[]>;
}

export async function generateSiteLinkSuggestions(
  site_id: string,
  deps?:   LinkSuggesterDeps,
): Promise<LinkSuggestion[]> {
  try {
    if (!site_id) return [];

    const loadPages   = deps?.loadPagesFn ?? (async () => [] as PageNode[]);
    const loadScores  = deps?.loadScoresFn ?? (async () => [] as AuthorityScore[]);
    const loadAnchors = deps?.loadAnchorsFn ?? (async () => [] as AnchorTextProfile[]);
    const loadLinks   = deps?.loadLinksFn ?? (async () => [] as InternalLink[]);

    const [pages, scores, anchors, links] = await Promise.all([
      loadPages(site_id),
      loadScores(site_id),
      loadAnchors(site_id),
      loadLinks(site_id),
    ]);

    return generateLinkSuggestions(pages, scores, anchors, links);
  } catch {
    return [];
  }
}
