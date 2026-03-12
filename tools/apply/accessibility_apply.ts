/**
 * tools/apply/accessibility_apply.ts
 *
 * Applies automated accessibility fixes to HTML.
 * Only lang attribute injection is automated.
 * Heading restructure is flagged but skipped (too risky).
 * Everything else goes to manual_review.
 *
 * Never throws.
 */

import type { AccessibilitySignals } from '../detect/accessibility_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccessibilityFix {
  type:        'add_lang_attribute' | 'normalize_heading_structure';
  description: string;
  automated:   boolean;
}

export interface AccessibilityApplyResult {
  html:          string;
  applied:       AccessibilityFix[];
  skipped:       AccessibilityFix[];
  manual_review: string[];
}

// ── Regex ────────────────────────────────────────────────────────────────────

const HTML_TAG_RE = /<html\b([^>]*)>/i;
const LANG_RE     = /\blang\s*=/i;

// ── Apply ────────────────────────────────────────────────────────────────────

export function applyAccessibilityFixes(
  html: string,
  signals: AccessibilitySignals,
): AccessibilityApplyResult {
  const applied: AccessibilityFix[] = [];
  const skipped: AccessibilityFix[] = [];
  const manual_review: string[] = [];

  try {
    if (!html || !signals) {
      return { html: html ?? '', applied, skipped, manual_review };
    }

    let result = html;

    // ── Lang attribute injection ───────────────────────────────────────────
    if (signals.lang_attribute_missing) {
      const htmlMatch = result.match(HTML_TAG_RE);
      if (htmlMatch) {
        const oldTag = htmlMatch[0];
        if (!LANG_RE.test(oldTag)) {
          const newTag = oldTag.replace(/<html\b/i, '<html lang="en"');
          result = result.replace(oldTag, newTag);
          applied.push({
            type:        'add_lang_attribute',
            description: 'Added lang="en" to <html> element for screen reader pronunciation',
            automated:   true,
          });
        }
      }
    }

    // ── Heading structure — too risky to auto-fix ──────────────────────────
    if (signals.headings_skipped) {
      skipped.push({
        type:        'normalize_heading_structure',
        description: 'Heading levels skip one or more levels — restructuring requires manual review',
        automated:   false,
      });
    }

    // ── Manual review items ────────────────────────────────────────────────
    if (signals.images_missing_alt.length > 0) {
      manual_review.push(
        `${signals.images_missing_alt.length} image${signals.images_missing_alt.length > 1 ? 's' : ''} missing alt text — review required`,
      );
    }

    if (signals.images_empty_alt.length > 0) {
      manual_review.push(
        `${signals.images_empty_alt.length} image${signals.images_empty_alt.length > 1 ? 's' : ''} with empty alt text — verify if decorative`,
      );
    }

    if (signals.buttons_missing_label.length > 0) {
      manual_review.push(
        `${signals.buttons_missing_label.length} button${signals.buttons_missing_label.length > 1 ? 's' : ''} missing accessible labels`,
      );
    }

    if (signals.links_missing_label.length > 0) {
      manual_review.push(
        `${signals.links_missing_label.length} link${signals.links_missing_label.length > 1 ? 's' : ''} with no accessible name`,
      );
    }

    if (signals.inputs_missing_label.length > 0) {
      manual_review.push(
        `${signals.inputs_missing_label.length} input${signals.inputs_missing_label.length > 1 ? 's' : ''} missing associated labels`,
      );
    }

    return { html: result, applied, skipped, manual_review };
  } catch {
    return { html: html ?? '', applied, skipped, manual_review };
  }
}
