/**
 * tools/wordpress/woo_page_detector.ts
 *
 * Detects WooCommerce page types from URLs and post metadata.
 * Identifies protected routes that VAEO must never modify.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type WooPageType =
  | 'product'
  | 'product_category'
  | 'shop'
  | 'cart'
  | 'checkout'
  | 'account'
  | 'order'
  | 'standard_page'
  | 'post'
  | 'unknown';

export interface WooPageMeta {
  url:            string;
  page_type:      WooPageType;
  protected:      boolean;
  post_id?:       number;
  product_id?:    number;
  category_slug?: string;
}

// ── Protected routes ─────────────────────────────────────────────────────────

export const PROTECTED_WOO_ROUTES: string[] = [
  '/cart',
  '/checkout',
  '/my-account',
  '/order-received',
  '/wp-admin',
  '/wp-login.php',
  '/feed',
];

const PROTECTED_QUERY_PARAMS = ['s=', 'add-to-cart=', 'remove_item=', 'undo_item='];

// ── isProtectedRoute ─────────────────────────────────────────────────────────

export function isProtectedRoute(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    for (const route of PROTECTED_WOO_ROUTES) {
      if (lower.includes(route)) return true;
    }
    for (const param of PROTECTED_QUERY_PARAMS) {
      if (lower.includes('?' + param) || lower.includes('&' + param)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── detectWooPageType ────────────────────────────────────────────────────────

export function detectWooPageType(
  url: string,
  post_type?: string,
  post_id?: number,
): WooPageMeta {
  try {
    const lower = url.toLowerCase();
    let page_type: WooPageType = 'unknown';
    let category_slug: string | undefined;
    let product_id: number | undefined;

    // Check post_type first
    if (post_type === 'product') {
      page_type = 'product';
      product_id = post_id;
    } else if (post_type === 'post') {
      page_type = 'post';
    } else if (post_type === 'page') {
      page_type = 'standard_page';
    }

    // URL-based detection (overrides post_type for specific routes)
    // Parse pathname to avoid matching domain (e.g. "shop.com")
    let pathname = lower;
    try { pathname = new URL(lower).pathname; } catch { /* use raw */ }

    if (pathname.startsWith('/cart') || pathname === '/cart') page_type = 'cart';
    else if (pathname.startsWith('/checkout')) page_type = 'checkout';
    else if (pathname.startsWith('/my-account')) page_type = 'account';
    else if (pathname.startsWith('/order-received')) page_type = 'order';
    else if (pathname.startsWith('/product-category/')) {
      page_type = 'product_category';
      const match = url.match(/\/product-category\/([^/?#]+)/i);
      if (match) category_slug = match[1];
    } else if (pathname.startsWith('/product/')) {
      page_type = 'product';
      if (post_id) product_id = post_id;
    } else if (pathname === '/shop' || pathname.startsWith('/shop/')) {
      page_type = 'shop';
    }

    const isProtected = page_type === 'cart'
      || page_type === 'checkout'
      || page_type === 'account'
      || page_type === 'order'
      || isProtectedRoute(url);

    const meta: WooPageMeta = {
      url,
      page_type,
      protected: isProtected,
    };
    if (post_id) meta.post_id = post_id;
    if (product_id) meta.product_id = product_id;
    if (category_slug) meta.category_slug = category_slug;

    return meta;
  } catch {
    return { url, page_type: 'unknown', protected: false };
  }
}

// ── filterCrawlQueue ─────────────────────────────────────────────────────────

export function filterCrawlQueue(
  pages: Array<{ url: string }>,
): Array<{ url: string }> {
  try {
    return pages.filter((p) => !isProtectedRoute(p.url));
  } catch {
    return [];
  }
}
