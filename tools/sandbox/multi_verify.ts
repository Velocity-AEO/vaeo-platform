/**
 * tools/sandbox/multi_verify.ts
 *
 * Multi-signal verification for sandbox pages.
 * Fetches page HTML once, then runs all requested signal checks
 * (schema, title, meta_description, h1, canonical, lazy_images,
 * font_display, render_blocking).
 *
 * Injectable fetch for tests. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type VerifySignal =
  | 'schema'
  | 'title'
  | 'meta_description'
  | 'h1'
  | 'canonical'
  | 'lazy_images'
  | 'font_display'
  | 'render_blocking';

export interface SignalResult {
  signal:    VerifySignal;
  status:    'PASS' | 'FAIL' | 'SKIP';
  expected?: string;
  actual?:   string;
  error?:    string;
}

export interface MultiVerifyResult {
  url:        string;
  fetchedAt:  string;
  signals:    SignalResult[];
  overall:    'PASS' | 'PARTIAL' | 'FAIL';
  pass_count: number;
  fail_count: number;
}

export const ALL_SIGNALS: VerifySignal[] = [
  'schema', 'title', 'meta_description', 'h1',
  'canonical', 'lazy_images', 'font_display', 'render_blocking',
];

// ── Options ──────────────────────────────────────────────────────────────────

export interface MultiVerifyOptions {
  signals?: VerifySignal[];
  expected?: {
    title?:            string;
    meta_description?: string;
    canonical?:        string;
    h1?:               string;
    schema_type?:      string;
  };
  fetch?: typeof fetch;
}

// ── Regex patterns ───────────────────────────────────────────────────────────

const TITLE_RE          = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_DESC_RE      = /<meta\s[^>]*name\s*=\s*["']description["'][^>]*>/i;
const META_CONTENT_RE   = /content\s*=\s*["']([^"']*)["']/i;
const H1_RE             = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
const CANONICAL_RE      = /<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*>/i;
const CANONICAL_HREF_RE = /href\s*=\s*["']([^"']*)["']/i;
const JSONLD_RE         = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const SCRIPT_TAG_RE     = /<script\s[^>]*src\s*=\s*["'][^"']+["'][^>]*>/gi;
const IMG_TAG_RE        = /<img\s[^>]*>/gi;
const STYLE_BLOCK_RE    = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const FONT_FACE_RE      = /@font-face\s*\{[^}]*\}/gi;

// ── Head extraction ──────────────────────────────────────────────────────────

function extractHead(html: string): string {
  const match = html.match(/<head[\s>]([\s\S]*?)<\/head>/i);
  return match?.[1] ?? '';
}

// ── Signal checkers ──────────────────────────────────────────────────────────

function checkSchema(html: string, expected?: { schema_type?: string }): SignalResult {
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  JSONLD_RE.lastIndex = 0;
  while ((m = JSONLD_RE.exec(html)) !== null) {
    blocks.push((m[1] ?? '').trim());
  }

  if (blocks.length === 0) {
    return { signal: 'schema', status: 'FAIL', error: 'No JSON-LD schema found' };
  }

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      if (expected?.schema_type) {
        const type = parsed['@type'];
        if (type === expected.schema_type) {
          return { signal: 'schema', status: 'PASS', expected: expected.schema_type, actual: type };
        }
      } else {
        return { signal: 'schema', status: 'PASS', actual: parsed['@type'] ?? 'unknown' };
      }
    } catch {
      // Try next block
    }
  }

  if (expected?.schema_type) {
    return {
      signal: 'schema', status: 'FAIL',
      expected: expected.schema_type,
      error: `No JSON-LD block with @type="${expected.schema_type}" found`,
    };
  }

  return { signal: 'schema', status: 'FAIL', error: 'All JSON-LD blocks have parse errors' };
}

function checkTitle(html: string, expected?: string): SignalResult {
  const match = html.match(TITLE_RE);
  const actual = match?.[1]?.trim() ?? '';

  if (!actual) {
    return { signal: 'title', status: 'FAIL', expected, error: 'No <title> tag found' };
  }

  if (expected && actual !== expected) {
    return { signal: 'title', status: 'FAIL', expected, actual };
  }

  return { signal: 'title', status: 'PASS', actual };
}

function checkMetaDescription(html: string, expected?: string): SignalResult {
  const match = html.match(META_DESC_RE);
  if (!match) {
    return { signal: 'meta_description', status: 'FAIL', expected, error: 'No meta description found' };
  }

  const contentMatch = match[0].match(META_CONTENT_RE);
  const actual = contentMatch?.[1]?.trim() ?? '';

  if (!actual) {
    return { signal: 'meta_description', status: 'FAIL', expected, error: 'Meta description is empty' };
  }

  if (expected && actual !== expected) {
    return { signal: 'meta_description', status: 'FAIL', expected, actual };
  }

  return { signal: 'meta_description', status: 'PASS', actual };
}

function checkH1(html: string, expected?: string): SignalResult {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  H1_RE.lastIndex = 0;
  while ((m = H1_RE.exec(html)) !== null) {
    matches.push((m[1] ?? '').replace(/<[^>]*>/g, '').trim());
  }

  if (matches.length === 0) {
    return { signal: 'h1', status: 'FAIL', expected, error: 'No <h1> tag found' };
  }

  if (matches.length > 1) {
    return {
      signal: 'h1', status: 'FAIL',
      actual: `${matches.length} H1 tags found`,
      error: `Multiple H1 tags: ${matches.join(', ')}`,
    };
  }

  const actual = matches[0];

  if (expected && actual !== expected) {
    return { signal: 'h1', status: 'FAIL', expected, actual };
  }

  return { signal: 'h1', status: 'PASS', actual };
}

function checkCanonical(html: string, expected?: string): SignalResult {
  const head = extractHead(html);
  const match = head.match(CANONICAL_RE);

  if (!match) {
    return { signal: 'canonical', status: 'FAIL', expected, error: 'No canonical link found' };
  }

  const hrefMatch = match[0].match(CANONICAL_HREF_RE);
  const actual = hrefMatch?.[1]?.trim() ?? '';

  if (!actual) {
    return { signal: 'canonical', status: 'FAIL', expected, error: 'Canonical link has no href' };
  }

  if (expected && actual !== expected) {
    return { signal: 'canonical', status: 'FAIL', expected, actual };
  }

  return { signal: 'canonical', status: 'PASS', actual };
}

function checkLazyImages(html: string): SignalResult {
  const imgs: string[] = [];
  let m: RegExpExecArray | null;
  IMG_TAG_RE.lastIndex = 0;
  while ((m = IMG_TAG_RE.exec(html)) !== null) {
    imgs.push(m[0]);
  }

  if (imgs.length === 0) {
    return { signal: 'lazy_images', status: 'SKIP', actual: 'No images found' };
  }

  const missing = imgs.filter((tag) => !/\bloading\s*=\s*["']/i.test(tag));

  if (missing.length === 0) {
    return { signal: 'lazy_images', status: 'PASS', actual: `${imgs.length} images, all have loading attr` };
  }

  return {
    signal: 'lazy_images', status: 'FAIL',
    actual: `${missing.length}/${imgs.length} images missing loading attribute`,
  };
}

function checkFontDisplay(html: string): SignalResult {
  const styleBlocks: string[] = [];
  let m: RegExpExecArray | null;
  STYLE_BLOCK_RE.lastIndex = 0;
  while ((m = STYLE_BLOCK_RE.exec(html)) !== null) {
    styleBlocks.push(m[1] ?? '');
  }

  if (styleBlocks.length === 0) {
    return { signal: 'font_display', status: 'SKIP', actual: 'No <style> blocks found' };
  }

  const allFontFaces: string[] = [];
  for (const css of styleBlocks) {
    FONT_FACE_RE.lastIndex = 0;
    while ((m = FONT_FACE_RE.exec(css)) !== null) {
      allFontFaces.push(m[0]);
    }
  }

  if (allFontFaces.length === 0) {
    return { signal: 'font_display', status: 'SKIP', actual: 'No @font-face rules found' };
  }

  const missing = allFontFaces.filter((block) => !/font-display\s*:/i.test(block));

  if (missing.length === 0) {
    return { signal: 'font_display', status: 'PASS', actual: `${allFontFaces.length} @font-face rules, all have font-display` };
  }

  return {
    signal: 'font_display', status: 'FAIL',
    actual: `${missing.length}/${allFontFaces.length} @font-face rules missing font-display`,
  };
}

function checkRenderBlocking(html: string): SignalResult {
  const head = extractHead(html);
  if (!head) {
    return { signal: 'render_blocking', status: 'PASS', actual: 'No <head> section' };
  }

  const scripts: string[] = [];
  let m: RegExpExecArray | null;
  SCRIPT_TAG_RE.lastIndex = 0;
  while ((m = SCRIPT_TAG_RE.exec(head)) !== null) {
    const tag = m[0];
    const lower = tag.toLowerCase();
    if (/\basync\b/i.test(lower)) continue;
    if (/\bdefer\b/i.test(lower)) continue;
    if (/\btype\s*=\s*["']module["']/i.test(lower)) continue;
    scripts.push(tag);
  }

  if (scripts.length === 0) {
    return { signal: 'render_blocking', status: 'PASS', actual: 'No render-blocking scripts' };
  }

  return {
    signal: 'render_blocking', status: 'FAIL',
    actual: `${scripts.length} render-blocking script(s) in <head>`,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Fetch page HTML once, then run all requested signal checks.
 * Never throws.
 */
