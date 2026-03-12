/**
 * tools/ai-visibility/citation.ts
 */

import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AICitationSource =
  | 'perplexity'
  | 'google_ai_overview'
  | 'chatgpt'
  | 'bing_copilot'
  | 'unknown';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface AICitation {
  citation_id:    string;
  site_id:        string;
  url:            string;
  domain:         string;
  query:          string;
  source:         AICitationSource;
  cited:          boolean;
  position?:      number;
  snippet?:       string;
  confidence:     number;
  detected_at:    string;
  query_category: string;
  is_branded:     boolean;
  is_competitor:  boolean;
}

export interface AICitationSummary {
  site_id:                string;
  domain:                 string;
  total_queries_checked:  number;
  total_citations:        number;
  citation_rate:          number;
  by_source:              Record<AICitationSource, number>;
  branded_citation_rate:  number;
  top_cited_urls:         string[];
  top_cited_queries:      string[];
  computed_at:            string;
}

// ── buildCitation ─────────────────────────────────────────────────────────────

export function buildCitation(
  site_id: string,
  fields:  Omit<AICitation, 'citation_id' | 'site_id' | 'detected_at'>,
): AICitation {
  try {
    return {
      citation_id: randomUUID(),
      site_id,
      detected_at: new Date().toISOString(),
      ...fields,
    };
  } catch {
    return {
      citation_id:    randomUUID(),
      site_id:        site_id ?? '',
      url:            '',
      domain:         '',
      query:          '',
      source:         'unknown',
      cited:          false,
      confidence:     0,
      detected_at:    new Date().toISOString(),
      query_category: 'informational',
      is_branded:     false,
      is_competitor:  false,
    };
  }
}

// ── buildCitationSummary ──────────────────────────────────────────────────────

const ALL_SOURCES: AICitationSource[] = [
  'perplexity', 'google_ai_overview', 'chatgpt', 'bing_copilot', 'unknown',
];

export function buildCitationSummary(
  site_id:   string,
  domain:    string,
  citations: AICitation[],
): AICitationSummary {
  try {
    const safe   = citations ?? [];
    const cited  = safe.filter(c => c.cited);

    // by_source
    const by_source = Object.fromEntries(
      ALL_SOURCES.map(s => [s, cited.filter(c => c.source === s).length]),
    ) as Record<AICitationSource, number>;

    // branded
    const brandedAll    = safe.filter(c => c.is_branded);
    const brandedCited  = brandedAll.filter(c => c.cited);
    const branded_citation_rate = brandedAll.length > 0
      ? brandedCited.length / brandedAll.length
      : 0;

    // top cited URLs
    const urlCounts = new Map<string, number>();
    for (const c of cited) {
      urlCounts.set(c.url, (urlCounts.get(c.url) ?? 0) + 1);
    }
    const top_cited_urls = [...urlCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([url]) => url);

    // top cited queries
    const queryCounts = new Map<string, number>();
    for (const c of cited) {
      queryCounts.set(c.query, (queryCounts.get(c.query) ?? 0) + 1);
    }
    const top_cited_queries = [...queryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([q]) => q);

    return {
      site_id,
      domain,
      total_queries_checked: safe.length,
      total_citations:       cited.length,
      citation_rate:         safe.length > 0 ? cited.length / safe.length : 0,
      by_source,
      branded_citation_rate,
      top_cited_urls,
      top_cited_queries,
      computed_at: new Date().toISOString(),
    };
  } catch {
    return {
      site_id:               site_id ?? '',
      domain:                domain ?? '',
      total_queries_checked: 0,
      total_citations:       0,
      citation_rate:         0,
      by_source:             Object.fromEntries(ALL_SOURCES.map(s => [s, 0])) as Record<AICitationSource, number>,
      branded_citation_rate: 0,
      top_cited_urls:        [],
      top_cited_queries:     [],
      computed_at:           new Date().toISOString(),
    };
  }
}
