/**
 * tools/link_graph/redirect_chain_detector.ts
 *
 * Detects redirect chains in internal links and suggests direct link fixes.
 * Never throws.
 */

import type { InternalLink } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RedirectChain {
  source_url:  string;
  link_url:    string;
  final_url:   string;
  hop_count:   number;
  chain:       string[];
  fix_action:  'update_link_to_final';
}

// ── detectRedirectChain ──────────────────────────────────────────────────────

export interface RedirectDetectDeps {
  fetchFn?: (url: string) => Promise<{ status: number; redirected: boolean; url: string; headers?: { location?: string } }>;
}

export async function detectRedirectChain(
  link_url:  string,
  max_hops?: number,
  deps?:     RedirectDetectDeps,
): Promise<RedirectChain | null> {
  try {
    if (!link_url) return null;
    const limit = typeof max_hops === 'number' && max_hops > 0 ? max_hops : 5;

    const fetchFn = deps?.fetchFn ?? (async (url: string) => {
      const res = await fetch(url, { redirect: 'manual' });
      return {
        status: res.status,
        redirected: res.status >= 300 && res.status < 400,
        url: res.headers.get('location') ?? url,
        headers: { location: res.headers.get('location') ?? undefined },
      };
    });

    const chain: string[] = [link_url];
    let current = link_url;

    for (let i = 0; i < limit; i++) {
      const res = await fetchFn(current);
      if (!res.redirected && !(res.status >= 300 && res.status < 400)) break;
      const nextUrl = res.headers?.location ?? res.url;
      if (!nextUrl || nextUrl === current) break;
      chain.push(nextUrl);
      current = nextUrl;
    }

    // No redirects found
    if (chain.length <= 1) return null;

    return {
      source_url: '',
      link_url,
      final_url:  chain[chain.length - 1],
      hop_count:  chain.length - 1,
      chain,
      fix_action: 'update_link_to_final',
    };
  } catch {
    return null;
  }
}

// ── scanInternalLinksForRedirects ────────────────────────────────────────────

export interface ScanRedirectDeps {
  detectFn?: (link_url: string) => Promise<RedirectChain | null>;
}

export async function scanInternalLinksForRedirects(
  internal_links: InternalLink[],
  deps?:          ScanRedirectDeps,
): Promise<RedirectChain[]> {
  try {
    if (!Array.isArray(internal_links)) return [];

    const detectFn = deps?.detectFn ?? (async (url: string) => detectRedirectChain(url));

    // Deduplicate by destination URL
    const seen = new Set<string>();
    const uniqueDestinations: Array<{ source_url: string; dest_url: string }> = [];
    for (const link of internal_links) {
      if (!link?.destination_url) continue;
      if (seen.has(link.destination_url)) continue;
      seen.add(link.destination_url);
      uniqueDestinations.push({ source_url: link.source_url ?? '', dest_url: link.destination_url });
    }

    const chains: RedirectChain[] = [];
    for (const { source_url, dest_url } of uniqueDestinations) {
      const chain = await detectFn(dest_url);
      if (chain) {
        chain.source_url = source_url;
        chains.push(chain);
      }
    }

    return chains;
  } catch {
    return [];
  }
}

// ── buildRedirectChainFix ────────────────────────────────────────────────────

export function buildRedirectChainFix(
  chain:           RedirectChain,
  source_page_html: string,
): { original_href: string; replacement_href: string; anchor_text: string | null } {
  try {
    if (!chain?.link_url || !chain?.final_url) {
      return { original_href: '', replacement_href: '', anchor_text: null };
    }

    // Try to find anchor text from HTML
    let anchor_text: string | null = null;
    if (source_page_html) {
      const escaped = chain.link_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`<a[^>]*href=["']${escaped}["'][^>]*>([^<]*)</a>`, 'i');
      const match = (source_page_html ?? '').match(regex);
      if (match?.[1]) anchor_text = match[1].trim() || null;
    }

    return {
      original_href:    chain.link_url,
      replacement_href: chain.final_url,
      anchor_text,
    };
  } catch {
    return { original_href: '', replacement_href: '', anchor_text: null };
  }
}
