/**
 * tools/detect/accessibility_detect.ts
 *
 * Detects accessibility issues in HTML: missing alt text,
 * aria-label gaps, heading structure, lang attribute.
 *
 * Pure function — never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccessibilitySignals {
  images_missing_alt:      { src: string; context: string }[];
  images_empty_alt:        { src: string }[];
  buttons_missing_label:   { html: string }[];
  links_missing_label:     { href: string; html: string }[];
  inputs_missing_label:    { type: string; name: string }[];
  headings_skipped:        boolean;
  heading_levels:          number[];
  lang_attribute_missing:  boolean;
  total_issues:            number;
  needs_fixes:             boolean;
}

// ── Regex ────────────────────────────────────────────────────────────────────

const IMG_TAG_RE      = /<img\b[^>]*>/gi;
const BUTTON_TAG_RE   = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
const LINK_TAG_RE     = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
const INPUT_TAG_RE    = /<input\b[^>]*>/gi;
const HEADING_TAG_RE  = /<(h[1-6])\b/gi;
const HTML_TAG_RE     = /<html\b[^>]*>/i;

const ALT_ATTR_RE     = /\balt\s*=/i;
const ALT_EMPTY_RE    = /\balt\s*=\s*["']\s*["']/i;
const SRC_RE          = /\bsrc\s*=\s*["']([^"']+)["']/i;
const HREF_RE         = /\bhref\s*=\s*["']([^"']+)["']/i;
const ARIA_LABEL_RE   = /\baria-label\s*=/i;
const ARIA_LABELBY_RE = /\baria-labelledby\s*=/i;
const TYPE_RE         = /\btype\s*=\s*["']([^"']+)["']/i;
const NAME_RE         = /\bname\s*=\s*["']([^"']+)["']/i;
const ID_RE           = /\bid\s*=\s*["']([^"']+)["']/i;
const LANG_RE         = /\blang\s*=/i;

const DECORATIVE_RE   = /spacer|pixel|1x1|blank|transparent/i;

const TAG_CONTENT_RE  = />([^<]*)</;

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// ── Detector ─────────────────────────────────────────────────────────────────

export function detectAccessibilityIssues(
  html: string,
  _url: string,
): AccessibilitySignals {
  const result: AccessibilitySignals = {
    images_missing_alt:     [],
    images_empty_alt:       [],
    buttons_missing_label:  [],
    links_missing_label:    [],
    inputs_missing_label:   [],
    headings_skipped:       false,
    heading_levels:         [],
    lang_attribute_missing: false,
    total_issues:           0,
    needs_fixes:            false,
  };

  try {
    if (!html) return result;

    // ── Images missing alt ─────────────────────────────────────────────────
    const imgTags = html.match(IMG_TAG_RE) ?? [];
    for (const tag of imgTags) {
      const src = tag.match(SRC_RE)?.[1] ?? '';

      if (!ALT_ATTR_RE.test(tag)) {
        // No alt attribute at all
        result.images_missing_alt.push({ src, context: tag });
      } else if (ALT_EMPTY_RE.test(tag)) {
        // alt="" — check if actually decorative
        if (src && !DECORATIVE_RE.test(src)) {
          result.images_empty_alt.push({ src });
        }
      }
    }

    // ── Buttons missing label ──────────────────────────────────────────────
    const buttonTags = html.match(BUTTON_TAG_RE) ?? [];
    for (const tag of buttonTags) {
      const textContent = stripTags(tag);
      if (!textContent && !ARIA_LABEL_RE.test(tag) && !ARIA_LABELBY_RE.test(tag)) {
        result.buttons_missing_label.push({ html: tag });
      }
    }

    // ── Links missing label ────────────────────────────────────────────────
    const linkTags = html.match(LINK_TAG_RE) ?? [];
    for (const tag of linkTags) {
      const textContent = stripTags(tag);
      if (!textContent && !ARIA_LABEL_RE.test(tag)) {
        const href = tag.match(HREF_RE)?.[1] ?? '';
        result.links_missing_label.push({ href, html: tag });
      }
    }

    // ── Inputs missing label ───────────────────────────────────────────────
    const inputTags = html.match(INPUT_TAG_RE) ?? [];
    for (const tag of inputTags) {
      const type = tag.match(TYPE_RE)?.[1]?.toLowerCase() ?? 'text';

      // Exclude hidden and submit
      if (type === 'hidden' || type === 'submit') continue;

      // Check for aria-label or aria-labelledby
      if (ARIA_LABEL_RE.test(tag) || ARIA_LABELBY_RE.test(tag)) continue;

      // Check for associated <label> via id
      const id = tag.match(ID_RE)?.[1];
      if (id) {
        const labelForRe = new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
        if (labelForRe.test(html)) continue;
      }

      const name = tag.match(NAME_RE)?.[1] ?? '';
      result.inputs_missing_label.push({ type, name });
    }

    // ── Heading structure ──────────────────────────────────────────────────
    let match: RegExpExecArray | null;
    const headingRe = /<(h[1-6])\b/gi;
    while ((match = headingRe.exec(html)) !== null) {
      const level = parseInt(match[1]!.charAt(1), 10);
      result.heading_levels.push(level);
    }

    for (let i = 1; i < result.heading_levels.length; i++) {
      const prev = result.heading_levels[i - 1]!;
      const curr = result.heading_levels[i]!;
      if (curr > prev + 1) {
        result.headings_skipped = true;
        break;
      }
    }

    // ── Lang attribute ─────────────────────────────────────────────────────
    const htmlTag = html.match(HTML_TAG_RE);
    if (htmlTag) {
      if (!LANG_RE.test(htmlTag[0])) {
        result.lang_attribute_missing = true;
      }
    } else if (html.length > 0) {
      // No <html> tag found — count as missing lang
      result.lang_attribute_missing = true;
    }

    // ── Totals ─────────────────────────────────────────────────────────────
    result.total_issues =
      result.images_missing_alt.length +
      result.images_empty_alt.length +
      result.buttons_missing_label.length +
      result.links_missing_label.length +
      result.inputs_missing_label.length +
      (result.headings_skipped ? 1 : 0) +
      (result.lang_attribute_missing ? 1 : 0);

    result.needs_fixes = result.total_issues > 0;
  } catch {
    // Never throws
  }

  return result;
}
