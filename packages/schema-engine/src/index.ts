/**
 * packages/schema-engine/src/index.ts
 *
 * Schema template engine for Velocity AEO.
 *
 * Generates valid JSON-LD structured data for pages missing it. Uses
 * parameterized templates — not AI — so output is always structurally
 * valid and always matches the page type.
 *
 * Supported page types → schema types:
 *   homepage   → Organization + WebSite
 *   product    → Product
 *   article    → Article
 *   collection → BreadcrumbList (+ FAQPage if faq_items present)
 *   page       → BreadcrumbList (+ FAQPage if faq_items present)
 *   post       → Article
 *
 * Validation rules:
 *   - Output must pass JSON.parse() — validated: false + error in issues[]
 *   - Required fields missing → added to issues[], null used then stripped
 *   - All null / undefined values stripped before final serialization
 *   - Singleton enforcement — duplicate @type blocked, issues=['schema_already_exists_for_type']
 *
 * ActionLog:
 *   stage='schema-engine:generated' — schema produced
 *   stage='schema-engine:skipped'   — singleton check blocked generation
 */

import type { CmsType } from '../../core/types.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type PageType =
  | 'product'
  | 'article'
  | 'homepage'
  | 'collection'
  | 'page'
  | 'post';

export interface SchemaRequest {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  cms:       CmsType;
  url:       string;
  page_type: PageType;
  /** Raw CMS fields. May also carry existing_schema_blocks for singleton check. */
  cms_data:  Record<string, unknown>;
}

export interface SchemaResult {
  /** Compact JSON-LD string, ready to inject into a <script> tag. */
  schema_json: string;
  /** The primary schema @type generated, e.g. 'Product'. */
  schema_type: string;
  /** True when schema_json passes JSON.parse(). */
  validated:   boolean;
  /** Missing required fields or singleton collision message. */
  issues:      string[];
  url:          string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Recursively removes all keys whose value is null or undefined.
 * Operates in-place on plain objects and arrays.
 */
export function stripNulls(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripNulls);
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return obj;
}

