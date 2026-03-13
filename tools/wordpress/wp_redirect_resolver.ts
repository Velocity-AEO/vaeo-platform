/**
 * tools/wordpress/wp_redirect_resolver.ts
 *
 * Resolves redirect chains to final URLs before crawling.
 * Detects circular redirects and max-hop limits.
 * Never throws.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_REDIRECT_HOPS: number = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface RedirectChain {
  original_url:       string;
  final_url:          string;
  hops:               number;
  chain:              string[];
  is_redirect:        boolean;
  circular_detected:  boolean;
  max_hops_exceeded:  boolean;
}

// ── RedirectResolveError ────────────────────────────────────────────────────

export class RedirectResolveError extends Error {
  override name = 'RedirectResolveError' as const;
  url:    string;
  reason: string;
  hops:   number;

  constructor(url: string, reason: string, hops: number) {
    super(`Redirect resolve error for ${url}: ${reason} after ${hops} hops`);
    this.url = url;
    this.reason = reason;
    this.hops = hops;
  }
}

// ── Types for deps ──────────────────────────────────────────────────────────

type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>;

export interface ResolverDeps {
  fetchFn?: FetchFn;
}

// ── resolveRedirectChain ────────────────────────────────────────────────────

export async function resolveRedirectChain(
  url: string,
  max_hops?: number,
  deps?: ResolverDeps,
): Promise<RedirectChain> {
  const maxHops = max_hops ?? MAX_REDIRECT_HOPS;
  const chain: string[] = [url];
  let current = url;

  try {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const visited = new Set<string>([url]);

    for (let hop = 0; hop < maxHops; hop++) {
      let res: Response;
      try {
        res = await fetchFn(current, { redirect: 'manual' });
      } catch {
        // Network error — treat current URL as final
        break;
      }

      const status = res.status;
      if (status !== 301 && status !== 302 && status !== 307 && status !== 308) {
        // Not a redirect — current is the final URL
        break;
      }

      const location = res.headers?.get?.('location') ?? '';
      if (!location) break;

      // Resolve relative URLs
      let nextUrl: string;
      try {
        nextUrl = new URL(location, current).href;
      } catch {
        nextUrl = location;
      }

      // Circular detection
      if (visited.has(nextUrl)) {
        return {
          original_url:      url,
          final_url:         current,
          hops:              chain.length - 1,
          chain,
          is_redirect:       true,
          circular_detected: true,
          max_hops_exceeded: false,
        };
      }

      visited.add(nextUrl);
      chain.push(nextUrl);
      current = nextUrl;
    }

    // Check if we hit max hops
    if (chain.length - 1 >= maxHops) {
      return {
        original_url:      url,
        final_url:         current,
        hops:              chain.length - 1,
        chain,
        is_redirect:       true,
        circular_detected: false,
        max_hops_exceeded: true,
      };
    }

    const is_redirect = chain.length > 1;
    return {
      original_url:      url,
      final_url:         current,
      hops:              chain.length - 1,
      chain,
      is_redirect,
      circular_detected: false,
      max_hops_exceeded: false,
    };
  } catch {
    return {
      original_url:      url,
      final_url:         url,
      hops:              0,
      chain:             [url],
      is_redirect:       false,
      circular_detected: false,
      max_hops_exceeded: false,
    };
  }
}

// ── resolveAllRedirects ─────────────────────────────────────────────────────

export async function resolveAllRedirects(
  urls: string[],
  deps?: { resolveFn?: (url: string) => Promise<RedirectChain> },
): Promise<RedirectChain[]> {
  try {
    if (!Array.isArray(urls) || urls.length === 0) return [];
    const resolve = deps?.resolveFn ?? resolveRedirectChain;

    // Process in batches of 5 for concurrency control
    const results: RedirectChain[] = [];
    const batchSize = 5;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(u => resolve(u)));
      results.push(...batchResults);
    }

    return results;
  } catch {
    return [];
  }
}

// ── deduplicateByFinalUrl ───────────────────────────────────────────────────

export function deduplicateByFinalUrl(
  chains: RedirectChain[],
  deps?: { logFn?: (msg: string) => void },
): RedirectChain[] {
  try {
    if (!Array.isArray(chains)) return [];
    const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
    const seen = new Map<string, RedirectChain>();
    const result: RedirectChain[] = [];

    for (const chain of chains) {
      if (seen.has(chain.final_url)) {
        log(`[WP_CRAWLER] Deduped redirect: ${chain.original_url} → ${chain.final_url}`);
        continue;
      }
      seen.set(chain.final_url, chain);
      result.push(chain);
    }

    return result;
  } catch {
    return [];
  }
}
