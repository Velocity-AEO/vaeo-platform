/**
 * tools/detect/performance_detect.ts
 *
 * Performance issue detectors for Velocity AEO.
 * Scans raw HTML for common performance anti-patterns:
 *   - Render-blocking scripts (sync <script> in <head>)
 *   - Images missing loading="lazy"
 *   - @font-face rules missing font-display
 *
 * All detectors are pure functions: (html, url) → PerformanceIssue[].
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type PerformanceIssueType = 'DEFER_SCRIPT' | 'LAZY_IMAGE' | 'FONT_DISPLAY';

export interface PerformanceIssue {
  issue_type: PerformanceIssueType;
  url:        string;
  element:    string;
  fix_hint:   string;
}

// ── Regex patterns ──────────────────────────────────────────────────────────

/**
 * Matches <script src="..."> tags that are render-blocking:
 * - Has a src attribute (external script)
 * - Does NOT have async or defer attributes
 * - Case-insensitive
 */
const SCRIPT_TAG_RE = /<script\s[^>]*src\s*=\s*["'][^"']+["'][^>]*>/gi;

/**
 * Matches <img> tags.
 */
const IMG_TAG_RE = /<img\s[^>]*>/gi;

/**
 * Matches @font-face blocks in <style> tags or inline CSS.
 */
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/gi;

// ── Head extraction ─────────────────────────────────────────────────────────

function extractHead(html: string): string {
  const match = html.match(/<head[\s>]([\s\S]*?)<\/head>/i);
  return match?.[1] ?? '';
}

// ── Detectors ───────────────────────────────────────────────────────────────

/**
 * Detect render-blocking script tags in <head>.
 * A script is render-blocking if it has src= but lacks async or defer.
 */
export function detectRenderBlockingScripts(html: string, url: string): PerformanceIssue[] {
  const head = extractHead(html);
  if (!head) return [];

  const issues: PerformanceIssue[] = [];
  let match: RegExpExecArray | null;
  SCRIPT_TAG_RE.lastIndex = 0;

  while ((match = SCRIPT_TAG_RE.exec(head)) !== null) {
    const tag = match[0];
    const lower = tag.toLowerCase();
    // Skip if already async or defer
    if (/\basync\b/i.test(lower) || /\bdefer\b/i.test(lower)) continue;
    // Skip inline scripts (type=module is deferred by default)
    if (/\btype\s*=\s*["']module["']/i.test(lower)) continue;

    issues.push({
      issue_type: 'DEFER_SCRIPT',
      url,
      element:    tag.length > 200 ? tag.slice(0, 200) + '...' : tag,
      fix_hint:   'Add defer attribute to this script tag',
    });
  }

  return issues;
}

/**
 * Detect <img> tags missing loading="lazy".
 * Skips images that already have loading="lazy" or loading="eager".
 */
export function detectMissingLazyImages(html: string, url: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  let match: RegExpExecArray | null;
  IMG_TAG_RE.lastIndex = 0;

  while ((match = IMG_TAG_RE.exec(html)) !== null) {
    const tag = match[0];
    // Skip if already has loading attribute
    if (/\bloading\s*=\s*["']/i.test(tag)) continue;

    issues.push({
      issue_type: 'LAZY_IMAGE',
      url,
      element:    tag.length > 200 ? tag.slice(0, 200) + '...' : tag,
      fix_hint:   'Add loading="lazy" to this img tag',
    });
  }

  return issues;
}

/**
 * Detect @font-face rules missing font-display property.
 * Scans all <style> blocks in the HTML.
 */
export function detectMissingFontDisplay(html: string, url: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];

  let styleMatch: RegExpExecArray | null;
  STYLE_BLOCK_RE.lastIndex = 0;

  while ((styleMatch = STYLE_BLOCK_RE.exec(html)) !== null) {
    const css = styleMatch[1] ?? '';
    let fontMatch: RegExpExecArray | null;
    FONT_FACE_RE.lastIndex = 0;

    while ((fontMatch = FONT_FACE_RE.exec(css)) !== null) {
      const block = fontMatch[0];
      if (/font-display\s*:/i.test(block)) continue;

      issues.push({
        issue_type: 'FONT_DISPLAY',
        url,
        element:    block.length > 200 ? block.slice(0, 200) + '...' : block,
        fix_hint:   'Add font-display: swap to this @font-face rule',
      });
    }
  }

  return issues;
}

/**
 * Run all performance detectors on a page's HTML.
 */
export function detectAllPerformanceIssues(html: string, url: string): PerformanceIssue[] {
  return [
    ...detectRenderBlockingScripts(html, url),
    ...detectMissingLazyImages(html, url),
    ...detectMissingFontDisplay(html, url),
  ];
}
