/**
 * tools/ai-visibility/google_aio_simulator.ts
 *
 * Simulates Google AI Overview presence for dev/demo.
 * Real SERP integration via SerpAPI comes in a future sprint.
 * Never throws.
 */

import { buildCitation, type AICitation } from './citation.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoogleAIOResult {
  query:                 string;
  has_ai_overview:       boolean;
  your_domain_cited:     boolean;
  cited_domains:         string[];
  ai_overview_text?:     string;
  position_in_overview?: number;
  traditional_rank?:     number;
  simulated:             true;
}

// ── Deterministic hash ──────────────────────────────────────────────────────

function simHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ── Competitor domains ──────────────────────────────────────────────────────

const COMPETITOR_POOLS = [
  'shopify.com', 'bigcommerce.com', 'woocommerce.com',
  'magento.com', 'squarespace.com', 'wix.com',
  'webflow.com', 'volusion.com', 'ecwid.com',
  'prestashop.com', 'opencart.com', 'shift4shop.com',
];

function pickCitedDomains(query: string, domain: string, cited: boolean): string[] {
  const h = simHash(query + 'domains');
  const count = 3 + (h % 3); // 3-5 domains
  const domains: string[] = [];
  if (cited) domains.push(domain);
  for (let i = 0; i < COMPETITOR_POOLS.length && domains.length < count; i++) {
    const idx = (h + i * 7) % COMPETITOR_POOLS.length;
    const d = COMPETITOR_POOLS[idx];
    if (d !== domain && !domains.includes(d)) domains.push(d);
  }
  return domains.slice(0, count);
}

// ── AI Overview text templates ──────────────────────────────────────────────

const OVERVIEW_TEMPLATES = [
  'Based on multiple sources, {query} involves several key considerations including product selection, pricing strategy, and customer experience optimization.',
  'When looking at {query}, experts recommend focusing on quality, user experience, and search visibility to maximize results.',
  'For {query}, the most effective approach combines technical optimization with content quality and brand authority signals.',
  'Research suggests that {query} benefits most from a data-driven strategy that prioritizes measurable outcomes and continuous improvement.',
  '{query} is a growing area where businesses can gain competitive advantage through structured data, fast page loads, and authoritative content.',
];

// ── simulateGoogleAIO ───────────────────────────────────────────────────────

export function simulateGoogleAIO(query: string, domain: string): GoogleAIOResult {
  try {
    const qHash = simHash(query);
    const has_ai_overview = qHash % 4 !== 0; // 75% rate

    if (!has_ai_overview) {
      return {
        query,
        has_ai_overview: false,
        your_domain_cited: false,
        cited_domains: [],
        traditional_rank: 1 + (qHash % 20),
        simulated: true,
      };
    }

    const citationHash = simHash(query + domain + 'aio');
    const your_domain_cited = citationHash % 4 === 0; // 25% citation rate when AIO present

    const templateIdx = qHash % OVERVIEW_TEMPLATES.length;
    const ai_overview_text = OVERVIEW_TEMPLATES[templateIdx].replace('{query}', query);

    return {
      query,
      has_ai_overview: true,
      your_domain_cited,
      cited_domains: pickCitedDomains(query, domain, your_domain_cited),
      ai_overview_text,
      position_in_overview: your_domain_cited ? 1 + (citationHash % 5) : undefined,
      traditional_rank: 1 + (qHash % 20),
      simulated: true,
    };
  } catch {
    return {
      query: query ?? '',
      has_ai_overview: false,
      your_domain_cited: false,
      cited_domains: [],
      simulated: true,
    };
  }
}

// ── simulateGoogleAIOBatch ──────────────────────────────────────────────────

export function simulateGoogleAIOBatch(domain: string, queries: string[]): GoogleAIOResult[] {
  try {
    return (queries ?? []).map((q) => simulateGoogleAIO(q, domain));
  } catch {
    return [];
  }
}

// ── buildAIOCitations ───────────────────────────────────────────────────────

export function buildAIOCitations(
  site_id: string,
  domain: string,
  aio_results: GoogleAIOResult[],
): AICitation[] {
  try {
    return (aio_results ?? []).map((r) =>
      buildCitation(site_id, {
        url: `https://${domain}/`,
        domain,
        query: r.query,
        source: 'google_ai_overview',
        cited: r.your_domain_cited,
        position: r.your_domain_cited ? r.position_in_overview : undefined,
        snippet: r.ai_overview_text,
        confidence: r.your_domain_cited ? 0.9 : 0.05,
        query_category: 'informational',
        is_branded: false,
        is_competitor: false,
      }),
    );
  } catch {
    return [];
  }
}
