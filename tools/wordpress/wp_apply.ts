/**
 * tools/wordpress/wp_apply.ts
 *
 * WordPress apply engine — takes detected issues and applies fixes
 * via the WordPress REST API.
 *
 * Routes by issue type:
 *   Schema issues      → inject JSON-LD via wp_head hook (functions.php snippet)
 *   Title/meta         → update post meta via REST API
 *   Performance        → generate fix plan (theme file update deferred to Sprint B)
 *   Images             → update img attributes via post content update
 *
 * Injectable deps pattern for testability. Never throws.
 */

import type { WPCredentials, ThemeFile } from './wp_adapter.js';
import type { WPIssue } from './wp_detect.js';
import { detectTimestampSignals } from '../detect/timestamp_detect.js';
import { planTimestampFixes, type TimestampFix } from '../optimize/timestamp_plan.js';
import { applyTimestampFixes } from '../apply/timestamp_apply.js';
import { detectWpImageIssues } from '../detect/wp_image_detect.js';
import { planWpImageFixes, type WpImageFix } from '../optimize/wp_image_plan.js';
import { applyWpImageFixes } from '../apply/wp_image_apply.js';
import { detectResourceHints } from '../detect/resource_hint_detect.js';
import { generateResourceHintPlan } from '../optimize/resource_hint_plan.js';
import { detectActivePlugins, detectSEOCoverage, buildSafeWriteList } from './plugin_conflict_detector.js';
import { bustCacheAfterFix, type CacheBustConfig, type CacheBustDeps } from './cache_bust.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPApplyResult {
  issue_type:       string;
  url:              string;
  success:          boolean;
  action:           string;
  error?:           string;
  timestamp_fixes?: TimestampFix[];
  image_fixes?:     WpImageFix[];
  resource_hints?:  { injected_count: number; domains: string[] };
  skipped_signals?: string[];
}

export interface WPApplyConflictOptions {
  plugin_slugs?: string[];
  page_html?:    string;
  cache_bust_config?: CacheBustConfig;
  cache_bust_deps?:   CacheBustDeps;
}

export interface WPApplyDeps {
  /** Update post fields via REST API. */
  updatePost: (
    credentials: WPCredentials,
    postId: number,
    fields: Record<string, string>,
  ) => Promise<void>;
  /** Inject a PHP snippet into functions.php. */
  injectSnippet: (
    credentials: WPCredentials,
    snippetName: string,
    snippetContent: string,
  ) => Promise<void>;
  /** Look up a post/page ID from a URL slug. */
  lookupPostId: (
    credentials: WPCredentials,
    url: string,
  ) => Promise<number | null>;
  /** Get rendered HTML content of a post by ID. */
  getPostContent: (
    credentials: WPCredentials,
    postId: number,
  ) => Promise<string | null>;
  /** Update raw post content HTML. */
  updatePostContent: (
    credentials: WPCredentials,
    postId: number,
    content: string,
  ) => Promise<void>;
}

// ── Default slug extractor ───────────────────────────────────────────────────

function slugFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

// ── Real implementations ─────────────────────────────────────────────────────

const realLookupPostId: WPApplyDeps['lookupPostId'] = async (credentials, url) => {
  const { getWPPage, _injectFetch: _, ...rest } = await import('./wp_adapter.js');
  const slug = slugFromUrl(url);
  if (!slug) return null;

  const base = credentials.siteUrl.replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(
    `${credentials.username}:${credentials.appPassword.replace(/\s/g, '')}`,
  ).toString('base64');

  for (const endpoint of ['pages', 'posts']) {
    const apiUrl = `${base}/wp-json/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&_fields=id`;
    const res = await fetch(apiUrl, { method: 'GET', headers: { Authorization: auth } });
    if (!res.ok) continue;
    const items = await res.json() as Array<{ id?: number }>;
    if (items?.length && items[0].id) return items[0].id;
  }
  return null;
};

const realGetPostContent: WPApplyDeps['getPostContent'] = async (credentials, postId) => {
  const base = credentials.siteUrl.replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(
    `${credentials.username}:${credentials.appPassword.replace(/\s/g, '')}`,
  ).toString('base64');

  for (const endpoint of ['pages', 'posts']) {
    const url = `${base}/wp-json/wp/v2/${endpoint}/${postId}?_fields=content`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: auth } });
    if (!res.ok) continue;
    const data = await res.json() as { content?: { raw?: string; rendered?: string } };
    return data.content?.raw ?? data.content?.rendered ?? null;
  }
  return null;
};

