/**
 * tools/tracer/protected_route_auditor.ts
 *
 * Protected route exclusion lists and URL filtering for Shopify and WordPress.
 * Never throws.
 */

// ── Shopify protected routes ─────────────────────────────────────────────────

export const SHOPIFY_PROTECTED_ROUTES: string[] = [
  '/cart',
  '/checkout',
  '/account',
  '/account/login',
  '/account/register',
  '/account/orders',
  '/search',
  '/policies/',
  '/collections/*?sort_by=',
  '/collections/*?filter.',
  '?variant=',
  '?page=',
  '?q=',
];

// ── WordPress protected routes ───────────────────────────────────────────────

export const WORDPRESS_PROTECTED_ROUTES: string[] = [
  '/wp-admin',
  '/wp-login.php',
  '/cart',
  '/checkout',
  '/my-account',
  '/wp-json/',
  '?add-to-cart=',
  '?wc-ajax=',
  '/feed/',
  '/xmlrpc.php',
];

// ── isProtectedRoute ─────────────────────────────────────────────────────────

export function isProtectedRoute(
  url: string,
  platform: 'shopify' | 'wordpress',
): boolean {
  try {
    if (!url) return false;

    const routes = platform === 'wordpress'
      ? WORDPRESS_PROTECTED_ROUTES
      : SHOPIFY_PROTECTED_ROUTES;

    const parsed = new URL(url, 'https://placeholder.com');
    const pathname = parsed.pathname;
    const fullUrl = pathname + parsed.search;

    for (const pattern of routes) {
      // Query-string-only patterns like ?variant=
      if (pattern.startsWith('?')) {
        if (parsed.search.includes(pattern.slice(1))) return true;
        continue;
      }

      // Wildcard patterns like /collections/*?sort_by=
      if (pattern.includes('*')) {
        const [pathPart, queryPart] = pattern.split('*');
        if (pathname.startsWith(pathPart) && queryPart) {
          const qKey = queryPart.startsWith('?') ? queryPart.slice(1) : queryPart;
          if (parsed.search.includes(qKey)) return true;
        }
        continue;
      }

      // Exact path match or prefix match
      if (pathname === pattern || pathname.startsWith(pattern)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ── filterProtectedUrls ─────────────────────────────────────────────────────

export function filterProtectedUrls(
  urls: string[],
  platform: 'shopify' | 'wordpress',
): { allowed: string[]; filtered: string[]; filter_count: number } {
  try {
    const safeUrls = urls ?? [];
    const allowed: string[] = [];
    const filtered: string[] = [];

    for (const url of safeUrls) {
      if (isProtectedRoute(url, platform)) {
        filtered.push(url);
      } else {
        allowed.push(url);
      }
    }

    return { allowed, filtered, filter_count: filtered.length };
  } catch {
    return { allowed: [], filtered: [], filter_count: 0 };
  }
}
