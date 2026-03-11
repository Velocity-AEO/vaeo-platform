/**
 * tools/perf/lcp_preloader.ts
 *
 * LCP image preload injector and WebP converter.
 *
 * injectLCPPreload(html, lcpImage) — injects <link rel="preload" as="image">
 * convertToWebP(imagePath)        — converts image file to WebP using sharp
 *
 * Never throws.
 */

// ── injectLCPPreload ──────────────────────────────────────────────────────────

/**
 * Inject a <link rel="preload" as="image" href="..."> into <head>.
 *
 * Placement: immediately after the first <meta charset> tag if present,
 * otherwise immediately after the opening <head> tag.
 *
 * Idempotent: no-ops if a preload for that src already exists.
 */
export function injectLCPPreload(
  html:     string,
  lcpImage: { src: string },
): string {
  const { src } = lcpImage;
  if (!src) return html;

  // Check if preload for this src already exists (simple string check)
  const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingPreloadRe = new RegExp(
    `<link[^>]+rel=["']preload["'][^>]+href=["']${escapedSrc}["']`,
    'i',
  );
  const existingPreloadRe2 = new RegExp(
    `<link[^>]+href=["']${escapedSrc}["'][^>]+rel=["']preload["']`,
    'i',
  );
  if (existingPreloadRe.test(html) || existingPreloadRe2.test(html)) {
    return html; // already present
  }

  const preloadTag = `<link rel="preload" as="image" href="${src}">`;

  // Try to inject after <meta charset="..."> (earliest safe position in <head>)
  const charsetMatch = html.match(/<meta[^>]+charset[^>]*>/i);
  if (charsetMatch?.index != null) {
    const insertAt = charsetMatch.index + charsetMatch[0].length;
    return (
      html.slice(0, insertAt) +
      '\n  ' + preloadTag +
      html.slice(insertAt)
    );
  }

  // Fallback: inject immediately after opening <head> tag (with optional attrs)
  const headMatch = html.match(/<head(\s[^>]*)?>/i);
  if (headMatch?.index != null) {
    const insertAt = headMatch.index + headMatch[0].length;
    return (
      html.slice(0, insertAt) +
      '\n  ' + preloadTag +
      html.slice(insertAt)
    );
  }

  // Last resort: prepend to document
  return preloadTag + '\n' + html;
}

// ── convertToWebP ─────────────────────────────────────────────────────────────

/**
 * Convert an image file to WebP format using sharp.
 * Returns a Buffer containing the WebP data.
 * Never throws — returns an empty Buffer on error.
 */
export async function convertToWebP(imagePath: string): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(imagePath).webp({ quality: 85 }).toBuffer();
  } catch (err) {
    process.stderr.write(
      `convertToWebP failed for ${imagePath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return Buffer.alloc(0);
  }
}
