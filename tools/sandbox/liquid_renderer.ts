/**
 * tools/sandbox/liquid_renderer.ts
 *
 * Renders Shopify Liquid templates locally using liquidjs,
 * extracts SEO fields from rendered HTML, and validates them
 * against VAEO rules.
 *
 * All file I/O is injectable via deps for testing.
 */

import { Liquid } from 'liquidjs';

// ── Types ────────────────────────────────────────────────────────────────────

/** Mirrors Shopify's template variable context. */
export interface ShopifyContext {
  product?:    Record<string, unknown>;
  collection?: Record<string, unknown>;
  page?:       Record<string, unknown>;
  shop?:       Record<string, unknown>;
  settings?:   Record<string, unknown>;
}

/** SEO fields extracted from rendered HTML. */
export interface SeoFields {
  title:            string | null;
  meta_description: string | null;
  h1:               string[];
  canonical:        string | null;
  schema_json_ld:   string[];
}

export type Severity = 'critical' | 'major' | 'minor';

export interface ValidationIssue {
  field:    string;
  rule:     string;
  severity: Severity;
  message:  string;
  value:    string | null;
}

export interface ValidationResult {
  pass:   boolean;
  issues: ValidationIssue[];
}

/** A cached theme file entry. */
export interface ThemeCacheEntry {
  path:    string;   // e.g. "templates/product.liquid"
  content: string;
}

/** Injectable dependencies — all file I/O goes through here. */
export interface LiquidRendererDeps {
  /** Read a cached theme file. Returns null if not cached. */
  readCachedFile:  (siteId: string, filePath: string) => Promise<string | null>;
  /** Write a theme file to local cache. */
  writeCachedFile: (siteId: string, filePath: string, content: string) => Promise<void>;
  /** List all cached file paths for a site. */
  listCachedFiles: (siteId: string) => Promise<string[]>;
  /** Pull theme files from remote (Shopify API, etc). */
  pullThemeFiles:  (siteId: string) => Promise<ThemeCacheEntry[]>;
}

// ── Render ───────────────────────────────────────────────────────────────────

/**
 * Render a Liquid template string with Shopify-style context.
 * Returns the rendered HTML string.
 */
export async function renderTemplate(
  templateContent: string,
  context: ShopifyContext,
): Promise<string> {
  if (!templateContent) return '';

  const engine = new Liquid({ strictVariables: false, strictFilters: false });
  const rendered = await engine.parseAndRender(templateContent, context as Record<string, unknown>);
  return rendered;
}

// ── Extract ──────────────────────────────────────────────────────────────────

/**
 * Parse rendered HTML and extract SEO-relevant fields.
 * Uses regex-based extraction (no DOM dependency).
 */
