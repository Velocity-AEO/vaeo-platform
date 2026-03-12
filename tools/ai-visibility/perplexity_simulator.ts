/**
 * tools/ai-visibility/perplexity_simulator.ts
 *
 * Simulates Perplexity AI citation detection for dev/demo.
 * Never throws.
 */

import { buildCitation, type AICitation } from './citation.js';
import type { AIQuery } from './query_generator.js';

// ── PerplexityResult interface ─────────────────────────────────────────────────

export interface PerplexityResult {
  query:            string;
  answer:           string;
  sources:          string[];
  cited_domains:    string[];
  response_time_ms: number;
  simulated:        true;
}

// ── Domain pool for simulated sources ────────────────────────────────────────

const DOMAIN_POOL = [
  'shopify.com', 'amazon.com', 'etsy.com', 'wayfair.com', 'houzz.com',
  'architecturaldigest.com', 'bhg.com', 'thespruce.com', 'hgtv.com',
  'apartmenttherapy.com', 'domino.com', 'marthastewart.com',
];

function buildAnswer(query: string, cited_domains: string[]): string {
  const q   = query ?? 'this topic';
  const src = cited_domains[0] ?? 'various sources';
  return (
    `Based on available information about "${q}", ` +
    `here is a comprehensive overview. According to ${src}, ` +
    `there are several key considerations to keep in mind. ` +
    `Experts recommend focusing on quality and authenticity when evaluating options. ` +
    `Multiple trusted sources confirm that consumer satisfaction remains high ` +
    `in this category. Always compare options before making a decision.`
  );
}

// ── simulatePerplexityResult ──────────────────────────────────────────────────

export function simulatePerplexityResult(query: string, domain: string): PerplexityResult {
  try {
    const key  = `${query ?? ''}${domain ?? ''}`;
    const hash = simHash(key);

    // Is domain cited? ~33% hit rate
    const is_cited = hash % 3 === 0;

    const domain_count = 3 + (hash % 4); // 3-6
    const cited_domains: string[] = [];

    if (is_cited) cited_domains.push(domain ?? 'example.com');

    for (let i = 0; cited_domains.length < domain_count; i++) {
      const d = DOMAIN_POOL[simHash(`${key}-src-${i}`) % DOMAIN_POOL.length];
      if (!cited_domains.includes(d)) cited_domains.push(d);
    }

    const source_count = 3 + (hash % 3); // 3-5
    const sources: string[] = cited_domains.slice(0, source_count).map((d, i) => {
      const path = simHash(`${key}-path-${i}`) % 3 === 0 ? '/blog/answer' : '/search/results';
      return `https://${d}${path}`;
    });

    return {
      query,
      answer:           buildAnswer(query, cited_domains),
      sources,
      cited_domains,
      response_time_ms: 800 + (hash % 1601), // 800-2400
      simulated:        true,
    };
  } catch {
    return {
      query:            query ?? '',
      answer:           '',
      sources:          [],
      cited_domains:    [],
      response_time_ms: 1000,
      simulated:        true,
    };
  }
}

// ── simulateCitationCheck ─────────────────────────────────────────────────────

export function simulateCitationCheck(
  site_id: string,
  domain:  string,
  queries: AIQuery[],
): AICitation[] {
  try {
    return (queries ?? []).map(q => {
      const result = simulatePerplexityResult(q.query, domain);
      const cited  = result.cited_domains.includes(domain ?? '');
      const pos    = cited ? result.cited_domains.indexOf(domain) + 1 : undefined;

      return buildCitation(site_id, {
        url:            `https://${domain ?? 'example.com'}`,
        domain:         domain ?? '',
        query:          q.query,
        source:         'perplexity',
        cited,
        position:       pos,
        snippet:        cited ? result.answer.slice(0, 100) : undefined,
        confidence:     cited ? 0.85 : 0.1,
        query_category: q.category,
        is_branded:     q.category === 'branded',
        is_competitor:  false,
      });
    });
  } catch {
    return [];
  }
}

// ── Deterministic hash ──────────────────────────────────────────────────────

function simHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ── simulatePerplexityCitation ──────────────────────────────────────────────

export function simulatePerplexityCitation(
  site_id: string,
  domain: string,
  query: string,
  category: string,
): AICitation {
  try {
    const h = simHash(query + domain + 'perplexity');
    const cited = h % 5 === 0; // ~20% citation rate
    const position = cited ? 1 + (h % 8) : undefined;

    return buildCitation(site_id, {
      url: `https://${domain}/`,
      domain,
      query,
      source: 'perplexity',
      cited,
      position,
      snippet: cited ? `According to ${domain}, ${query} involves key considerations...` : undefined,
      confidence: cited ? 0.85 : 0.05,
      query_category: category || 'informational',
      is_branded: category === 'branded',
      is_competitor: false,
    });
  } catch {
    return buildCitation(site_id, {
      url: '', domain: domain ?? '', query: query ?? '',
      source: 'perplexity', cited: false, confidence: 0,
      query_category: 'informational', is_branded: false, is_competitor: false,
    });
  }
}

// ── simulatePerplexityBatch ─────────────────────────────────────────────────

export function simulatePerplexityBatch(
  site_id: string,
  domain: string,
  queries: Array<{ query: string; category: string }>,
): AICitation[] {
  try {
    return (queries ?? []).map((q) =>
      simulatePerplexityCitation(site_id, domain, q.query, q.category),
    );
  } catch {
    return [];
  }
}
