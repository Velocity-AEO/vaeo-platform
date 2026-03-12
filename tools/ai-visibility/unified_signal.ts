/**
 * tools/ai-visibility/unified_signal.ts
 *
 * Aggregates Perplexity and Google AI Overview citation signals
 * into a unified AI visibility measurement. Never throws.
 */

import { randomUUID } from 'node:crypto';
import {
  buildCitationSummary,
  type AICitation,
  type AICitationSource,
  type AICitationSummary,
} from './citation.js';
import { buildQuerySet } from './query_generator.js';
import { simulatePerplexityBatch } from './perplexity_simulator.js';
import {
  simulateGoogleAIOBatch,
  buildAIOCitations,
} from './google_aio_simulator.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UnifiedAISignal {
  signal_id:              string;
  site_id:                string;
  domain:                 string;
  perplexity_citation_rate:  number;
  google_aio_citation_rate:  number;
  combined_citation_rate:    number;
  combined_score:            number;
  total_queries:             number;
  total_citations:           number;
  citations_by_source:       Record<AICitationSource, number>;
  strongest_source:          AICitationSource;
  weakest_source:            AICitationSource;
  trend:                     'improving' | 'stable' | 'declining';
  computed_at:               string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ALL_SOURCES: AICitationSource[] = [
  'perplexity', 'google_ai_overview', 'chatgpt', 'bing_copilot', 'unknown',
];

function computeRate(citations: AICitation[]): number {
  if (!citations || citations.length === 0) return 0;
  return citations.filter((c) => c.cited).length / citations.length;
}

// ── buildUnifiedSignal ──────────────────────────────────────────────────────

export function buildUnifiedSignal(
  site_id: string,
  domain: string,
  perplexity_citations: AICitation[],
  google_citations: AICitation[],
): UnifiedAISignal {
  try {
    const pCitations = perplexity_citations ?? [];
    const gCitations = google_citations ?? [];
    const all = [...pCitations, ...gCitations];

    const pRate = computeRate(pCitations);
    const gRate = computeRate(gCitations);
    const combinedRate = (pRate + gRate) / 2;
    const combinedScore = Math.min(100, Math.max(0, Math.round(combinedRate * 100)));

    const totalCited = all.filter((c) => c.cited).length;

    // Count by source
    const bySource = Object.fromEntries(
      ALL_SOURCES.map((s) => [s, all.filter((c) => c.source === s && c.cited).length]),
    ) as Record<AICitationSource, number>;

    // Find strongest and weakest among active sources
    const activeSources: AICitationSource[] = ['perplexity', 'google_ai_overview'];
    const sourceRates: Array<{ source: AICitationSource; rate: number }> = [
      { source: 'perplexity', rate: pRate },
      { source: 'google_ai_overview', rate: gRate },
    ];
    sourceRates.sort((a, b) => b.rate - a.rate);

    return {
      signal_id: randomUUID(),
      site_id,
      domain,
      perplexity_citation_rate: pRate,
      google_aio_citation_rate: gRate,
      combined_citation_rate: combinedRate,
      combined_score: combinedScore,
      total_queries: all.length,
      total_citations: totalCited,
      citations_by_source: bySource,
      strongest_source: sourceRates[0]?.source ?? 'perplexity',
      weakest_source: sourceRates[sourceRates.length - 1]?.source ?? 'google_ai_overview',
      trend: 'improving', // Simulated for now
      computed_at: new Date().toISOString(),
    };
  } catch {
    return {
      signal_id: randomUUID(),
      site_id: site_id ?? '',
      domain: domain ?? '',
      perplexity_citation_rate: 0,
      google_aio_citation_rate: 0,
      combined_citation_rate: 0,
      combined_score: 0,
      total_queries: 0,
      total_citations: 0,
      citations_by_source: Object.fromEntries(ALL_SOURCES.map((s) => [s, 0])) as Record<AICitationSource, number>,
      strongest_source: 'perplexity',
      weakest_source: 'google_ai_overview',
      trend: 'stable',
      computed_at: new Date().toISOString(),
    };
  }
}

// ── generateUnifiedReport ───────────────────────────────────────────────────

export async function generateUnifiedReport(
  site_id: string,
  domain: string,
  brand_name?: string,
  product_keywords?: string[],
): Promise<{
  signal: UnifiedAISignal;
  perplexity_citations: AICitation[];
  google_citations: AICitation[];
  all_citations: AICitation[];
  summary: AICitationSummary;
}> {
  try {
    const queries = buildQuerySet(site_id, domain, brand_name ?? domain, product_keywords);

    // Run both simulators concurrently
    const [perplexityCitations, googleAIOResults] = await Promise.all([
      Promise.resolve(
        simulatePerplexityBatch(
          site_id,
          domain,
          queries.map((q) => ({ query: q.query, category: q.category })),
        ),
      ),
      Promise.resolve(
        simulateGoogleAIOBatch(domain, queries.map((q) => q.query)),
      ),
    ]);

    const googleCitations = buildAIOCitations(site_id, domain, googleAIOResults);
    const allCitations = [...perplexityCitations, ...googleCitations];

    const signal = buildUnifiedSignal(site_id, domain, perplexityCitations, googleCitations);
    const summary = buildCitationSummary(site_id, domain, allCitations);

    return {
      signal,
      perplexity_citations: perplexityCitations,
      google_citations: googleCitations,
      all_citations: allCitations,
      summary,
    };
  } catch {
    const emptySignal = buildUnifiedSignal(site_id, domain, [], []);
    const emptySummary = buildCitationSummary(site_id, domain, []);
    return {
      signal: emptySignal,
      perplexity_citations: [],
      google_citations: [],
      all_citations: [],
      summary: emptySummary,
    };
  }
}