export function extractSeoFields(html: string): SeoFields {
  if (!html) {
    return { title: null, meta_description: null, h1: [], canonical: null, schema_json_ld: [] };
  }

  // Title: <title>...</title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() || null : null;

  // Meta description: <meta name="description" content="...">
  const metaMatch = html.match(/<meta\s[^>]*name\s*=\s*["']description["'][^>]*>/i);
  let meta_description: string | null = null;
  if (metaMatch) {
    const contentMatch = metaMatch[0].match(/content\s*=\s*["']([\s\S]*?)["']/i);
    meta_description = contentMatch ? decodeEntities(contentMatch[1]).trim() || null : null;
  }

  // H1 tags: <h1>...</h1> (all occurrences)
  const h1: string[] = [];
  const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let h1Match;
  while ((h1Match = h1Regex.exec(html)) !== null) {
    const text = stripTags(decodeEntities(h1Match[1])).trim();
    if (text) h1.push(text);
  }

  // Canonical: <link rel="canonical" href="...">
  const canonicalMatch = html.match(/<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*>/i);
  let canonical: string | null = null;
  if (canonicalMatch) {
    const hrefMatch = canonicalMatch[0].match(/href\s*=\s*["']([\s\S]*?)["']/i);
    canonical = hrefMatch ? hrefMatch[1].trim() || null : null;
  }

  // JSON-LD: <script type="application/ld+json">...</script>
  const schema_json_ld: string[] = [];
  const ldRegex = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    const raw = ldMatch[1].trim();
    if (raw) schema_json_ld.push(raw);
  }

  return { title, meta_description, h1, canonical, schema_json_ld };
}

// ── Validate ─────────────────────────────────────────────────────────────────

/**
 * Validate extracted SEO fields against VAEO rules.
 * Returns pass/fail with a list of issues found.
 */
export function validateSeoFields(fields: SeoFields): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ── Title rules ──────────────────────────────────────────────────────────
  if (!fields.title) {
    issues.push({ field: 'title', rule: 'title_missing', severity: 'critical', message: 'Page has no <title> tag', value: null });
  } else {
    const len = fields.title.length;
    if (len < 30) {
      issues.push({ field: 'title', rule: 'title_too_short', severity: 'minor', message: `Title is ${len} chars (min 30)`, value: fields.title });
    }
    if (len > 60) {
      issues.push({ field: 'title', rule: 'title_too_long', severity: 'minor', message: `Title is ${len} chars (max 60)`, value: fields.title });
    }
  }

  // ── Meta description rules ───────────────────────────────────────────────
  if (!fields.meta_description) {
    issues.push({ field: 'meta_description', rule: 'meta_missing', severity: 'major', message: 'Page has no meta description', value: null });
  } else {
    const len = fields.meta_description.length;
    if (len < 120) {
      issues.push({ field: 'meta_description', rule: 'meta_too_short', severity: 'minor', message: `Meta description is ${len} chars (min 120)`, value: fields.meta_description });
    }
    if (len > 155) {
      issues.push({ field: 'meta_description', rule: 'meta_too_long', severity: 'minor', message: `Meta description is ${len} chars (max 155)`, value: fields.meta_description });
    }
  }

  // ── H1 rules ─────────────────────────────────────────────────────────────
  if (fields.h1.length === 0) {
    issues.push({ field: 'h1', rule: 'h1_missing', severity: 'critical', message: 'Page has no <h1> tag', value: null });
  } else if (fields.h1.length > 1) {
    issues.push({ field: 'h1', rule: 'h1_multiple', severity: 'major', message: `Page has ${fields.h1.length} <h1> tags (should be 1)`, value: fields.h1.join(' | ') });
  }

  // ── Canonical rules ──────────────────────────────────────────────────────
  if (!fields.canonical) {
    issues.push({ field: 'canonical', rule: 'canonical_missing', severity: 'critical', message: 'Page has no canonical link', value: null });
  }

  // ── Schema rules ─────────────────────────────────────────────────────────
  if (fields.schema_json_ld.length === 0) {
    issues.push({ field: 'schema', rule: 'schema_missing', severity: 'major', message: 'Page has no JSON-LD structured data', value: null });
  } else {
    for (let i = 0; i < fields.schema_json_ld.length; i++) {
      try {
        JSON.parse(fields.schema_json_ld[i]);
      } catch {
        issues.push({ field: 'schema', rule: 'schema_invalid_json', severity: 'major', message: `JSON-LD block ${i + 1} is not valid JSON`, value: fields.schema_json_ld[i].slice(0, 200) });
      }
    }
  }

  return { pass: issues.length === 0, issues };
}

// ── Theme cache ──────────────────────────────────────────────────────────────

/**
 * Ensure theme files are cached locally. Pulls from remote only if
 * the cache is empty. Returns cached file paths.
 */
export async function ensureThemeCache(
  siteId: string,
  deps: LiquidRendererDeps,
): Promise<string[]> {
  if (!siteId) return [];

  const existing = await deps.listCachedFiles(siteId);
  if (existing.length > 0) return existing;

  const files = await deps.pullThemeFiles(siteId);
  for (const file of files) {
    await deps.writeCachedFile(siteId, file.path, file.content);
  }

  return files.map((f) => f.path);
}

/**
 * Render a cached theme template by path.
 * Reads from local cache, renders with context.
 */
export async function renderCachedTemplate(
  siteId: string,
  templatePath: string,
  context: ShopifyContext,
  deps: LiquidRendererDeps,
): Promise<string> {
  const content = await deps.readCachedFile(siteId, templatePath);
  if (content === null) {
    throw new Error(`Template not found in cache: ${templatePath}`);
  }
  return renderTemplate(content, context);
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

/** Decode common HTML entities. */
function decodeEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Strip HTML tags from a string. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
