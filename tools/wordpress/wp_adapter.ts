/**
 * tools/wordpress/wp_adapter.ts
 *
 * WordPress REST API adapter for fetching pages, theme files,
 * updating posts, and injecting snippets.
 *
 * Auth: Application Passwords → Basic base64(username:appPassword)
 *
 * Design rules:
 *   - fetch is injectable for unit tests (_injectFetch / _resetInjections)
 *   - 429 rate-limit: wait 500ms and retry once
 *   - Never throws from public functions — returns result/error shapes
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPCredentials {
  siteUrl:     string;
  username:    string;
  appPassword: string;
}

export interface ThemeFile {
  name:    string;
  content: string;
}

// ── Injectable fetch ─────────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

let _fetchFn: FetchFn | undefined;

export function _injectFetch(fn: FetchFn): void {
  _fetchFn = fn;
}

export function _resetInjections(): void {
  _fetchFn = undefined;
}

function getFetch(): FetchFn {
  return _fetchFn ?? fetch;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function basicAuth(username: string, appPassword: string): string {
  const password = appPassword.replace(/\s/g, '');
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function normUrl(url: string): string {
  return url.replace(/\/$/, '');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wpFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await getFetch()(url, init);
  if (res.status === 429) {
    await sleep(500);
    return getFetch()(url, init);
  }
  return res;
}

function jsonHeaders(authHeader: string): Record<string, string> {
  return {
    Authorization:  authHeader,
    'Content-Type': 'application/json',
  };
}

// ── getWPPage ────────────────────────────────────────────────────────────────

/**
 * Fetch rendered HTML of a WordPress page by path.
 * Uses the REST API to look up by slug, then fetches the permalink.
 * Returns empty string if page not found or on error.
 */
export async function getWPPage(
  credentials: WPCredentials,
  path: string,
): Promise<string> {
  const base = normUrl(credentials.siteUrl);
  const auth = basicAuth(credentials.username, credentials.appPassword);

  // Extract slug from path
  const slug = path.split('/').filter(Boolean).pop() ?? '';
  if (!slug) return '';

  // Try pages then posts
  for (const endpoint of ['pages', 'posts']) {
    const apiUrl = `${base}/wp-json/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&_fields=content`;
    const res = await wpFetch(apiUrl, {
      method:  'GET',
      headers: { Authorization: auth },
    });
    if (!res.ok) continue;

    const items = await res.json() as Array<{ content?: { rendered?: string } }>;
    if (items?.length && items[0].content?.rendered) {
      return items[0].content.rendered;
    }
  }

  return '';
}

// ── getWPThemeFiles ──────────────────────────────────────────────────────────

/**
 * Return all editable files from the active WordPress theme.
 * Uses the /wp/v2/themes endpoint to find the active theme stylesheet,
 * then fetches theme files via the edit endpoint.
 */
export async function getWPThemeFiles(
  credentials: WPCredentials,
): Promise<ThemeFile[]> {
  const base = normUrl(credentials.siteUrl);
  const auth = basicAuth(credentials.username, credentials.appPassword);

  // 1. Get active theme stylesheet
  const themesUrl = `${base}/wp-json/wp/v2/themes?status=active&_fields=stylesheet`;
  const themesRes = await wpFetch(themesUrl, {
    method:  'GET',
    headers: { Authorization: auth },
  });
  if (!themesRes.ok) return [];

  const themes = await themesRes.json() as Array<{ stylesheet?: string }>;
  const stylesheet = themes?.[0]?.stylesheet;
  if (!stylesheet) return [];

  // 2. Get theme file list
  const filesUrl = `${base}/wp-json/wp/v2/themes/${encodeURIComponent(stylesheet)}`;
  const filesRes = await wpFetch(filesUrl, {
    method:  'GET',
    headers: { Authorization: auth },
  });
  if (!filesRes.ok) return [];

  const themeData = await filesRes.json() as {
    theme_supports?: Record<string, unknown>;
    // WordPress returns theme file list in various shapes
    [key: string]: unknown;
  };

  // Extract file contents from the theme editor endpoint
  const editUrl = `${base}/wp-json/wp/v2/themes/${encodeURIComponent(stylesheet)}/file-edit`;
  const editRes = await wpFetch(editUrl, {
    method:  'GET',
    headers: { Authorization: auth },
  });

  if (!editRes.ok) {
    // Fallback: return theme data keys as file names
    const files: ThemeFile[] = [];
    if (themeData && typeof themeData === 'object') {
      for (const [key, val] of Object.entries(themeData)) {
        if (typeof val === 'string' && (key.endsWith('.php') || key.endsWith('.css') || key.endsWith('.js'))) {
          files.push({ name: key, content: val });
        }
      }
    }
    return files;
  }

  const editData = await editRes.json() as Array<{ file?: string; content?: string }> | Record<string, unknown>;

  if (Array.isArray(editData)) {
    return editData
      .filter((f): f is { file: string; content: string } => !!f.file && typeof f.content === 'string')
      .map((f) => ({ name: f.file, content: f.content }));
  }

  return [];
}

