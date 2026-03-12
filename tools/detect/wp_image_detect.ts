/**
 * tools/detect/wp_image_detect.ts
 *
 * Detects image optimization issues on WordPress pages:
 * missing lazy loading, alt text, dimensions, non-WebP formats,
 * and oversized images.
 *
 * Pure function — never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WpImageSignals {
  total_images:                number;
  images_without_lazy:         number;
  images_without_alt:          number;
  images_without_width_height: number;
  large_images:                { src: string; estimated_kb: number }[];
  non_webp_images:             { src: string; format: string }[];
  needs_optimization:          boolean;
}

// ── Regex ────────────────────────────────────────────────────────────────────

const IMG_TAG_RE  = /<img\b[^>]*>/gi;
const SRC_RE      = /\bsrc\s*=\s*["']([^"']+)["']/i;
const ALT_RE      = /\balt\s*=/i;
const LAZY_RE     = /\bloading\s*=\s*["']lazy["']/i;
const WIDTH_RE    = /\bwidth\s*=\s*["']?\d/i;
const HEIGHT_RE   = /\bheight\s*=\s*["']?\d/i;

const NON_WEBP_EXT_RE = /\.(jpe?g|png|gif|bmp)(\?|$)/i;
const FORMAT_MAP: Record<string, string> = {
  jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', bmp: 'BMP',
};

// WordPress upload paths without thumbnail suffixes suggest full-size images
const WP_UPLOAD_RE     = /wp-content\/uploads\//i;
const THUMBNAIL_RE     = /-\d{2,4}x\d{2,4}\./;

// ── Detector ─────────────────────────────────────────────────────────────────

export function detectWpImageIssues(html: string, _url: string): WpImageSignals {
  const result: WpImageSignals = {
    total_images:                0,
    images_without_lazy:         0,
    images_without_alt:          0,
    images_without_width_height: 0,
    large_images:                [],
    non_webp_images:             [],
    needs_optimization:          false,
  };

  try {
    const imgTags = html.match(IMG_TAG_RE);
    if (!imgTags || imgTags.length === 0) return result;

    result.total_images = imgTags.length;

    for (const tag of imgTags) {
      const srcMatch = tag.match(SRC_RE);
      const src = srcMatch?.[1] ?? '';

      // Lazy loading check
      if (!LAZY_RE.test(tag)) {
        result.images_without_lazy++;
      }

      // Alt text check
      if (!ALT_RE.test(tag)) {
        result.images_without_alt++;
      }

      // Dimensions check
      if (!WIDTH_RE.test(tag) || !HEIGHT_RE.test(tag)) {
        result.images_without_width_height++;
      }

      // Non-WebP format check
      if (src) {
        const extMatch = src.match(NON_WEBP_EXT_RE);
        if (extMatch) {
          const ext = extMatch[1]!.toLowerCase();
          result.non_webp_images.push({
            src,
            format: FORMAT_MAP[ext] ?? ext.toUpperCase(),
          });
        }
      }

      // Large image check (full-size WP uploads without thumbnail suffix)
      if (src && WP_UPLOAD_RE.test(src) && !THUMBNAIL_RE.test(src)) {
        result.large_images.push({ src, estimated_kb: 300 });
      }
    }

    result.needs_optimization =
      result.images_without_lazy > 0 ||
      result.images_without_alt > 0 ||
      result.images_without_width_height > 0 ||
      result.non_webp_images.length > 0 ||
      result.large_images.length > 0;
  } catch {
    // Never throws
  }

  return result;
}
