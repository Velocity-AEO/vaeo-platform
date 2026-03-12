/**
 * tools/ai-visibility/schema_opportunity.ts
 *
 * Detects schema additions that would most improve AI citation rate.
 * Maps page types to recommended schema for AI visibility.
 *
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type SchemaPriority = 'critical' | 'high' | 'medium' | 'low';

export interface SchemaOpportunity {
  opportunity_id:       string;
  site_id:              string;
  url:                  string;
  page_type:            string;
  current_schema_types: string[];
  missing_schema_types: string[];
  ai_impact_score:      number;
  priority:             SchemaPriority;
  reasoning:            string;
  can_auto_fix:         boolean;
}

export interface PageSchemaInput {
  url:             string;
  page_type:       string;
  existing_schema: string[];
}

// ── Schema map ───────────────────────────────────────────────────────────────

export const SCHEMA_FOR_AI_CITATION: Record<string, string[]> = {
  product:    ['Product', 'FAQPage', 'Review'],
  collection: ['ItemList', 'CollectionPage'],
  article:    ['Article', 'FAQPage', 'HowTo', 'Speakable'],
  homepage:   ['Organization', 'WebSite', 'FAQPage'],
  contact:    ['LocalBusiness', 'ContactPage'],
};

const DEFAULT_SCHEMA = ['WebPage', 'FAQPage'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const IMPACT_SCORES: Record<string, number> = {
  FAQPage: 40,
  Speakable: 35,
  Product: 30,
  Organization: 25,
  Article: 20,
};

const REASONING: Record<string, string> = {
  FAQPage: 'FAQPage schema is the #1 driver of AI citations — structured Q&A is directly consumable by LLMs',
  Speakable: 'Speakable schema marks content as ideal for voice/AI assistants to read aloud',
  Product: 'Product schema enables AI to surface pricing, availability, and reviews in answers',
  Organization: 'Organization schema helps AI identify and cite your brand correctly',
  Article: 'Article schema signals authoritative content to AI summarization engines',
  Review: 'Review schema provides social proof that AI tools use to recommend products',
  HowTo: 'HowTo schema creates step-by-step content that AI assistants love to cite',
  ItemList: 'ItemList schema helps AI understand and reference your product collections',
  CollectionPage: 'CollectionPage schema signals browsable category pages to AI crawlers',
  WebSite: 'WebSite schema with SearchAction improves AI understanding of your site',
  WebPage: 'WebPage schema provides basic page-level metadata for AI indexing',
  LocalBusiness: 'LocalBusiness schema enables AI to cite your location, hours, and contact info',
  ContactPage: 'ContactPage schema helps AI direct users to your contact information',
};

function priorityFromScore(score: number): SchemaPriority {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

// ── Detect opportunities ─────────────────────────────────────────────────────

export function detectSchemaOpportunities(
  site_id: string,
  pages: PageSchemaInput[],
): SchemaOpportunity[] {
  try {
    const opportunities: SchemaOpportunity[] = [];

    for (const page of pages) {
      const recommended = SCHEMA_FOR_AI_CITATION[page.page_type] ?? DEFAULT_SCHEMA;
      const missing = recommended.filter((s) => !page.existing_schema.includes(s));

      if (missing.length === 0) continue;

      let ai_impact_score = 0;
      const reasons: string[] = [];

      for (const schema of missing) {
        const impact = IMPACT_SCORES[schema] ?? 10;
        ai_impact_score += impact;
        reasons.push(REASONING[schema] ?? `Adding ${schema} schema improves AI discoverability`);
      }

      ai_impact_score = Math.min(100, ai_impact_score);

      opportunities.push({
        opportunity_id: randomUUID(),
        site_id,
        url: page.url,
        page_type: page.page_type,
        current_schema_types: page.existing_schema,
        missing_schema_types: missing,
        ai_impact_score,
        priority: priorityFromScore(ai_impact_score),
        reasoning: reasons.join('. '),
        can_auto_fix: true,
      });
    }

    return opportunities;
  } catch {
    return [];
  }
}

// ── Simulate opportunities ───────────────────────────────────────────────────

export function simulateSchemaOpportunities(
  site_id: string,
  domain: string,
): SchemaOpportunity[] {
  try {
    const seed = simHash(domain);
    const count = 8 + (seed % 5); // 8-12

    const pageTypes = ['product', 'product', 'product', 'collection', 'article', 'article', 'homepage', 'contact', 'product', 'collection', 'article', 'product'];
    const pages: PageSchemaInput[] = [];

    for (let i = 0; i < count; i++) {
      const pt = pageTypes[i % pageTypes.length];
      const pageSeed = simHash(`${domain}-${i}`);

      // Each page has some existing schema, but not all
      const recommended = SCHEMA_FOR_AI_CITATION[pt] ?? DEFAULT_SCHEMA;
      const existing = recommended.filter((_, j) => (pageSeed + j) % 3 === 0);

      pages.push({
        url: `https://${domain}/${pt === 'homepage' ? '' : `${pt}s/page-${i}`}`,
        page_type: pt,
        existing_schema: existing,
      });
    }

    return detectSchemaOpportunities(site_id, pages);
  } catch {
    return [];
  }
}
