/**
 * packages/core/src/protected-routes.ts
 *
 * Canonical protected route exclusion list for VAEO.
 * Applied at three layers: crawler, detector, and queue builder.
 *
 * These are CMS-managed system routes where no writable resource exists.
 * VAEO never crawls, detects issues on, or queues fixes for these paths.
 */

// ── Shopify protected paths ─────────────────────────────────────────────────

export const SHOPIFY_PROTECTED_PATHS = [
  '/account',
  '/cart',
  '/checkout',
  '/search',
  '/password',
  '/challenge',
  '/customize',
  '/orders',
  '/collections/vendors',
  '/collections/types',
  '/customer_authentication',
  '/customer_authentication/redirect',
  '/policies',
  '/apps',
  '/gift_cards',
  '/services',
  '/toolbox',
] as const;

// ── WordPress protected paths ───────────────────────────────────────────────

export const WORDPRESS_PROTECTED_PATHS = [
  '/wp-admin',
  '/wp-login.php',
  '/wp-cron.php',
  '/xmlrpc.php',
  '/feed',
  '/wp-includes',
  '/wp-content/uploads',
] as const;

/**
 * WordPress paths that are protected at base only (no prefix match).
 * /wp-json is the REST API root — subpaths like /wp-json/wp/v2/posts
 * are data endpoints that should not be blocked.
 */
export const WORDPRESS_BASE_ONLY_PATHS = [
  '/wp-json',
] as const;

// ── Combined list for CMS-agnostic checks ───────────────────────────────────

export const ALL_PROTECTED_PATHS = [
  ...SHOPIFY_PROTECTED_PATHS,
  ...WORDPRESS_PROTECTED_PATHS,
] as const;

/**
 * Returns true if the URL matches any protected route.
 * Uses prefix matching: /account matches /account/addresses.
 * Used by crawler (skip crawling), detector (skip detection), and queue builder (skip queueing).
 */
export function isProtectedRoute(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    // Shopify system paths — prefix match
    if (SHOPIFY_PROTECTED_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return true;

    // WordPress system paths — prefix match
    if (WORDPRESS_PROTECTED_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return true;

    // WordPress base-only paths — exact match, subpaths allowed through
    if (WORDPRESS_BASE_ONLY_PATHS.some((p) => path === p)) return true;

    // WordPress: feed query param variant (/?feed=rss, /?feed=rss2, etc.)
    if (parsed.searchParams.has('feed')) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Filters an array of URLs, removing any that match protected routes.
 * Convenience wrapper for bulk filtering at the crawler and queue builder layers.
 */
export function filterProtectedRoutes(urls: string[]): string[] {
  return urls.filter((url) => !isProtectedRoute(url));
}
