/**
 * tools/wordpress/woo_page_detector.test.ts
 *
 * Tests for WooCommerce page type detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectWooPageType,
  isProtectedRoute,
  filterCrawlQueue,
  PROTECTED_WOO_ROUTES,
} from './woo_page_detector.js';

// ── detectWooPageType ────────────────────────────────────────────────────────

describe('detectWooPageType — product pages', () => {
  it('identifies product page from URL', () => {
    const m = detectWooPageType('https://shop.com/product/blue-widget');
    assert.equal(m.page_type, 'product');
  });

  it('identifies product from post_type', () => {
    const m = detectWooPageType('https://shop.com/some-page', 'product', 42);
    assert.equal(m.page_type, 'product');
    assert.equal(m.product_id, 42);
  });
});

describe('detectWooPageType — shop page', () => {
  it('identifies /shop as shop', () => {
    const m = detectWooPageType('https://shop.com/shop');
    assert.equal(m.page_type, 'shop');
  });

  it('identifies /shop/ subpath as shop', () => {
    const m = detectWooPageType('https://shop.com/shop/page/2');
    assert.equal(m.page_type, 'shop');
  });
});

describe('detectWooPageType — category pages', () => {
  it('identifies product-category page', () => {
    const m = detectWooPageType('https://shop.com/product-category/clothing');
    assert.equal(m.page_type, 'product_category');
    assert.equal(m.category_slug, 'clothing');
  });
});

describe('detectWooPageType — protected pages', () => {
  it('marks cart as protected', () => {
    const m = detectWooPageType('https://shop.com/cart');
    assert.equal(m.page_type, 'cart');
    assert.equal(m.protected, true);
  });

  it('marks checkout as protected', () => {
    const m = detectWooPageType('https://shop.com/checkout');
    assert.equal(m.page_type, 'checkout');
    assert.equal(m.protected, true);
  });

  it('marks my-account as protected', () => {
    const m = detectWooPageType('https://shop.com/my-account');
    assert.equal(m.page_type, 'account');
    assert.equal(m.protected, true);
  });

  it('marks order-received as protected', () => {
    const m = detectWooPageType('https://shop.com/order-received');
    assert.equal(m.page_type, 'order');
    assert.equal(m.protected, true);
  });

  it('does not mark product as protected', () => {
    const m = detectWooPageType('https://shop.com/product/widget');
    assert.equal(m.protected, false);
  });
});

describe('detectWooPageType — post types', () => {
  it('identifies post from post_type', () => {
    const m = detectWooPageType('https://shop.com/blog/hello', 'post');
    assert.equal(m.page_type, 'post');
  });

  it('identifies standard page from post_type', () => {
    const m = detectWooPageType('https://shop.com/about', 'page');
    assert.equal(m.page_type, 'standard_page');
  });

  it('returns unknown for unrecognized URL', () => {
    const m = detectWooPageType('https://shop.com/random-path');
    assert.equal(m.page_type, 'unknown');
  });
});

// ── isProtectedRoute ─────────────────────────────────────────────────────────

describe('isProtectedRoute', () => {
  it('returns true for /cart', () => {
    assert.equal(isProtectedRoute('https://shop.com/cart'), true);
  });

  it('returns true for /wp-admin', () => {
    assert.equal(isProtectedRoute('https://shop.com/wp-admin/edit.php'), true);
  });

  it('returns true for query param ?s=', () => {
    assert.equal(isProtectedRoute('https://shop.com/?s=search+term'), true);
  });

  it('returns true for ?add-to-cart=', () => {
    assert.equal(isProtectedRoute('https://shop.com/product/widget?add-to-cart=42'), true);
  });

  it('returns false for regular product page', () => {
    assert.equal(isProtectedRoute('https://shop.com/product/widget'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isProtectedRoute(''), false);
  });
});

// ── PROTECTED_WOO_ROUTES ─────────────────────────────────────────────────────

describe('PROTECTED_WOO_ROUTES', () => {
  it('includes required routes', () => {
    assert.ok(PROTECTED_WOO_ROUTES.includes('/cart'));
    assert.ok(PROTECTED_WOO_ROUTES.includes('/checkout'));
    assert.ok(PROTECTED_WOO_ROUTES.includes('/my-account'));
    assert.ok(PROTECTED_WOO_ROUTES.includes('/wp-admin'));
    assert.ok(PROTECTED_WOO_ROUTES.includes('/feed'));
  });
});

// ── filterCrawlQueue ─────────────────────────────────────────────────────────

describe('filterCrawlQueue', () => {
  it('removes protected routes', () => {
    const pages = [
      { url: 'https://shop.com/product/a' },
      { url: 'https://shop.com/cart' },
      { url: 'https://shop.com/product/b' },
      { url: 'https://shop.com/checkout' },
    ];
    const result = filterCrawlQueue(pages);
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => !p.url.includes('/cart') && !p.url.includes('/checkout')));
  });

  it('preserves valid pages', () => {
    const pages = [
      { url: 'https://shop.com/product/a' },
      { url: 'https://shop.com/about' },
    ];
    assert.equal(filterCrawlQueue(pages).length, 2);
  });

  it('handles empty input', () => {
    assert.deepEqual(filterCrawlQueue([]), []);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('woo_page_detector — never throws', () => {
  it('detectWooPageType with empty URL', () => {
    const m = detectWooPageType('');
    assert.ok(m);
  });

  it('isProtectedRoute with empty string', () => {
    assert.equal(isProtectedRoute(''), false);
  });
});
