/**
 * packages/detectors/src/index.ts
 *
 * Detection engine for Velocity AEO.
 *
 * Reads crawl_results rows and identifies every SEO issue on the site.
 * Each detector is a pure function: CrawlResultRow[] → DetectedIssue[].
 * No I/O, no side effects. Only runAllDetectors() writes to ActionLog.
 *
 * Detectors implemented (16 total):
 *
 *   Technical errors (category: 'errors')
 *     detect404s                  — HTTP 404 responses
 *     detect5xxs                  — HTTP 5xx responses
 *     detectRedirectChains        — redirect chains longer than 2 hops
 *     detectBrokenInternalLinks   — internal links whose status_code is 404
 *
 *   Metadata (category: 'metadata')
 *     detectMissingTitles         — blank or absent <title>
 *     detectLongTitles            — title > 60 chars
 *     detectDuplicateTitles       — same title on 2+ URLs
 *     detectMissingMetaDesc       — blank or absent meta description
 *     detectLongMetaDesc          — meta description > 155 chars
 *     detectMissingH1             — page with no <h1>
 *     detectDuplicateH1           — page with 2+ <h1> tags
 *
 *   Images (category: 'images')
 *     detectMissingAlt            — <img> with empty alt attribute
 *     detectMissingImageDimensions — <img> without width or height
 *
 *   Schema (category: 'schema')
 *     detectMissingSchema         — page with no JSON-LD blocks
 *     detectInvalidSchema         — JSON-LD block that fails JSON.parse
 *     detectDuplicateSchema       — 2+ JSON-LD blocks with the same @type
 *
 * Main entry point:
 *   runAllDetectors(rows, ctx) — runs all detectors, deduplicates,
 *                                sorts by risk_score desc, writes ActionLog
 */

import type { CmsType } from '../../core/types.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Category type ─────────────────────────────────────────────────────────────

/**
 * Issue category as seen by the detectors layer.
 * Note: 'metadata' maps to 'content' and 'images' maps to 'enhancements'
 * in the guardrail priority ladder — the guardrail package translates
 * these when evaluating action priority.
 */
export type DetectorCategory =
  | 'errors'
  | 'redirects'
  | 'canonicals'
  | 'metadata'
  | 'images'
  | 'performance'
  | 'schema'
  | 'indexing';

// ── Core types ────────────────────────────────────────────────────────────────

/** Run context injected by the caller — same fields as ActionLog defaults. */
export interface DetectorCtx {
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  cms:       CmsType;
}

/** A single SEO issue identified by a detector. */
export interface DetectedIssue {
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  cms:          CmsType;
  url:          string;
  issue_type:   string;
  issue_detail: Record<string, unknown>;
  proposed_fix: Record<string, unknown>;
  risk_score:   number;
  auto_fix:     boolean;
  category:     DetectorCategory;
}

/**
 * A row from the crawl_results Supabase table.
 * JSONB columns are deserialized by the Supabase client; arrays/objects may
 * be null when the crawler found nothing (empty JSONB stored as NULL).
 */
export interface CrawlResultRow {
  url:            string;
  status_code:    number | null;
  title:          string | null;
  meta_desc:      string | null;
  h1:             string[] | null;
  h2:             string[] | null;
  images: Array<{
    src:     string;
    alt:     string;
    width:   string | null;
    height:  string | null;
    size_kb: null;
  }> | null;
  internal_links: Array<{
    href:        string;
    anchor_text: string;
    status_code: number | null;
  }> | null;
  schema_blocks:  string[] | null;
  canonical:      string | null;
  redirect_chain: string[] | null;
  load_time_ms:   number | null;
  /** Combined robots directive string, e.g. "noindex,nofollow" or "index,follow".
   *  Populated from <meta name="robots"> content or X-Robots-Tag header.
   *  null means no robots directive was found (treat as indexable). */
  robots_meta:    string | null;
}

// ── Internal factory ──────────────────────────────────────────────────────────

