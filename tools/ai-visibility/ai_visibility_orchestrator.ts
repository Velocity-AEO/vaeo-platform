/**
 * tools/ai-visibility/ai_visibility_orchestrator.ts
 */

import { randomUUID } from 'node:crypto';
import { buildQuerySet } from './query_generator.js';
import { simulateCitationCheck } from './perplexity_simulator.js';
import { buildCitationSummary, type AICitation, type AICitationSummary } from './citation.js';

// ── AIVisibilityReport interface ──────────────────────────────────────────────

export interface AIVisibilityReport {
  report_id:            string;
  site_id:              string;
  domain:               string;
  queries_checked:      number;
  citations_found:      number;
  citation_rate:        number;
  perplexity_citations: AICitation[];
  summary:              AICitationSummary;
  top_cited_queries:    string[];
  top_missed_queries:   string[];
  recommendations:      string[];
  generated_at:         string;
  simulated:            boolean;
}

// ── Recommendations ───────────────────────────────────────────────────────────

function buildRecommendations(citation_rate: number): string[] {
  if (citation_rate < 0.2) {
    return [
      'Add FAQ schema to key pages to improve AI citation rate',
      'Ensure product pages have clear, factual descriptions',
    ];
  }
  if (citation_rate < 0.5) {
    return [
      'Good AI visibility — expand schema coverage to improve further',
      'Add speakable schema to top-performing pages',
    ];
  }
  return [
    'Strong AI visibility — focus on maintaining content quality',
    'Consider adding HowTo schema for instructional content',
  ];
}

// ── generateAIVisibilityReport ────────────────────────────────────────────────

export async function generateAIVisibilityReport(
  site_id:          string,
  domain:           string,
  brand_name?:      string,
  product_keywords?: string[],
): Promise<AIVisibilityReport> {
  try {
    const brand = brand_name ?? (domain ?? '').split('.')[0] ?? 'brand';

    // 1. Build query set
    const queries = buildQuerySet(site_id, domain, brand, product_keywords);

    // 2. Run citation check via perplexity simulator
    const citations = simulateCitationCheck(site_id, domain, queries);

    // 3. Build summary
    const summary = buildCitationSummary(site_id, domain, citations);

    // 4. Recommendations based on citation_rate
    const recommendations = buildRecommendations(summary.citation_rate);

    // 5. top_missed_queries: non-cited queries, top 5
    const missed = citations
      .filter(c => !c.cited)
      .map(c => c.query)
      .filter((q, i, a) => a.indexOf(q) === i) // dedupe
      .slice(0, 5);

    return {
      report_id:            randomUUID(),
      site_id,
      domain,
      queries_checked:      queries.length,
      citations_found:      summary.total_citations,
      citation_rate:        summary.citation_rate,
      perplexity_citations: citations,
      summary,
      top_cited_queries:    summary.top_cited_queries,
      top_missed_queries:   missed,
      recommendations,
      generated_at:         new Date().toISOString(),
      simulated:            true,
    };
  } catch {
    const emptySummary = buildCitationSummary(site_id ?? '', domain ?? '', []);
    return {
      report_id:            randomUUID(),
      site_id:              site_id ?? '',
      domain:               domain ?? '',
      queries_checked:      0,
      citations_found:      0,
      citation_rate:        0,
      perplexity_citations: [],
      summary:              emptySummary,
      top_cited_queries:    [],
      top_missed_queries:   [],
      recommendations:      buildRecommendations(0),
      generated_at:         new Date().toISOString(),
      simulated:            true,
    };
  }
}
