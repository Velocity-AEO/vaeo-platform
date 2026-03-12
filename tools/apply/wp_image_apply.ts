/**
 * tools/apply/wp_image_apply.ts
 *
 * Applies automated WordPress image fixes to HTML.
 * Only applies automated=true fixes; skips manual ones.
 * Skips first <img> tag for LCP protection on lazy loading.
 *
 * Never throws — skips any fix that would corrupt HTML.
 */

import type { WpImageFix, WpImagePlan } from '../optimize/wp_image_plan.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WpImageApplyResult {
  html:    string;
  applied: WpImageFix[];
  skipped: WpImageFix[];
}

// ── Regex ────────────────────────────────────────────────────────────────────

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const LAZY_RE    = /\bloading\s*=\s*["']lazy["']/i;

// ── Apply ────────────────────────────────────────────────────────────────────

export function applyWpImageFixes(
  html: string,
  plan: WpImagePlan,
): WpImageApplyResult {
  const applied: WpImageFix[] = [];
  const skipped: WpImageFix[] = [];

  if (!html || !plan?.fixes) {
    return { html: html ?? '', applied, skipped: plan?.fixes ?? [] };
  }

  let result = html;

  // Find all img tags and their positions for LCP protection
  const allImgTags = html.match(IMG_TAG_RE) ?? [];
  const firstImgTag = allImgTags[0];

  for (const fix of plan.fixes) {
    // Skip non-automated fixes
    if (!fix.automated) {
      skipped.push(fix);
      continue;
    }

    try {
      if (fix.type === 'add_lazy_loading') {
        // Skip first image (LCP protection)
        if (fix.current_html === firstImgTag) {
          skipped.push(fix);
          continue;
        }

        // Verify the tag exists in current result
        if (!result.includes(fix.current_html)) {
          skipped.push(fix);
          continue;
        }

        // Verify not already lazy
        if (LAZY_RE.test(fix.current_html)) {
          skipped.push(fix);
          continue;
        }

        // Apply: replace the exact tag with the fixed version
        result = result.replace(fix.current_html, fix.fixed_html);
        applied.push(fix);
        continue;
      }

      // Other automated fix types (future-proof)
      if (fix.current_html && fix.fixed_html && result.includes(fix.current_html)) {
        result = result.replace(fix.current_html, fix.fixed_html);
        applied.push(fix);
      } else {
        skipped.push(fix);
      }
    } catch {
      // Skip any fix that would corrupt HTML
      skipped.push(fix);
    }
  }

  return { html: result, applied, skipped };
}