/** Builds a DetectedIssue, stamping run context fields onto every record. */
function iss(
  ctx:       DetectorCtx,
  url:       string,
  type:      string,
  category:  DetectorCategory,
  riskScore: number,
  autoFix:   boolean,
  detail:    Record<string, unknown>,
  fix:       Record<string, unknown>,
): DetectedIssue {
  return {
    run_id:       ctx.run_id,
    tenant_id:    ctx.tenant_id,
    site_id:      ctx.site_id,
    cms:          ctx.cms,
    url,
    issue_type:   type,
    issue_detail: detail,
    proposed_fix: fix,
    risk_score:   riskScore,
    auto_fix:     autoFix,
    category,
  };
}

// ── Technical error detectors ─────────────────────────────────────────────────

/**
 * Detects pages that returned HTTP 404.
 * auto_fix: false — requires a human redirect mapping before any fix can run.
 */
export function detect404s(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => r.status_code === 404)
    .map((r) =>
      iss(ctx, r.url, 'ERR_404', 'errors', 8, false,
        { status_code: 404 },
        { action: 'map_redirect', from_url: r.url },
      ),
    );
}

/**
 * Detects pages that returned HTTP 5xx.
 * auto_fix: false — server configuration issue requiring operator attention.
 */
export function detect5xxs(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => r.status_code != null && r.status_code >= 500)
    .map((r) =>
      iss(ctx, r.url, 'ERR_500', 'errors', 10, false,
        { status_code: r.status_code },
        { action: 'alert_operator', url: r.url },
      ),
    );
}

/**
 * Detects redirect chains longer than 2 hops.
 * Crawlee records the full redirect_chain; chains > 2 waste crawl budget
 * and add latency for users.
 */
export function detectRedirectChains(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => (r.redirect_chain ?? []).length > 2)
    .map((r) => {
      const chain = r.redirect_chain!;
      return iss(ctx, r.url, 'ERR_REDIRECT_CHAIN', 'redirects', 5, true,
        { chain_length: chain.length, redirect_chain: chain },
        { action: 'collapse_redirect', final_url: chain[chain.length - 1] },
      );
    });
}

/**
 * Detects pages that contain internal links whose resolved status_code is 404.
 * One issue per broken link (different href = different fix action).
 */
export function detectBrokenInternalLinks(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows.flatMap((r) =>
    (r.internal_links ?? [])
      .filter((l) => l.status_code === 404)
      .map((l) =>
        iss(ctx, r.url, 'ERR_BROKEN_INTERNAL_LINK', 'errors', 4, true,
          { broken_href: l.href, anchor_text: l.anchor_text },
          { action: 'remove_or_update_href', broken_href: l.href },
        ),
      ),
  );
}

// ── Metadata detectors ────────────────────────────────────────────────────────

/**
 * Detects pages with no title tag or a whitespace-only title.
 * auto_fix: true — title will be AI-generated, confidence-gated before apply.
 */
export function detectMissingTitles(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => !r.title || r.title.trim() === '')
    .map((r) =>
      iss(ctx, r.url, 'META_TITLE_MISSING', 'metadata', 3, true,
        {},
        { action: 'generate_title', url: r.url },
      ),
    );
}

/**
 * Detects titles longer than 60 characters.
 * Google typically truncates at ~60 chars in SERPs.
 */
export function detectLongTitles(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => r.title != null && r.title.length > 60)
    .map((r) =>
      iss(ctx, r.url, 'META_TITLE_LONG', 'metadata', 2, true,
        { title: r.title, length: r.title!.length },
        { action: 'truncate_title', current_length: r.title!.length, truncate_at: 60 },
      ),
    );
}

/**
 * Detects URLs that share an identical title.
 * Comparison is case-insensitive and whitespace-normalised.
 * Returns one issue per affected URL; proposed_fix includes all sibling URLs.
 */
export function detectDuplicateTitles(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  const titleMap = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.title || r.title.trim() === '') continue;
    const key = r.title.trim().toLowerCase();
    const bucket = titleMap.get(key) ?? [];
    bucket.push(r.url);
    titleMap.set(key, bucket);
  }

  const issues: DetectedIssue[] = [];
  for (const urls of titleMap.values()) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      issues.push(
        iss(ctx, url, 'META_TITLE_DUPLICATE', 'metadata', 3, true,
          { duplicate_count: urls.length },
          { action: 'append_differentiator', duplicate_urls: urls },
        ),
      );
    }
  }
  return issues;
}