/** Reads a string field from cms_data; returns null if missing or non-string. */
function str(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Reads a boolean field; returns null if missing. */
function bool(data: Record<string, unknown>, key: string): boolean | null {
  const v = data[key];
  return typeof v === 'boolean' ? v : null;
}

/** Reads a number field; returns null if missing or NaN. */
function num(data: Record<string, unknown>, key: string): number | null {
  const v = data[key];
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

// ── Template implementations ──────────────────────────────────────────────────

interface TemplateOutput {
  schema:  Record<string, unknown> | Record<string, unknown>[];
  type:    string;   // primary @type for logging + singleton check
  issues:  string[];
}

function buildOrganization(data: Record<string, unknown>): TemplateOutput {
  const issues: string[] = [];
  if (!str(data, 'site_name')) issues.push('missing_required_field:site_name');
  if (!str(data, 'site_url'))  issues.push('missing_required_field:site_url');

  const logoUrl = str(data, 'logo_url');
  const logo = logoUrl
    ? { '@type': 'ImageObject', url: logoUrl }
    : null;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'Organization',
    name:        str(data, 'site_name'),
    url:         str(data, 'site_url'),
    logo,
  };

  return { schema, type: 'Organization', issues };
}

function buildWebSite(data: Record<string, unknown>): TemplateOutput {
  const issues: string[] = [];
  if (!str(data, 'site_name')) issues.push('missing_required_field:site_name');
  if (!str(data, 'site_url'))  issues.push('missing_required_field:site_url');

  const searchUrl = str(data, 'search_url');
  const potentialAction = searchUrl
    ? {
        '@type': 'SearchAction',
        target:  {
          '@type':      'EntryPoint',
          urlTemplate:  `${searchUrl}?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      }
    : null;

  const schema: Record<string, unknown> = {
    '@context':      'https://schema.org',
    '@type':         'WebSite',
    name:             str(data, 'site_name'),
    url:              str(data, 'site_url'),
    potentialAction,
  };

  return { schema, type: 'WebSite', issues };
}

function buildProduct(data: Record<string, unknown>): TemplateOutput {
  const issues: string[] = [];
  if (!str(data, 'product_title')) issues.push('missing_required_field:product_title');
  if (num(data, 'price') === null && !str(data, 'price')) {
    issues.push('missing_required_field:price');
  }

  const available    = bool(data, 'available');
  const availability = available === false
    ? 'https://schema.org/OutOfStock'
    : 'https://schema.org/InStock'; // default InStock when field absent

  const rawPrice = num(data, 'price') ?? str(data, 'price');

  const schema: Record<string, unknown> = {
    '@context':   'https://schema.org',
    '@type':      'Product',
    name:          str(data, 'product_title'),
    description:   str(data, 'product_description'),
    image:         str(data, 'product_image'),
    sku:           str(data, 'sku'),
    offers: {
      '@type':        'Offer',
      price:           rawPrice ?? null,
      priceCurrency:   str(data, 'currency') ?? 'USD',
      availability,
    },
  };

  return { schema, type: 'Product', issues };
}

function buildArticle(data: Record<string, unknown>): TemplateOutput {
  const issues: string[] = [];
  if (!str(data, 'post_title'))    issues.push('missing_required_field:post_title');
  if (!str(data, 'publish_date'))  issues.push('missing_required_field:publish_date');

  const authorName   = str(data, 'author_name');
  const author       = authorName ? { '@type': 'Person', name: authorName } : null;
  const featuredImage = str(data, 'featured_image');

  const schema: Record<string, unknown> = {
    '@context':     'https://schema.org',
    '@type':        'Article',
    headline:        str(data, 'post_title'),
    author,
    datePublished:   str(data, 'publish_date'),
    dateModified:    str(data, 'modified_date') ?? str(data, 'publish_date'),
    image:           featuredImage,
  };

  return { schema, type: 'Article', issues };
}

function buildBreadcrumbList(data: Record<string, unknown>): TemplateOutput | null {
  const crumbs = data['breadcrumbs'];
  if (!Array.isArray(crumbs) || crumbs.length < 2) return null;

  const itemListElement = (crumbs as Array<Record<string, unknown>>).map(
    (seg, i) => ({
      '@type':  'ListItem',
      position: i + 1,
      name:     seg['name'] ?? null,
      item:     seg['url']  ?? null,
    }),
  );

  const schema: Record<string, unknown> = {
    '@context':       'https://schema.org',
    '@type':          'BreadcrumbList',
    itemListElement,
  };

  return { schema, type: 'BreadcrumbList', issues: [] };
}

function buildFAQPage(data: Record<string, unknown>): TemplateOutput | null {
  const items = data['faq_items'];
  if (!Array.isArray(items) || items.length === 0) return null;

  const mainEntity = (items as Array<Record<string, unknown>>).map((item) => ({
    '@type': 'Question',
    name:     item['question'] ?? null,
    acceptedAnswer: {
      '@type': 'Answer',
      text:     item['answer'] ?? null,
    },
  }));

  const schema: Record<string, unknown> = {
    '@context':  'https://schema.org',
    '@type':     'FAQPage',
    mainEntity,
  };

  return { schema, type: 'FAQPage', issues: [] };
}

// ── Template map ──────────────────────────────────────────────────────────────

type TemplateFn = (data: Record<string, unknown>) => TemplateOutput | TemplateOutput[] | null;

/**
 * Maps each page_type to a function that produces one or more schema blocks.
 * Returns null when generation must be skipped (e.g. insufficient data).
 */
export const SCHEMA_TEMPLATES: Readonly<Record<PageType, TemplateFn>> = {
  homepage: (data) => {
    const org  = buildOrganization(data);
    const site = buildWebSite(data);
    return [org, site];
  },

  product: (data) => buildProduct(data),

  article: (data) => buildArticle(data),

  post: (data) => buildArticle(data),

  collection: (data) => {
    const results: TemplateOutput[] = [];
    const breadcrumb = buildBreadcrumbList(data);
    if (breadcrumb) results.push(breadcrumb);
    const faq = buildFAQPage(data);
    if (faq) results.push(faq);
    return results.length > 0 ? results : null;
  },

  page: (data) => {
    const results: TemplateOutput[] = [];
    const breadcrumb = buildBreadcrumbList(data);
    if (breadcrumb) results.push(breadcrumb);
    const faq = buildFAQPage(data);
    if (faq) results.push(faq);
    return results.length > 0 ? results : null;
  },
} as const;

// ── Singleton check ───────────────────────────────────────────────────────────

/**
 * Returns the @type of any existing schema block that would conflict with
 * the proposed type, or null if no conflict.
 */
export function findDuplicateType(
  existingBlocks: unknown[],
  proposedType: string,
): string | null {
  for (const block of existingBlocks) {
    if (
      block !== null &&
      typeof block === 'object' &&
      (block as Record<string, unknown>)['@type'] === proposedType
    ) {
      return proposedType;
    }
  }
  return null;
}

// ── Serialize ─────────────────────────────────────────────────────────────────

/**
 * Strips nulls, serializes to compact JSON, validates with JSON.parse().
 * Returns the JSON string, whether it validated, and any parse errors.
 */
function serialize(raw: unknown): { json: string; validated: boolean; parseError?: string } {
  const cleaned = stripNulls(raw);
  const json = JSON.stringify(cleaned);
  try {
    JSON.parse(json);
    return { json, validated: true };
  } catch (e) {
    return { json, validated: false, parseError: String(e) };
  }
}

// ── generateSchema ────────────────────────────────────────────────────────────

/**
 * Generates valid JSON-LD structured data for the given page type.
 *
 * For homepage: produces a @graph array containing both Organization + WebSite.
 * For other types: produces a single schema block (or BreadcrumbList + FAQPage
 * wrapped in @graph for collection/page).
 *
 * Singleton enforcement: checks cms_data.existing_schema_blocks before
 * generating. If a block with the same primary @type already exists, returns
 * the existing block JSON unchanged with issues=['schema_already_exists_for_type'].
 *
 * Never throws. All issues are reported in SchemaResult.issues[].
 */
export function generateSchema(req: SchemaRequest): SchemaResult {
  const log = createLogger({
    run_id:    req.run_id,
    tenant_id: req.tenant_id,
    site_id:   req.site_id,
    cms:       req.cms,
    command:   'schema-engine',
    url:       req.url,
  });

  const templateFn = SCHEMA_TEMPLATES[req.page_type];
  const rawOutput  = templateFn(req.cms_data);

  // Template returned null — nothing to generate
  if (rawOutput === null) {
    const result: SchemaResult = {
      schema_json: '{}',
      schema_type: req.page_type,
      validated:   true,
      issues:      ['no_schema_generated:insufficient_data'],
      url:          req.url,
    };
    log({
      stage:    'schema-engine:skipped',
      status:   'skipped',
      metadata: { page_type: req.page_type, reason: 'insufficient_data' },
    });
    return result;
  }

  // Normalize to array for uniform handling
  const outputs: TemplateOutput[] = Array.isArray(rawOutput) ? rawOutput : [rawOutput];

  // ── Singleton check against existing blocks ────────────────────────────────
  const existingRaw = req.cms_data['existing_schema_blocks'];
  const existingBlocks: unknown[] = Array.isArray(existingRaw) ? existingRaw : [];

  for (const output of outputs) {
    const conflict = findDuplicateType(existingBlocks, output.type);
    if (conflict) {
      // Return the existing block JSON unchanged
      const { json, validated } = serialize(
        existingBlocks.find(
          (b) =>
            b !== null &&
            typeof b === 'object' &&
            (b as Record<string, unknown>)['@type'] === conflict,
        ),
      );
      log({
        stage:    'schema-engine:skipped',
        status:   'skipped',
        metadata: { schema_type: conflict, reason: 'singleton_collision' },
      });
      return {
        schema_json: json,
        schema_type: conflict,
        validated,
        issues:      ['schema_already_exists_for_type'],
        url:          req.url,
      };
    }
  }

  // ── Build final schema ─────────────────────────────────────────────────────
  const allIssues: string[] = outputs.flatMap((o) => o.issues);

  let finalRaw: unknown;
  let primaryType: string;

  if (outputs.length === 1) {
    finalRaw    = outputs[0].schema;
    primaryType = outputs[0].type;
  } else {
    // Wrap multiple blocks in @graph
    finalRaw    = {
      '@context': 'https://schema.org',
      '@graph':    outputs.map((o) => {
        // Strip the @context from inner blocks when inside @graph
        const { '@context': _ctx, ...rest } = o.schema as Record<string, unknown>;
        return rest;
      }),
    };
    primaryType = outputs[0].type;
  }

  const { json, validated, parseError } = serialize(finalRaw);

  if (parseError) allIssues.push(`parse_error:${parseError}`);

  log({
    stage:    'schema-engine:generated',
    status:   'ok',
    metadata: {
      schema_type: primaryType,
      validated,
      issues_count: allIssues.length,
    },
  });

  return {
    schema_json: json,
    schema_type: primaryType,
    validated,
    issues:      allIssues,
    url:          req.url,
  };
}
