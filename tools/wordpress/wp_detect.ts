/**
 * tools/wordpress/wp_detect.ts
 *
 * WordPress issue detector — scans HTML for SEO and performance issues.
 *
 * Reuses existing detectors:
 *   - performance_detect  (DEFER_SCRIPT, LAZY_IMAGE, FONT_DISPLAY)
 *   - Schema detection    (SCHEMA_MISSING, SCHEMA_INVALID)
 *   - Title/meta          (TITLE_MISSING, META_DESC_MISSING)
 *   - Images              (IMG_MISSING_ALT, IMG_MISSING_DIMENSIONS)
 *
 * Returns unified WPIssue[] with same shape as Shopify issues.
 * All functions are pure — no I/O. Never throws.
 */

import {
  detectAllPerformanceIssues,
  type PerformanceIssue,
} from '../detect/performance_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type WPIssueType =
  | 'DEFER_SCRIPT'
  | 'LAZY_IMAGE'
  | 'FONT_DISPLAY'
  | 'SCHEMA_MISSING'
  | 'SCHEMA_INVALID'
  | 'TITLE_MISSING'
  | 'TITLE_LONG'
  | 'META_DESC_MISSING'
  | 'META_DESC_LONG'
  | 'IMG_MISSING_ALT'
  | 'IMG_MISSING_DIMENSIONS';

export interface WPIssue {
  issue_type: WPIssueType;
  url:        string;
  element:    string;
  fix_hint:   string;
  category:   'performance' | 'schema' | 'metadata' | 'images';
}

// ── Regex patterns ───────────────────────────────────────────────────────────

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_DESC_RE = /<meta\s[^>]*name\s*=\s*["']description["'][^>]*>/i;
const META_CONTENT_RE = /content\s*=\s*["']([^"']*)["']/i;
const IMG_TAG_RE = /<img\s[^>]*>/gi;
const JSONLD_RE = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const TITLE_MAX_LEN = 60;
const META_DESC_MAX_LEN = 155;

// ── Schema detectors ─────────────────────────────────────────────────────────

function detectSchemaIssues(html: string, url: string): WPIssue[] {
  const issues: WPIssue[] = [];
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  JSONLD_RE.lastIndex = 0;
  while ((match = JSONLD_RE.exec(html)) !== null) {
    const content = (match[1] ?? '').trim();
    if (content) blocks.push(content);
  }

  if (blocks.length === 0) {
    issues.push({
      issue_type: 'SCHEMA_MISSING',
      url,
      element:    '',
      fix_hint:   'Add structured data (JSON-LD) to this page',
      category:   'schema',
    });
  } else {
    for (const block of blocks) {
      try {
        JSON.parse(block);
      } catch {
        issues.push({
          issue_type: 'SCHEMA_INVALID',
          url,
          element:    block.slice(0, 200),
          fix_hint:   'Fix invalid JSON in this JSON-LD block',
          category:   'schema',
        });
      }
    }
  }

  return issues;
}

// ── Title/meta detectors ─────────────────────────────────────────────────────

function detectTitleMetaIssues(html: string, url: string): WPIssue[] {
  const issues: WPIssue[] = [];

  // Title
  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch?.[1]?.trim() ?? '';

  if (!title) {
    issues.push({
      issue_type: 'TITLE_MISSING',
      url,
      element:    '',
      fix_hint:   'Add a <title> tag to this page',
      category:   'metadata',
    });
  } else if (title.length > TITLE_MAX_LEN) {
    issues.push({
      issue_type: 'TITLE_LONG',
      url,
      element:    `<title>${title}</title>`,
      fix_hint:   `Shorten title to ${TITLE_MAX_LEN} characters or fewer (currently ${title.length})`,
      category:   'metadata',
    });
  }

  // Meta description
  const metaMatch = html.match(META_DESC_RE);
  if (!metaMatch) {
    issues.push({
      issue_type: 'META_DESC_MISSING',
      url,
      element:    '',
      fix_hint:   'Add a meta description to this page',
      category:   'metadata',
    });
  } else {
    const contentMatch = metaMatch[0].match(META_CONTENT_RE);
    const desc = contentMatch?.[1]?.trim() ?? '';
    if (!desc) {
      issues.push({
        issue_type: 'META_DESC_MISSING',
        url,
        element:    metaMatch[0],
        fix_hint:   'Add content to the meta description',
        category:   'metadata',
      });
    } else if (desc.length > META_DESC_MAX_LEN) {
      issues.push({
        issue_type: 'META_DESC_LONG',
        url,
        element:    metaMatch[0].slice(0, 200),
        fix_hint:   `Shorten meta description to ${META_DESC_MAX_LEN} characters or fewer (currently ${desc.length})`,
        category:   'metadata',
      });
    }
  }

  return issues;
}

// ── Image detectors ──────────────────────────────────────────────────────────

function detectImageIssues(html: string, url: string): WPIssue[] {
  const issues: WPIssue[] = [];
  let match: RegExpExecArray | null;

  IMG_TAG_RE.lastIndex = 0;
  while ((match = IMG_TAG_RE.exec(html)) !== null) {
    const tag = match[0];

    // Missing alt
    if (!/\balt\s*=\s*["'][^"']+["']/i.test(tag)) {
      issues.push({
        issue_type: 'IMG_MISSING_ALT',
        url,
        element:    tag.length > 200 ? tag.slice(0, 200) + '...' : tag,
        fix_hint:   'Add a descriptive alt attribute to this image',
        category:   'images',
      });
    }

    // Missing dimensions
    const hasWidth  = /\bwidth\s*=\s*["']?\d+/i.test(tag);
    const hasHeight = /\bheight\s*=\s*["']?\d+/i.test(tag);
    if (!hasWidth || !hasHeight) {
      issues.push({
        issue_type: 'IMG_MISSING_DIMENSIONS',
        url,
        element:    tag.length > 200 ? tag.slice(0, 200) + '...' : tag,
        fix_hint:   'Add width and height attributes to this image to prevent CLS',
        category:   'images',
      });
    }
  }

  return issues;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Detect all WordPress SEO and performance issues from page HTML.
 * Combines schema, title/meta, image, and performance detectors.
 */
export function detectWPIssues(html: string, url: string): WPIssue[] {
  const perfIssues = detectAllPerformanceIssues(html, url).map(
    (p: PerformanceIssue): WPIssue => ({
      issue_type: p.issue_type as WPIssueType,
      url:        p.url,
      element:    p.element,
      fix_hint:   p.fix_hint,
      category:   'performance',
    }),
  );

  return [
    ...detectSchemaIssues(html, url),
    ...detectTitleMetaIssues(html, url),
    ...detectImageIssues(html, url),
    ...perfIssues,
  ];
}
