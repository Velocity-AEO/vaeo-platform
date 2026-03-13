/**
 * tools/link_graph/external_link_checker.ts
 *
 * Checks every outbound external link for status, redirects,
 * domain reputation, and equity signals.
 * Never throws.
 */

import type { ExternalLink } from './link_graph_types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DomainReputation = 'trusted' | 'unknown' | 'low_value' | 'spammy' | 'unchecked';

export interface ExternalLinkCheckResult {
  url:                string;
  destination_url:    string;
  destination_domain: string;
  status_code:        number | null;
  is_broken:          boolean;
  is_redirect:        boolean;
  final_url:          string | null;
  redirect_hops:      number;
  response_time_ms:   number;
  is_nofollow:        boolean;
  domain_reputation:  DomainReputation;
  check_error:        string | null;
  checked_at:         string;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const LOW_VALUE_TLDS: string[] = [
  '.xyz', '.click', '.link', '.info',
  '.biz', '.top', '.win', '.loan',
  '.download', '.stream', '.gq',
  '.ml', '.cf', '.ga', '.tk',
];

export const TRUSTED_DOMAINS: string[] = [
  'google.com', 'youtube.com',
  'facebook.com', 'twitter.com',
  'instagram.com', 'linkedin.com',
  'wikipedia.org', 'amazon.com',
  'apple.com', 'microsoft.com',
  'github.com', 'shopify.com',
  'wordpress.org', 'gov', 'edu',
];

// ── classifyDomainReputation ─────────────────────────────────────────────────

export function classifyDomainReputation(domain: string): DomainReputation {
  try {
    if (!domain) return 'unknown';
    const d = domain.toLowerCase().replace(/^www\./, '');

    // Trusted: exact match or ends with .gov / .edu
    if (
      TRUSTED_DOMAINS.some(td => d === td || d.endsWith(`.${td}`)) ||
      d.endsWith('.gov') ||
      d.endsWith('.edu')
    ) {
      return 'trusted';
    }

    // Low-value: TLD in list
    if (LOW_VALUE_TLDS.some(tld => d.endsWith(tld))) {
      return 'low_value';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── checkExternalLink ────────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkExternalLink(
  source_url:      string,
  destination_url: string,
  deps?:           { fetchFn?: FetchFn },
): Promise<ExternalLinkCheckResult> {
  const checked_at = new Date().toISOString();
  const domain     = extractDomain(destination_url);
  const reputation = classifyDomainReputation(domain);

  const empty = (overrides: Partial<ExternalLinkCheckResult>): ExternalLinkCheckResult => ({
    url:                source_url ?? '',
    destination_url:    destination_url ?? '',
    destination_domain: domain,
    status_code:        null,
    is_broken:          false,
    is_redirect:        false,
    final_url:          null,
    redirect_hops:      0,
    response_time_ms:   0,
    is_nofollow:        false,
    domain_reputation:  reputation,
    check_error:        null,
    checked_at,
    ...overrides,
  });

  try {
    if (!destination_url) {
      return empty({ is_broken: true, check_error: 'empty destination_url' });
    }

    const fetchFn = deps?.fetchFn ?? defaultFetch;
    const start   = Date.now();

    // Try HEAD first, fall back to GET on failure
    let res: Response | null = null;
    let finalUrl: string     = destination_url;
    let redirectHops         = 0;
    let statusCode: number | null = null;
    let checkError: string | null = null;

    try {
      res = await fetchFn(destination_url, {
        method:   'HEAD',
        redirect: 'follow',
        signal:   AbortSignal.timeout(10000),
        headers:  { 'User-Agent': 'VAEO-LinkChecker/1.0' },
      });
    } catch {
      // HEAD failed — try GET
      try {
        res = await fetchFn(destination_url, {
          method:   'GET',
          redirect: 'follow',
          signal:   AbortSignal.timeout(10000),
          headers:  { 'User-Agent': 'VAEO-LinkChecker/1.0' },
        });
      } catch (e) {
        checkError = e instanceof Error ? e.message : String(e);
      }
    }

    const response_time_ms = Date.now() - start;

    if (res) {
      statusCode = res.status;
      finalUrl   = res.url || destination_url;
      redirectHops = finalUrl !== destination_url ? 1 : 0;
    }

    const is_broken   = res === null || (statusCode !== null && statusCode >= 400);
    const is_redirect = redirectHops > 0;

    return empty({
      status_code:      statusCode,
      is_broken,
      is_redirect,
      final_url:        is_redirect ? finalUrl : null,
      redirect_hops:    redirectHops,
      response_time_ms,
      check_error:      checkError,
    });
  } catch (e) {
    return empty({
      is_broken:   true,
      check_error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ── checkAllExternalLinks ────────────────────────────────────────────────────

const BATCH_SIZE  = 10;
const BATCH_DELAY = 500; // ms

export async function checkAllExternalLinks(
  site_id:        string,
  external_links: ExternalLink[],
  deps?: {
    checkFn?: (src: string, dest: string) => Promise<ExternalLinkCheckResult>;
    saveFn?:  (results: ExternalLinkCheckResult[]) => Promise<boolean>;
  },
): Promise<ExternalLinkCheckResult[]> {
  try {
    if (!Array.isArray(external_links) || external_links.length === 0) return [];

    const checkFn = deps?.checkFn
      ?? ((src: string, dest: string) => checkExternalLink(src, dest));

    // Deduplicate by destination_url — check each destination once
    const seen   = new Map<string, string>(); // dest → source
    for (const link of external_links) {
      if (link?.destination_url && !seen.has(link.destination_url)) {
        seen.set(link.destination_url, link.source_url ?? '');
      }
    }

    const pairs   = [...seen.entries()]; // [dest, source]
    const results: ExternalLinkCheckResult[] = [];

    // Process in batches
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(([dest, src]) => checkFn(src, dest).catch((): ExternalLinkCheckResult => ({
          url:                src,
          destination_url:    dest,
          destination_domain: extractDomain(dest),
          status_code:        null,
          is_broken:          true,
          is_redirect:        false,
          final_url:          null,
          redirect_hops:      0,
          response_time_ms:   0,
          is_nofollow:        false,
          domain_reputation:  classifyDomainReputation(extractDomain(dest)),
          check_error:        'batch check failed',
          checked_at:         new Date().toISOString(),
        }))),
      );

      results.push(...batchResults);

      // Delay between batches (not after the last one)
      if (i + BATCH_SIZE < pairs.length) {
        await delay(BATCH_DELAY);
      }
    }

    // Save (non-fatal)
    if (deps?.saveFn) {
      await deps.saveFn(results).catch(() => {});
    }

    const brokenCount    = results.filter(r => r.is_broken).length;
    const lowValueCount  = results.filter(r => r.domain_reputation === 'low_value').length;
    process.stderr.write(
      `[EXTERNAL_AUDIT] site=${site_id} checked=${results.length} ` +
      `broken=${brokenCount} low_value=${lowValueCount}\n`,
    );

    return results;
  } catch {
    return [];
  }
}

// ── summarizeExternalAudit ───────────────────────────────────────────────────

export interface ExternalAuditSummary {
  total_checked:             number;
  broken_count:              number;
  redirect_count:            number;
  low_value_domain_count:    number;
  trusted_domain_count:      number;
  no_nofollow_external_count: number;
  avg_response_time_ms:      number | null;
  slowest_domain:            string | null;
  domains_by_link_count:     Array<{ domain: string; count: number }>;
}

export function summarizeExternalAudit(
  results: ExternalLinkCheckResult[],
): ExternalAuditSummary {
  try {
    const rs = Array.isArray(results) ? results : [];

    const broken_count          = rs.filter(r => r.is_broken).length;
    const redirect_count        = rs.filter(r => r.is_redirect).length;
    const low_value_domain_count = rs.filter(r => r.domain_reputation === 'low_value').length;
    const trusted_domain_count   = rs.filter(r => r.domain_reputation === 'trusted').length;
    const no_nofollow_external_count = rs.filter(r => !r.is_nofollow).length;

    // Average response time (exclude check errors)
    const times = rs.map(r => r.response_time_ms).filter((t): t is number => typeof t === 'number' && t > 0);
    const avg_response_time_ms = times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : null;

    // Slowest domain
    let slowest_domain: string | null = null;
    if (rs.length > 0) {
      const sorted = [...rs].sort((a, b) => (b.response_time_ms ?? 0) - (a.response_time_ms ?? 0));
      slowest_domain = sorted[0]?.destination_domain ?? null;
    }

    // Domains by link count
    const domainCount = new Map<string, number>();
    for (const r of rs) {
      if (r.destination_domain) {
        domainCount.set(r.destination_domain, (domainCount.get(r.destination_domain) ?? 0) + 1);
      }
    }
    const domains_by_link_count = [...domainCount.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total_checked:              rs.length,
      broken_count,
      redirect_count,
      low_value_domain_count,
      trusted_domain_count,
      no_nofollow_external_count,
      avg_response_time_ms,
      slowest_domain,
      domains_by_link_count,
    };
  } catch {
    return {
      total_checked:              0,
      broken_count:               0,
      redirect_count:             0,
      low_value_domain_count:     0,
      trusted_domain_count:       0,
      no_nofollow_external_count: 0,
      avg_response_time_ms:       null,
      slowest_domain:             null,
      domains_by_link_count:      [],
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