/**
 * Detects pages with no meta description or a whitespace-only value.
 * auto_fix: true — description will be AI-generated, confidence-gated.
 */
export function detectMissingMetaDesc(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => !r.meta_desc || r.meta_desc.trim() === '')
    .map((r) =>
      iss(ctx, r.url, 'META_DESC_MISSING', 'metadata', 2, true,
        {},
        { action: 'generate_meta_desc', url: r.url },
      ),
    );
}

/**
 * Detects meta descriptions longer than 155 characters.
 * Google typically truncates at ~155 chars in SERPs.
 */
export function detectLongMetaDesc(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => r.meta_desc != null && r.meta_desc.length > 155)
    .map((r) =>
      iss(ctx, r.url, 'META_DESC_LONG', 'metadata', 2, true,
        { meta_desc: r.meta_desc, length: r.meta_desc!.length },
        { action: 'truncate_meta_desc', current_length: r.meta_desc!.length, truncate_at: 155 },
      ),
    );
}

/**
 * Detects pages with no <h1> element.
 * The fix promotes the strongest remaining heading (largest h-level present).
 */
export function detectMissingH1(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => !r.h1 || r.h1.length === 0)
    .map((r) =>
      iss(ctx, r.url, 'H1_MISSING', 'metadata', 4, true,
        {},
        { action: 'promote_strongest_heading', url: r.url },
      ),
    );
}

/**
 * Detects pages with more than one <h1> element.
 * The fix demotes all but the first to <h2>.
 */
export function detectDuplicateH1(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => r.h1 != null && r.h1.length > 1)
    .map((r) =>
      iss(ctx, r.url, 'H1_DUPLICATE', 'metadata', 5, true,
        { h1_values: r.h1, count: r.h1!.length },
        { action: 'demote_extras_to_h2', count: r.h1!.length },
      ),
    );
}

// ── Image detectors ───────────────────────────────────────────────────────────

/**
 * Detects images with an empty or absent alt attribute.
 * One issue per image (different image_src = different fix action).
 * auto_fix: true — alt text will be AI-generated from surrounding context.
 */
export function detectMissingAlt(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows.flatMap((r) =>
    (r.images ?? [])
      .filter((img) => img.alt === '' || (img.alt as string | null) === null)
      .map((img) =>
        iss(ctx, r.url, 'IMG_ALT_MISSING', 'images', 2, true,
          { image_src: img.src },
          { action: 'generate_alt_text', image_src: img.src },
        ),
      ),
  );
}

/**
 * Detects images missing width or height attributes.
 * Absent dimensions cause layout shift (CLS) during page load.
 * One issue per image.
 */
export function detectMissingImageDimensions(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows.flatMap((r) =>
    (r.images ?? [])
      .filter((img) => img.width === null || img.height === null)
      .map((img) =>
        iss(ctx, r.url, 'IMG_DIMENSIONS_MISSING', 'images', 2, true,
          { image_src: img.src, width: img.width, height: img.height },
          { action: 'inject_dimensions_from_metadata', image_src: img.src },
        ),
      ),
  );
}

// ── Schema detectors ──────────────────────────────────────────────────────────

/**
 * Detects pages with no JSON-LD structured data blocks.
 * The fix generates a schema block from a template appropriate to the URL path.
 */
export function detectMissingSchema(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows
    .filter((r) => !r.schema_blocks || r.schema_blocks.length === 0)
    .map((r) =>
      iss(ctx, r.url, 'SCHEMA_MISSING', 'schema', 3, true,
        {},
        { action: 'generate_from_template', url: r.url },
      ),
    );
}

/**
 * Detects JSON-LD blocks that cannot be parsed with JSON.parse().
 * Deduplication in runAllDetectors collapses multiple invalid blocks
 * on the same page into a single fix action.
 */
