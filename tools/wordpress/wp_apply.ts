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

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPApplyResult {
  issue_type: string;
  url:        string;
  success:    boolean;
  action:     string;
  error?:     string;
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
export async function applyWPFix(
  issue: WPIssue,
  credentials: WPCredentials,
  _testDeps?: Partial<WPApplyDeps>,
): Promise<WPApplyResult> {
  const deps = { ...defaultDeps(), ..._testDeps };

  try {
    switch (issue.category) {
      case 'schema':
        return await applySchemaFix(issue, credentials, deps);
      case 'metadata':
        return await applyTitleMetaFix(issue, credentials, deps);
      case 'performance':
        return await applyPerformanceFix(issue, credentials, deps);
      case 'images':
        return await applyImageFix(issue, credentials, deps);
      default:
        return {
          issue_type: issue.issue_type,
          url:        issue.url,
          success:    false,
          action:     'unknown',
          error:      `Unknown issue category: ${issue.category}`,
        };
    }
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
 * Returns array of results — one per issue.
 */
export async function applyAllWPFixes(
  issues: WPIssue[],
  credentials: WPCredentials,
  _testDeps?: Partial<WPApplyDeps>,
): Promise<WPApplyResult[]> {
  const results: WPApplyResult[] = [];
  for (const issue of issues) {
    results.push(await applyWPFix(issue, credentials, _testDeps));
  }
  return results;
}
