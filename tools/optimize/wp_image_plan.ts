/**
 * tools/optimize/wp_image_plan.ts
 *
 * Generates a plan of image fixes for WordPress pages.
 * Automated fixes (lazy loading) vs manual-review fixes
 * (alt text, dimensions, WebP conversion, size reduction).
 *
 * Pure function — never throws.
 */

import type { WpImageSignals } from '../detect/wp_image_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WpImageFix {
  type:         'add_lazy_loading'
              | 'add_missing_alt'
              | 'add_width_height'
              | 'suggest_webp_conversion'
              | 'suggest_size_reduction';
  target_src:   string;
  current_html: string;
  fixed_html:   string;
  automated:    boolean;
  reason:       string;
}

export interface WpImagePlan {
  site_id:         string;
  url:             string;
  fixes:           WpImageFix[];
  automated_count: number;
  manual_count:    number;
}

// ── Regex ────────────────────────────────────────────────────────────────────

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_RE     = /\bsrc\s*=\s*["']([^"']+)["']/i;
const ALT_RE     = /\balt\s*=/i;
const LAZY_RE    = /\bloading\s*=\s*["']lazy["']/i;
const WIDTH_RE   = /\bwidth\s*=\s*["']?\d/i;
const HEIGHT_RE  = /\bheight\s*=\s*["']?\d/i;

// ── Plan generator ──────────────────────────────────────────────────────────

export function planWpImageFixes(
  site_id:  string,
  url:      string,
  html:     string,
  signals:  WpImageSignals,
): WpImagePlan {
  const fixes: WpImageFix[] = [];

  try {
    const imgTags = html.match(IMG_TAG_RE) ?? [];

    for (let i = 0; i < imgTags.length; i++) {
      const tag = imgTags[i]!;
      const srcMatch = tag.match(SRC_RE);
      const src = srcMatch?.[1] ?? '';

      // ── Lazy loading (automated — skip first image for LCP)
      if (!LAZY_RE.test(tag) && i > 0) {
        const fixed = tag.replace(/<img\b/i, '<img loading="lazy"');
        fixes.push({
          type:         'add_lazy_loading',
          target_src:   src,
          current_html: tag,
          fixed_html:   fixed,
          automated:    true,
          reason:       'Image missing loading="lazy" — add for faster page loads',
        });
      }

      // ── Missing alt (manual — cannot generate alt text without image content)
      if (!ALT_RE.test(tag)) {
        fixes.push({
          type:         'add_missing_alt',
          target_src:   src,
          current_html: tag,
          fixed_html:   tag.replace(/<img\b/i, '<img alt=""'),
          automated:    false,
          reason:       'Image missing alt attribute — requires manual description',
        });
      }

      // ── Missing width/height (manual — dimensions require fetching the image)
      if (!WIDTH_RE.test(tag) || !HEIGHT_RE.test(tag)) {
        fixes.push({
          type:         'add_width_height',
          target_src:   src,
          current_html: tag,
          fixed_html:   tag, // cannot auto-fix without image dimensions
          automated:    false,
          reason:       'Image missing width/height — causes layout shift (CLS)',
        });
      }
    }

    // ── Non-WebP images (manual — file re-encoding out of scope)
    for (const img of signals.non_webp_images) {
      fixes.push({
        type:         'suggest_webp_conversion',
        target_src:   img.src,
        current_html: '',
        fixed_html:   '',
        automated:    false,
        reason:       `Image is ${img.format} format — convert to WebP for smaller file size`,
      });
    }

    // ── Large images (manual — compression out of scope)
    for (const img of signals.large_images) {
      fixes.push({
        type:         'suggest_size_reduction',
        target_src:   img.src,
        current_html: '',
        fixed_html:   '',
        automated:    false,
        reason:       `Image estimated at ${img.estimated_kb}KB — consider resizing or compressing`,
      });
    }
  } catch {
    // Never throws
  }

  return {
    site_id,
    url,
    fixes,
    automated_count: fixes.filter((f) => f.automated).length,
    manual_count:    fixes.filter((f) => !f.automated).length,
  };
}