export function detectInvalidSchema(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows.flatMap((r) =>
    (r.schema_blocks ?? [])
      .filter((block) => {
        try { JSON.parse(block); return false; }
        catch   { return true; }
      })
      .map((block) =>
        iss(ctx, r.url, 'SCHEMA_INVALID_JSON', 'schema', 4, true,
          { raw_block_preview: block.slice(0, 200) },
          { action: 'fix_syntax_errors', url: r.url },
        ),
      ),
  );
}

/**
 * Detects pages where two or more JSON-LD blocks share the same @type value.
 * One issue per duplicate @type found on the page.
 */
export function detectDuplicateSchema(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  return rows.flatMap((r) => {
    const typeCount = new Map<string, number>();
    for (const block of r.schema_blocks ?? []) {
      try {
        const parsed = JSON.parse(block) as Record<string, unknown>;
        const type = parsed['@type'];
        if (typeof type === 'string') {
          typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
        }
      } catch { /* skip invalid JSON — detectInvalidSchema handles those */ }
    }
    return [...typeCount.entries()]
      .filter(([, count]) => count >= 2)
      .map(([type]) =>
        iss(ctx, r.url, 'SCHEMA_DUPLICATE', 'schema', 4, true,
          { duplicate_type: type },
          { action: 'merge_into_single_block', url: r.url },
        ),
      );
  });
}

// ── runAllDetectors ───────────────────────────────────────────────────────────

/**
 * Runs all 16 detectors against the supplied crawl rows.
 *
 * Steps:
 *   1. Emit ActionLog stage='detectors:start' with URL count.
 *   2. Invoke every detector and collect issues.
 *   3. Deduplicate: same (url, issue_type, proposed_fix) → one issue.
 *      This collapses multiple invalid schema blocks per page into one fix.
 *   4. Sort by risk_score descending (highest impact first).
 *   5. Emit ActionLog stage='detectors:complete' with issue counts per category.
 *
 * @param rows  Rows from Supabase crawl_results for this run.
 * @param ctx   Run context: run_id, tenant_id, site_id, cms.
 * @returns     Deduplicated, sorted list of all detected issues.
 */
export function runAllDetectors(
  rows: CrawlResultRow[],
  ctx:  DetectorCtx,
): DetectedIssue[] {
  const log = createLogger({ ...ctx, command: 'detectors' });

  log({
    stage:    'detectors:start',
    status:   'pending',
    metadata: { url_count: rows.length },
  });

  const raw: DetectedIssue[] = [
    // ── errors ──────────────────────────────────────────────────────────────
    ...detect404s(rows, ctx),
    ...detect5xxs(rows, ctx),
    ...detectRedirectChains(rows, ctx),
    ...detectBrokenInternalLinks(rows, ctx),
    // ── metadata ────────────────────────────────────────────────────────────
    ...detectMissingTitles(rows, ctx),
    ...detectLongTitles(rows, ctx),
    ...detectDuplicateTitles(rows, ctx),
    ...detectMissingMetaDesc(rows, ctx),
    ...detectLongMetaDesc(rows, ctx),
    ...detectMissingH1(rows, ctx),
    ...detectDuplicateH1(rows, ctx),
    // ── images ───────────────────────────────────────────────────────────────
    ...detectMissingAlt(rows, ctx),
    ...detectMissingImageDimensions(rows, ctx),
    // ── schema ───────────────────────────────────────────────────────────────
    ...detectMissingSchema(rows, ctx),
    ...detectInvalidSchema(rows, ctx),
    ...detectDuplicateSchema(rows, ctx),
  ];

  // Deduplicate: url + issue_type + proposed_fix uniquely identifies a fix action.
  const seen  = new Set<string>();
  const deduped = raw.filter((issue) => {
    const key = `${issue.url}::${issue.issue_type}::${JSON.stringify(issue.proposed_fix)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort highest risk first.
  deduped.sort((a, b) => b.risk_score - a.risk_score);

  // Count per category for the summary log.
  const byCategory: Record<string, number> = {};
  for (const issue of deduped) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  log({
    stage:    'detectors:complete',
    status:   'ok',
    metadata: { total_issues: deduped.length, by_category: byCategory },
  });

  return deduped;
}
