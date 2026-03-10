/**
 * packages/core/src/protected-routes.test.ts
 *
 * Tests for the canonical protected route exclusion list.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isProtectedRoute,
  filterProtectedRoutes,
  SHOPIFY_PROTECTED_PATHS,
  WORDPRESS_PROTECTED_PATHS,
} from './protected-routes.js';

// ── isProtectedRoute — Shopify ──────────────────────────────────────────────

describe('isProtectedRoute — Shopify system paths', () => {
  it('blocks /cart', () => {
    assert.equal(isProtectedRoute('https://mystore.com/cart'), true);
  });

  it('blocks /cart/ subpaths', () => {
    assert.equal(isProtectedRoute('https://mystore.com/cart/change'), true);
  });

  it('blocks /checkout', () => {
    assert.equal(isProtectedRoute('https://mystore.com/checkout'), true);
  });

  it('blocks /account', () => {
    assert.equal(isProtectedRoute('https://mystore.com/account'), true);
  });

  it('blocks /account/addresses', () => {
    assert.equal(isProtectedRoute('https://mystore.com/account/addresses'), true);
  });

  it('blocks /search', () => {
    assert.equal(isProtectedRoute('https://mystore.com/search'), true);
  });

  it('blocks /password', () => {
    assert.equal(isProtectedRoute('https://mystore.com/password'), true);
  });

  it('blocks /challenge', () => {
    assert.equal(isProtectedRoute('https://mystore.com/challenge'), true);
  });

  it('blocks /orders', () => {
    assert.equal(isProtectedRoute('https://mystore.com/orders'), true);
  });

  it('blocks /collections/vendors', () => {
    assert.equal(isProtectedRoute('https://mystore.com/collections/vendors'), true);
  });

  it('blocks /collections/types', () => {
    assert.equal(isProtectedRoute('https://mystore.com/collections/types'), true);
  });

  it('blocks /policies', () => {
    assert.equal(isProtectedRoute('https://mystore.com/policies'), true);
  });

  it('blocks /apps', () => {
    assert.equal(isProtectedRoute('https://mystore.com/apps'), true);
  });

  it('blocks /gift_cards', () => {
    assert.equal(isProtectedRoute('https://mystore.com/gift_cards'), true);
  });

  it('allows /products/hat', () => {
    assert.equal(isProtectedRoute('https://mystore.com/products/hat'), false);
  });

  it('allows /collections/hats (not /collections/vendors or /collections/types)', () => {
    assert.equal(isProtectedRoute('https://mystore.com/collections/hats'), false);
  });

  it('allows /', () => {
    assert.equal(isProtectedRoute('https://mystore.com/'), false);
  });

  it('allows /pages/about', () => {
    assert.equal(isProtectedRoute('https://mystore.com/pages/about'), false);
  });
});

// ── isProtectedRoute — WordPress ────────────────────────────────────────────

describe('isProtectedRoute — WordPress system paths', () => {
  it('blocks /wp-admin', () => {
    assert.equal(isProtectedRoute('https://myblog.com/wp-admin'), true);
  });

  it('blocks /wp-admin/options.php', () => {
    assert.equal(isProtectedRoute('https://myblog.com/wp-admin/options.php'), true);
  });

  it('blocks /wp-login.php', () => {
    assert.equal(isProtectedRoute('https://myblog.com/wp-login.php'), true);
  });

  it('blocks /wp-cron.php', () => {
    assert.equal(isProtectedRoute('https://myblog.com/wp-cron.php'), true);
  });

  it('blocks /xmlrpc.php', () => {
    assert.equal(isProtectedRoute('https://myblog.com/xmlrpc.php'), true);
  });

  it('blocks /feed', () => {
    assert.equal(isProtectedRoute('https://myblog.com/feed'), true);
  });

  it('blocks /wp-json', () => {
    assert.equal(isProtectedRoute('https://myblog.com/wp-json'), true);
  });

  it('blocks /?feed=rss query param', () => {
    assert.equal(isProtectedRoute('https://myblog.com/?feed=rss'), true);
  });

  it('allows /blog/my-post', () => {
    assert.equal(isProtectedRoute('https://myblog.com/blog/my-post'), false);
  });
});

// ── isProtectedRoute — edge cases ───────────────────────────────────────────

describe('isProtectedRoute — edge cases', () => {
  it('returns false for invalid URL', () => {
    assert.equal(isProtectedRoute('not-a-url'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isProtectedRoute(''), false);
  });
});

// ── filterProtectedRoutes ───────────────────────────────────────────────────

describe('filterProtectedRoutes', () => {
  it('removes protected URLs from array', () => {
    const urls = [
      'https://mystore.com/products/hat',
      'https://mystore.com/cart',
      'https://mystore.com/checkout',
      'https://mystore.com/pages/about',
    ];
    const filtered = filterProtectedRoutes(urls);
    assert.deepEqual(filtered, [
      'https://mystore.com/products/hat',
      'https://mystore.com/pages/about',
    ]);
  });

  it('returns empty array when all are protected', () => {
    const urls = ['https://mystore.com/cart', 'https://mystore.com/account'];
    assert.deepEqual(filterProtectedRoutes(urls), []);
  });

  it('returns all when none are protected', () => {
    const urls = ['https://mystore.com/', 'https://mystore.com/products/x'];
    assert.deepEqual(filterProtectedRoutes(urls), urls);
  });
});

// ── exported constants are non-empty ────────────────────────────────────────

describe('protected route constants', () => {
  it('SHOPIFY_PROTECTED_PATHS has entries', () => {
    assert.ok(SHOPIFY_PROTECTED_PATHS.length > 10);
  });

  it('WORDPRESS_PROTECTED_PATHS has entries', () => {
    assert.ok(WORDPRESS_PROTECTED_PATHS.length > 5);
  });
});