export async function multiVerify(
  url: string,
  options?: MultiVerifyOptions,
): Promise<MultiVerifyResult> {
  const fetchedAt = new Date().toISOString();
  const signals = options?.signals ?? ALL_SIGNALS;
  const fetchFn = options?.fetch ?? fetch;

  // Fetch HTML
  let html: string;
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'VelocityAEO-Sandbox/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return {
        url, fetchedAt,
        signals: signals.map((s) => ({ signal: s, status: 'FAIL' as const, error: `HTTP ${res.status}` })),
        overall: 'FAIL',
        pass_count: 0,
        fail_count: signals.length,
      };
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url, fetchedAt,
      signals: signals.map((s) => ({ signal: s, status: 'FAIL' as const, error: `Fetch error: ${msg}` })),
      overall: 'FAIL',
      pass_count: 0,
      fail_count: signals.length,
    };
  }

  // Run signal checks
  const results: SignalResult[] = [];
  const expected = options?.expected;

  for (const signal of signals) {
    switch (signal) {
      case 'schema':
        results.push(checkSchema(html, expected));
        break;
      case 'title':
        results.push(checkTitle(html, expected?.title));
        break;
      case 'meta_description':
        results.push(checkMetaDescription(html, expected?.meta_description));
        break;
      case 'h1':
        results.push(checkH1(html, expected?.h1));
        break;
      case 'canonical':
        results.push(checkCanonical(html, expected?.canonical));
        break;
      case 'lazy_images':
        results.push(checkLazyImages(html));
        break;
      case 'font_display':
        results.push(checkFontDisplay(html));
        break;
      case 'render_blocking':
        results.push(checkRenderBlocking(html));
        break;
    }
  }

  const pass_count = results.filter((r) => r.status === 'PASS').length;
  const fail_count = results.filter((r) => r.status === 'FAIL').length;

  let overall: 'PASS' | 'PARTIAL' | 'FAIL';
  if (fail_count === 0) {
    overall = 'PASS';
  } else if (pass_count === 0) {
    overall = 'FAIL';
  } else {
    overall = 'PARTIAL';
  }

  return { url, fetchedAt, signals: results, overall, pass_count, fail_count };
}
