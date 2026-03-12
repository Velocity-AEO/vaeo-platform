/**
 * tools/ai-visibility/query_generator.ts
 */

import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueryCategory = 'branded' | 'product' | 'informational' | 'competitor' | 'local';

export interface AIQuery {
  query_id:     string;
  site_id:      string;
  query:        string;
  category:     QueryCategory;
  priority:     number;
  generated_at: string;
}

// ── generateBrandedQueries ────────────────────────────────────────────────────

export function generateBrandedQueries(domain: string, brand_name: string): string[] {
  try {
    const b = brand_name || domain || 'brand';
    return [
      b,
      `${b} reviews`,
      `${b} products`,
      `is ${b} legit`,
      `${b} vs competitors`,
    ];
  } catch {
    return [];
  }
}

// ── generateProductQueries ────────────────────────────────────────────────────

export function generateProductQueries(domain: string, product_keywords: string[]): string[] {
  try {
    const keywords = product_keywords ?? [];
    const queries: string[] = [];
    for (const kw of keywords) {
      queries.push(kw, `best ${kw}`, `where to buy ${kw}`);
      if (queries.length >= 10) break;
    }
    // deduplicate, cap at 10
    return [...new Set(queries)].slice(0, 10);
  } catch {
    return [];
  }
}

// ── generateInformationalQueries ──────────────────────────────────────────────

const DOMAIN_QUERIES: Record<string, string[]> = {
  home_decor: [
    'best home decor brands',
    'boho home decor ideas',
    'coastal furniture online',
    'rattan home accessories',
    'where to buy beach decor',
  ],
  fashion: [
    'best fashion brands online',
    'trendy clothing stores',
    'affordable beach wear',
    'summer fashion must haves',
    'where to buy resort wear',
  ],
  default: [
    'best online boutiques',
    'unique gifts for home',
    'sustainable shopping brands',
    'top rated online stores',
    'best artisan products online',
  ],
};

function inferDomainCategory(domain: string): string {
  const d = (domain ?? '').toLowerCase();
  if (d.includes('furniture') || d.includes('decor') || d.includes('home') ||
      d.includes('cabana') || d.includes('beach') || d.includes('coastal')) {
    return 'home_decor';
  }
  if (d.includes('fashion') || d.includes('clothing') || d.includes('wear') ||
      d.includes('dress') || d.includes('style')) {
    return 'fashion';
  }
  return 'default';
}

export function generateInformationalQueries(domain: string): string[] {
  try {
    const cat = inferDomainCategory(domain);
    return DOMAIN_QUERIES[cat] ?? DOMAIN_QUERIES.default;
  } catch {
    return DOMAIN_QUERIES.default;
  }
}

// ── buildQuerySet ─────────────────────────────────────────────────────────────

export function buildQuerySet(
  site_id:          string,
  domain:           string,
  brand_name:       string,
  product_keywords?: string[],
): AIQuery[] {
  try {
    const now = new Date().toISOString();

    const branded      = generateBrandedQueries(domain, brand_name);
    const product      = generateProductQueries(domain, product_keywords ?? []);
    const informational = generateInformationalQueries(domain);

    const seen = new Set<string>();
    const all: AIQuery[] = [];

    const addQueries = (queries: string[], category: QueryCategory, priority: number) => {
      for (const q of queries) {
        if (!q || seen.has(q)) continue;
        seen.add(q);
        all.push({
          query_id:     randomUUID(),
          site_id,
          query:        q,
          category,
          priority,
          generated_at: now,
        });
      }
    };

    addQueries(branded,       'branded',       1);
    addQueries(product,       'product',        2);
    addQueries(informational, 'informational',  3);

    return all;
  } catch {
    return [];
  }
}
