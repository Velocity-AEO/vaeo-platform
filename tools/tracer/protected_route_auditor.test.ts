import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProtectedRoute,
  filterProtectedUrls,
  SHOPIFY_PROTECTED_ROUTES,
  WORDPRESS_PROTECTED_ROUTES,
} from './protected_route_auditor.js';

// ── isProtectedRoute — Shopify ───────────────────────────────────────────────

describe('isProtectedRoute — Shopify', () => {
  it('returns true for /cart', () => {
    assert.equal(isProtectedRoute('https://shop.com/cart', 'shopify'), true);
  });

  it('returns true for /checkout', () => {
    assert.equal(isProtectedRoute('https://shop.com/checkout', 'shopify'), true);
  });

  it('returns true for /account', () => {
    assert.equal(isProtectedRoute('https://shop.com/account', 'shopify'), true);
  });

  it('returns true for /account/login', () => {
    assert.equal(isProtectedRoute('https://shop.com/account/login', 'shopify'), true);
  });

  it('returns true for ?sort_by= on collections', () => {
    assert.equal(isProtectedRoute('https://shop.com/collections/all?sort_by=price', 'shopify'), true);
  });

  it('returns true for ?variant=', () => {
    assert.equal(isProtectedRoute('https://shop.com/products/item?variant=123', 'shopify'), true);
  });

  it('returns true for /search', () => {
    assert.equal(isProtectedRoute('https://shop.com/search', 'shopify'), true);
  });

  it('returns false for normal product page', () => {
    assert.equal(isProtectedRoute('https://shop.com/products/nice-shoes', 'shopify'), false);
  });

  it('returns false for homepage', () => {
    assert.equal(isProtectedRoute('https://shop.com/', 'shopify'), false);
  });
});

// ── isProtectedRoute — WordPress ─────────────────────────────────────────────

describe('isProtectedRoute — WordPress', () => {
  it('returns true for /wp-admin', () => {
    assert.equal(isProtectedRoute('https://wp.com/wp-admin', 'wordpress'), true);
  });

  it('returns true for /wp-login.php', () => {
    assert.equal(isProtectedRoute('https://wp.com/wp-login.php', 'wordpress'), true);
  });

  it('returns true for ?wc-ajax=', () => {
    assert.equal(isProtectedRoute('https://wp.com/?wc-ajax=get_refreshed_fragments', 'wordpress'), true);
  });

  it('returns true for /wp-json/', () => {
    assert.equal(isProtectedRoute('https://wp.com/wp-json/wp/v2/posts', 'wordpress'), true);
  });

  it('returns true for /my-account', () => {
    assert.equal(isProtectedRoute('https://wp.com/my-account', 'wordpress'), true);
  });

  it('returns false for normal page', () => {
    assert.equal(isProtectedRoute('https://wp.com/about-us', 'wordpress'), false);
  });
});

// ── filterProtectedUrls ──────────────────────────────────────────────────────

describe('filterProtectedUrls', () => {
  it('separates allowed and filtered', () => {
    const result = filterProtectedUrls([
      'https://shop.com/products/item',
      'https://shop.com/cart',
      'https://shop.com/pages/about',
      'https://shop.com/checkout',
    ], 'shopify');
    assert.equal(result.allowed.length, 2);
    assert.equal(result.filtered.length, 2);
  });

  it('counts filtered correctly', () => {
    const result = filterProtectedUrls([
      'https://shop.com/cart',
      'https://shop.com/checkout',
      'https://shop.com/account',
    ], 'shopify');
    assert.equal(result.filter_count, 3);
  });

  it('returns empty for empty array', () => {
    const result = filterProtectedUrls([], 'shopify');
    assert.equal(result.allowed.length, 0);
    assert.equal(result.filter_count, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => filterProtectedUrls(null as any, null as any));
  });
});

// ── Route lists ──────────────────────────────────────────────────────────────

describe('SHOPIFY_PROTECTED_ROUTES', () => {
  it('has all required patterns', () => {
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/cart'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/checkout'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/account'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/account/login'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/account/register'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/search'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('/policies/'));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('?variant='));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('?page='));
    assert.ok(SHOPIFY_PROTECTED_ROUTES.includes('?q='));
  });
});

describe('WORDPRESS_PROTECTED_ROUTES', () => {
  it('has all required patterns', () => {
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/wp-admin'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/wp-login.php'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/cart'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/checkout'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/my-account'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/wp-json/'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('?add-to-cart='));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('?wc-ajax='));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/feed/'));
    assert.ok(WORDPRESS_PROTECTED_ROUTES.includes('/xmlrpc.php'));
  });
});