// ── updateWPPost ─────────────────────────────────────────────────────────────

/**
 * Update post/page meta fields (title, description, schema, etc.)
 * via the WordPress REST API.
 *
 * Throws on failure (caller should catch).
 */
export async function updateWPPost(
  credentials: WPCredentials,
  postId: number,
  fields: Record<string, string>,
): Promise<void> {
  const base = normUrl(credentials.siteUrl);
  const auth = basicAuth(credentials.username, credentials.appPassword);

  // Determine resource type by trying pages first, then posts
  let endpoint = 'posts';
  const pageCheck = await wpFetch(
    `${base}/wp-json/wp/v2/pages/${postId}?_fields=id`,
    { method: 'GET', headers: { Authorization: auth } },
  );
  if (pageCheck.ok) {
    endpoint = 'pages';
  }

  const url = `${base}/wp-json/wp/v2/${endpoint}/${postId}`;

  // Separate standard fields from meta fields
  const standardFields = ['title', 'content', 'excerpt', 'slug', 'status'];
  const body: Record<string, unknown> = {};
  const meta: Record<string, string> = {};

  for (const [key, val] of Object.entries(fields)) {
    if (standardFields.includes(key)) {
      body[key] = val;
    } else {
      meta[key] = val;
    }
  }

  if (Object.keys(meta).length > 0) {
    body['meta'] = meta;
  }

  const res = await wpFetch(url, {
    method:  'POST',
    headers: jsonHeaders(auth),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`updateWPPost failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── injectWPSnippet ──────────────────────────────────────────────────────────

/**
 * Inject a PHP snippet into the active theme's functions.php.
 * Uses the WordPress theme file edit API.
 *
 * The snippet is wrapped in a guard to prevent duplicate injection:
 *   if (!function_exists('vaeo_{snippetName}')) { ... }
 *
 * Throws on failure (caller should catch).
 */
export async function injectWPSnippet(
  credentials: WPCredentials,
  snippetName: string,
  snippetContent: string,
): Promise<void> {
  const base = normUrl(credentials.siteUrl);
  const auth = basicAuth(credentials.username, credentials.appPassword);

  // 1. Get active theme
  const themesUrl = `${base}/wp-json/wp/v2/themes?status=active&_fields=stylesheet`;
  const themesRes = await wpFetch(themesUrl, {
    method:  'GET',
    headers: { Authorization: auth },
  });
  if (!themesRes.ok) {
    throw new Error(`Failed to get active theme (${themesRes.status})`);
  }

  const themes = await themesRes.json() as Array<{ stylesheet?: string }>;
  const stylesheet = themes?.[0]?.stylesheet;
  if (!stylesheet) throw new Error('No active theme found');

  // 2. Read current functions.php
  const fileUrl = `${base}/wp-json/wp/v2/themes/${encodeURIComponent(stylesheet)}`;
  const fileRes = await wpFetch(`${fileUrl}?file=functions.php`, {
    method:  'GET',
    headers: { Authorization: auth },
  });

  let currentContent = '';
  if (fileRes.ok) {
    const fileData = await fileRes.json() as { content?: string } | string;
    if (typeof fileData === 'string') {
      currentContent = fileData;
    } else if (typeof fileData === 'object' && fileData !== null && typeof fileData.content === 'string') {
      currentContent = fileData.content;
    }
  }

  // 3. Guard: don't inject if already present
  const guardName = `vaeo_${snippetName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  if (currentContent.includes(guardName)) {
    return; // Already injected
  }

  // 4. Wrap snippet with guard and append
  const wrappedSnippet = `\n// VAEO: ${snippetName}\nif (!function_exists('${guardName}')) {\n${snippetContent}\n}\n`;
  const newContent = currentContent + wrappedSnippet;

  // 5. Write back via theme file edit
  const writeRes = await wpFetch(fileUrl, {
    method:  'POST',
    headers: jsonHeaders(auth),
    body:    JSON.stringify({
      file:    'functions.php',
      content: newContent,
    }),
  });

  if (!writeRes.ok) {
    const text = await writeRes.text();
    throw new Error(`injectWPSnippet failed (${writeRes.status}): ${text.slice(0, 200)}`);
  }
}