const realUpdatePostContent: WPApplyDeps['updatePostContent'] = async (credentials, postId, content) => {
  const { updateWPPost } = await import('./wp_adapter.js');
  await updateWPPost(credentials, postId, { content });
};

function defaultDeps(): WPApplyDeps {
  return {
    updatePost: async (creds, postId, fields) => {
      const { updateWPPost } = await import('./wp_adapter.js');
      await updateWPPost(creds, postId, fields);
    },
    injectSnippet: async (creds, name, content) => {
      const { injectWPSnippet } = await import('./wp_adapter.js');
      await injectWPSnippet(creds, name, content);
    },
    lookupPostId:     realLookupPostId,
    getPostContent:   realGetPostContent,
    updatePostContent: realUpdatePostContent,
  };
}

// ── Schema fix ───────────────────────────────────────────────────────────────

/**
 * Inject JSON-LD schema via a wp_head action in functions.php.
 * Generates a basic WebPage schema for the URL.
 */
async function applySchemaFix(
  issue: WPIssue,
  credentials: WPCredentials,
  deps: WPApplyDeps,
): Promise<WPApplyResult> {
  const slug = slugFromUrl(issue.url) ?? 'page';
  const safeName = `schema_${slug.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type':    'WebPage',
    'name':     slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    'url':      issue.url,
  }, null, 2);

  const snippet = `function ${safeName}() {
  echo '<script type="application/ld+json">${schemaJson.replace(/'/g, "\\'")}</script>';
}
add_action('wp_head', '${safeName}');`;

  await deps.injectSnippet(credentials, safeName, snippet);

  return {
    issue_type: issue.issue_type,
    url:        issue.url,
    success:    true,
    action:     'inject_schema_snippet',
  };
}

// ── Title/meta fix ───────────────────────────────────────────────────────────

async function applyTitleMetaFix(
  issue: WPIssue,
  credentials: WPCredentials,
  deps: WPApplyDeps,
): Promise<WPApplyResult> {
  const postId = await deps.lookupPostId(credentials, issue.url);
  if (!postId) {
    return {
      issue_type: issue.issue_type,
      url:        issue.url,
      success:    false,
      action:     'update_post_meta',
      error:      `Post not found for URL: ${issue.url}`,
    };
  }

  const fields: Record<string, string> = {};
  if (issue.issue_type === 'TITLE_MISSING' || issue.issue_type === 'TITLE_LONG') {
    // Generate a title from the URL slug
    const slug = slugFromUrl(issue.url) ?? '';
    fields['title'] = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } else if (issue.issue_type === 'META_DESC_MISSING' || issue.issue_type === 'META_DESC_LONG') {
    fields['excerpt'] = '';  // Clear — actual generation would use AI
  }

  await deps.updatePost(credentials, postId, fields);

  return {
    issue_type: issue.issue_type,
    url:        issue.url,
    success:    true,
    action:     'update_post_meta',
  };
}

// ── Performance fix ──────────────────────────────────────────────────────────

async function applyPerformanceFix(
  issue: WPIssue,
  _credentials: WPCredentials,
  _deps: WPApplyDeps,
): Promise<WPApplyResult> {
  // Performance fixes generate a plan — actual theme file edits deferred to Sprint B
  const { generateFixPlan } = await import('../optimize/performance_plan.js');
  const plan = generateFixPlan({
    issue_type: issue.issue_type as 'DEFER_SCRIPT' | 'LAZY_IMAGE' | 'FONT_DISPLAY',
    url:        issue.url,
    element:    issue.element,
    fix_hint:   issue.fix_hint,
  });

  return {
    issue_type: issue.issue_type,
    url:        issue.url,
    success:    true,
    action:     plan.action,
  };
}

// ── Image fix ────────────────────────────────────────────────────────────────

async function applyImageFix(
  issue: WPIssue,
  credentials: WPCredentials,
  deps: WPApplyDeps,
): Promise<WPApplyResult> {
  const postId = await deps.lookupPostId(credentials, issue.url);
  if (!postId) {
    return {
      issue_type: issue.issue_type,
      url:        issue.url,
      success:    false,
      action:     'update_image_attributes',
      error:      `Post not found for URL: ${issue.url}`,
    };
  }

  const content = await deps.getPostContent(credentials, postId);
  if (!content) {
    return {
      issue_type: issue.issue_type,
      url:        issue.url,
      success:    false,
      action:     'update_image_attributes',
      error:      `Could not read post content for post ${postId}`,
    };
  }

  let updated = content;

  if (issue.issue_type === 'IMG_MISSING_ALT' && issue.element) {
    // Add alt="" placeholder — actual alt text would come from AI
    const withAlt = issue.element.replace(/<img\s/i, '<img alt="Image" ');
    updated = updated.replace(issue.element, withAlt);
  }

  if (issue.issue_type === 'IMG_MISSING_DIMENSIONS' && issue.element) {
    // Add placeholder dimensions — actual dimensions would come from image analysis
    let withDims = issue.element;
    if (!/\bwidth\s*=/i.test(withDims)) {
      withDims = withDims.replace(/<img\s/i, '<img width="auto" ');
    }
    if (!/\bheight\s*=/i.test(withDims)) {
      withDims = withDims.replace(/<img\s/i, '<img height="auto" ');
    }
    updated = updated.replace(issue.element, withDims);
  }

  if (updated !== content) {
    await deps.updatePostContent(credentials, postId, updated);
  }

  return {
    issue_type: issue.issue_type,
    url:        issue.url,
    success:    true,
    action:     'update_image_attributes',
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Apply a single WordPress fix.
 * Routes to the correct method based on issue category.
 * Never throws — returns WPApplyResult with success flag.
 */
// ── Signal mapping: issue category → SEO coverage signal ─────────────────

const CATEGORY_TO_SIGNAL: Record<string, string> = {
  schema:   'json_ld_schema',
  metadata: 'title_tag',
};

const ISSUE_TO_SIGNAL: Record<string, string> = {
  TITLE_MISSING:      'title_tag',
  TITLE_LONG:         'title_tag',
  META_DESC_MISSING:  'meta_description',
  META_DESC_LONG:     'meta_description',
  SCHEMA_MISSING:     'json_ld_schema',
  OG_MISSING:         'og_tags',
  TWITTER_MISSING:    'twitter_tags',
  CANONICAL_MISSING:  'canonical',
};

export async function applyWPFix(
  issue: WPIssue,
  credentials: WPCredentials,
  _testDeps?: Partial<WPApplyDeps>,
  conflictOptions?: WPApplyConflictOptions,
): Promise<WPApplyResult> {
  const deps = { ...defaultDeps(), ..._testDeps };

  try {
    // ── Conflict check: skip signals already covered by SEO plugins ──
    const skipped_signals: string[] = [];
    if (conflictOptions?.plugin_slugs && conflictOptions.page_html) {
      const activePlugins = detectActivePlugins(conflictOptions.plugin_slugs);
      if (activePlugins.detected.length > 0) {
        const coverage = detectSEOCoverage(conflictOptions.page_html, activePlugins);
        const safeList = buildSafeWriteList(coverage);
        const signal = ISSUE_TO_SIGNAL[issue.issue_type] ?? CATEGORY_TO_SIGNAL[issue.category];
        if (signal && !safeList.includes(signal)) {
          skipped_signals.push(signal);
          return {
            issue_type: issue.issue_type,
            url:        issue.url,
            success:    true,
            action:     'skipped_plugin_conflict',
            skipped_signals,
          };
        }
      }
    }

    let result: WPApplyResult;
    switch (issue.category) {
      case 'schema':
        result = await applySchemaFix(issue, credentials, deps);
        break;
      case 'metadata':
        result = await applyTitleMetaFix(issue, credentials, deps);
        break;
      case 'performance':
        result = await applyPerformanceFix(issue, credentials, deps);
        break;
      case 'images':
        result = await applyImageFix(issue, credentials, deps);
        break;
      default:
        result = {
          issue_type: issue.issue_type,
          url:        issue.url,
          success:    false,
          action:     'unknown',
          error:      `Unknown issue category: ${issue.category}`,
        };
    }

    // ── Cache bust after successful apply ──
    if (result.success && conflictOptions?.cache_bust_config) {
      try {
        await bustCacheAfterFix(
          conflictOptions.cache_bust_config,
          [issue.url],
          conflictOptions.cache_bust_deps,
        );
      } catch {
        // Non-fatal — cache bust failure must not block apply
      }
    }

    return result;
  } catch (err) {
    return {
      issue_type: issue.issue_type,
      url:        issue.url,
      success:    false,
      action:     'error',
      error:      err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Apply all WordPress fixes sequentially.
 * After applying, runs timestamp detection and injects
 * timestamps if needed. Non-fatal — timestamp failure
 * does not block main fixes.
 */
export async function applyAllWPFixes(
  issues: WPIssue[],
  credentials: WPCredentials,
  _testDeps?: Partial<WPApplyDeps>,
): Promise<WPApplyResult[]> {
  const deps = { ...defaultDeps(), ..._testDeps };
  const results: WPApplyResult[] = [];
  for (const issue of issues) {
    results.push(await applyWPFix(issue, credentials, _testDeps));
  }

  // ── Timestamp injection pass ──────────────────────────────────────────────
  // For each unique URL, fetch updated HTML and inject timestamps if needed.
  try {
    const urls = [...new Set(issues.map((i) => i.url))];
    for (const url of urls) {
      try {
        const postId = await deps.lookupPostId(credentials, url);
        if (!postId) continue;

        const html = await deps.getPostContent(credentials, postId);
        if (!html) continue;

        const signals = detectTimestampSignals(html);
        if (!signals.needs_injection) continue;

        const plan = planTimestampFixes('wp', url, html, signals);
        if (plan.fixes.length === 0) continue;

        const tsResult = applyTimestampFixes(html, plan);
        if (tsResult.applied.length > 0 && tsResult.html !== html) {
          await deps.updatePostContent(credentials, postId, tsResult.html);

          // Attach timestamp fixes to the last result for this URL
          const lastResult = [...results].reverse().find((r) => r.url === url);
          if (lastResult) {
            lastResult.timestamp_fixes = tsResult.applied;
          }
        }
      } catch {
        // Non-fatal — timestamp failure must not block main fixes
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Image optimization pass ──────────────────────────────────────────────
  // For each unique URL, fetch updated HTML, detect image issues,
  // plan fixes, and apply automated ones. Non-fatal.
  try {
    const imgUrls = [...new Set(issues.map((i) => i.url))];
    for (const url of imgUrls) {
      try {
        const postId = await deps.lookupPostId(credentials, url);
        if (!postId) continue;

        const html = await deps.getPostContent(credentials, postId);
        if (!html) continue;

        const signals = detectWpImageIssues(html, url);
        if (!signals.needs_optimization) continue;

        const plan = planWpImageFixes('wp', url, html, signals);
        if (plan.automated_count === 0) continue;

        const imgResult = applyWpImageFixes(html, plan);
        if (imgResult.applied.length > 0 && imgResult.html !== html) {
          await deps.updatePostContent(credentials, postId, imgResult.html);

          // Attach image fixes to the last result for this URL
          const lastResult = [...results].reverse().find((r) => r.url === url);
          if (lastResult) {
            lastResult.image_fixes = imgResult.applied;
          }
        }
      } catch {
        // Non-fatal — image failure must not block main fixes
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Resource hint injection pass ─────────────────────────────────────────
  // Detect missing preconnect/dns-prefetch hints from any page HTML,
  // inject them globally via a wp_head PHP snippet. Once per batch. Non-fatal.
  try {
    const rhUrls = [...new Set(issues.map((i) => i.url))];
    let hintsInjected = false;
    for (const url of rhUrls) {
      if (hintsInjected) break;
      try {
        const postId = await deps.lookupPostId(credentials, url);
        if (!postId) continue;

        const html = await deps.getPostContent(credentials, postId);
        if (!html) continue;

        const signals = detectResourceHints(html, url);
        if (!signals.needs_hints) continue;

        const plan = generateResourceHintPlan(signals, url);
        if (plan.entries.length === 0) continue;

        // Build PHP snippet to emit resource hints via wp_head
        const tagHtml = plan.insert_html.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const snippet = `function vaeo_resource_hints() {\n  echo '${tagHtml}';\n}\nadd_action('wp_head', 'vaeo_resource_hints', 1);`;

        await deps.injectSnippet(credentials, 'vaeo_resource_hints', snippet);
        hintsInjected = true;

        // Attach resource_hints to the last result in the batch
        const lastResult = results[results.length - 1];
        if (lastResult) {
          lastResult.resource_hints = {
            injected_count: plan.entries.length,
            domains:        plan.entries.map((e) => e.domain),
          };
        }
      } catch {
        // Non-fatal — resource hint failure must not block main fixes
      }
    }
  } catch {
    // Non-fatal
  }

  return results;
}
