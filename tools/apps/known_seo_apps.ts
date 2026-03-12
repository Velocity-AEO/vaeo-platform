/**
 * tools/apps/known_seo_apps.ts
 *
 * Catalog of common Shopify SEO apps that VAEO replaces.
 * Pure functions — no I/O, never throws.
 */

import type { AppCategory } from './app_replacement_library.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface KnownApp {
  name:                       string;
  category:                   AppCategory;
  what_vaeo_replaces:         string;
  estimated_monthly_cost_usd: number;
  notes:                      string;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export const KNOWN_SEO_APPS: KnownApp[] = [
  {
    name:                       'SEO Manager',
    category:                   'seo',
    what_vaeo_replaces:         'Title/meta automation',
    estimated_monthly_cost_usd: 20,
    notes:                      'VAEO automates title and meta tag optimization with confidence scoring and one-click deploy.',
  },
  {
    name:                       'Smart SEO',
    category:                   'seo',
    what_vaeo_replaces:         'Meta tag and schema generation',
    estimated_monthly_cost_usd: 10,
    notes:                      'VAEO provides automated meta tag fixes and schema.org injection with before/after previews.',
  },
  {
    name:                       'JSON-LD for SEO',
    category:                   'structured_data',
    what_vaeo_replaces:         'Schema.org injection',
    estimated_monthly_cost_usd: 14,
    notes:                      'VAEO injects validated JSON-LD schema directly into theme templates with rollback support.',
  },
  {
    name:                       'TinyIMG',
    category:                   'image_optimization',
    what_vaeo_replaces:         'Image compression and WebP',
    estimated_monthly_cost_usd: 9,
    notes:                      'VAEO detects unoptimized images and generates optimization plans as part of the SEO audit.',
  },
  {
    name:                       'Image Optimizer',
    category:                   'image_optimization',
    what_vaeo_replaces:         'WebP conversion and lazy load',
    estimated_monthly_cost_usd: 7,
    notes:                      'VAEO handles image optimization detection within the broader performance analysis pipeline.',
  },
  {
    name:                       'SEO Image Optimizer',
    category:                   'image_optimization',
    what_vaeo_replaces:         'Alt tag and image SEO',
    estimated_monthly_cost_usd: 0,
    notes:                      'VAEO detects missing alt tags and generates optimized alternatives automatically.',
  },
  {
    name:                       'Plug In SEO',
    category:                   'seo',
    what_vaeo_replaces:         'SEO audit and fixes',
    estimated_monthly_cost_usd: 20,
    notes:                      'VAEO provides continuous SEO auditing with automated fix generation and deployment.',
  },
  {
    name:                       'Schema Plus for SEO',
    category:                   'structured_data',
    what_vaeo_replaces:         'Product and review schema',
    estimated_monthly_cost_usd: 14,
    notes:                      'VAEO generates and injects product, review, and vehicle schema with validation.',
  },
  {
    name:                       'Redirectify',
    category:                   'redirects',
    what_vaeo_replaces:         '301 redirect management',
    estimated_monthly_cost_usd: 10,
    notes:                      'VAEO detects broken links and manages 301 redirects through the Shopify API.',
  },
  {
    name:                       'Easy Redirects',
    category:                   'redirects',
    what_vaeo_replaces:         'Bulk redirect management',
    estimated_monthly_cost_usd: 20,
    notes:                      'VAEO handles bulk redirect creation and management as part of the 404 resolution pipeline.',
  },
];

// ── Lookup ───────────────────────────────────────────────────────────────────

export function findKnownApp(name: string): KnownApp | null {
  const lower = name.toLowerCase();
  return KNOWN_SEO_APPS.find((a) => a.name.toLowerCase() === lower) ?? null;
}

// ── Savings calculator ───────────────────────────────────────────────────────

export function calculateMonthlySavings(replaced_apps: KnownApp[]): number {
  return replaced_apps.reduce((sum, app) => sum + app.estimated_monthly_cost_usd, 0);
}

// ── ROI statement ────────────────────────────────────────────────────────────

export function generateROIStatement(
  replaced_apps:     KnownApp[],
  vaeo_monthly_cost: number,
): string {
  const savings = calculateMonthlySavings(replaced_apps);
  const count   = replaced_apps.length;
  const net     = vaeo_monthly_cost - savings;

  if (net <= 0) {
    return `VAEO replaced ${count} app${count !== 1 ? 's' : ''} saving $${savings}/month. ` +
           `At $${vaeo_monthly_cost}/month VAEO saves you $${Math.abs(net)}/month ` +
           `while delivering automated execution those apps never provided.`;
  }

  return `VAEO replaced ${count} app${count !== 1 ? 's' : ''} saving $${savings}/month. ` +
         `At $${vaeo_monthly_cost}/month VAEO costs $${net}/month more ` +
         `but delivers automated execution those apps never provided.`;
}
