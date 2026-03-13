/**
 * tools/link_graph/link_type_classifier.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLinkType,
  isPaginationUrl,
  extractPaginationRoot,
  groupPaginationUrls,
  NAVIGATION_SELECTORS,
  FOOTER_SELECTORS,
  SIDEBAR_SELECTORS,
  BREADCRUMB_SELECTORS,
} from './link_type_classifier.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function anchor(selector_matches: string[], href = 'https://example.com/about') {
  return {
    href,
    selector_matches,
    parent_selectors: selector_matches,
    position_in_page: 0,
    total_page_links: 10,
  };
}

// ── classifyLinkType ──────────────────────────────────────────────────────────

describe('classifyLinkType', () => {
  it('returns navigation for nav selector match', () => {
    const result = classifyLinkType(anchor(['nav']), 'https://example.com/about');
    assert.equal(result, 'navigation');
  });

  it('returns navigation for header selector match', () => {
    const result = classifyLinkType(anchor(['header']), 'https://example.com/about');
    assert.equal(result, 'navigation');
  });

  it('returns navigation for .primary-menu class', () => {
    const result = classifyLinkType(anchor(['.primary-menu']), 'https://example.com/about');
    assert.equal(result, 'navigation');
  });

  it('returns footer for footer selector match', () => {
    const result = classifyLinkType(anchor(['footer']), 'https://example.com/terms');
    assert.equal(result, 'footer');
  });

  it('returns footer for .site-footer class', () => {
    const result = classifyLinkType(anchor(['.site-footer']), 'https://example.com/privacy');
    assert.equal(result, 'footer');
  });

  it('returns breadcrumb for .breadcrumb selector match', () => {
    const result = classifyLinkType(anchor(['.breadcrumb']), 'https://example.com/category');
    assert.equal(result, 'breadcrumb');
  });

  it('returns breadcrumb for .breadcrumbs selector match', () => {
    const result = classifyLinkType(anchor(['.breadcrumbs']), 'https://example.com/cat');
    assert.equal(result, 'breadcrumb');
  });

  it('returns sidebar for aside selector match', () => {
    const result = classifyLinkType(anchor(['aside']), 'https://example.com/post');
    assert.equal(result, 'sidebar');
  });

  it('returns sidebar for .sidebar class', () => {
    const result = classifyLinkType(anchor(['.sidebar']), 'https://example.com/post');
    assert.equal(result, 'sidebar');
  });

  it('returns pagination for ?page= pattern in href', () => {
    const result = classifyLinkType(
      anchor([], 'https://example.com/blog?page=2'),
      'https://example.com/blog?page=2',
    );
    assert.equal(result, 'pagination');
  });

  it('returns pagination for /page/ pattern in href', () => {
    const result = classifyLinkType(
      anchor([], 'https://example.com/blog/page/2'),
      'https://example.com/blog/page/2',
    );
    assert.equal(result, 'pagination');
  });

  it('returns body_content by default for normal link', () => {
    const result = classifyLinkType(anchor([]), 'https://example.com/contact');
    assert.equal(result, 'body_content');
  });

  it('breadcrumb takes priority over navigation', () => {
    const result = classifyLinkType(
      anchor(['nav', '.breadcrumb']),
      'https://example.com/category',
    );
    assert.equal(result, 'breadcrumb');
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => classifyLinkType(null as any, null as any));
  });

  it('returns unknown on error', () => {
    // Passing garbage that will cause an error
    const result = classifyLinkType(null as any, null as any);
    assert.ok(['unknown', 'body_content'].includes(result));
  });
});

// ── isPaginationUrl ───────────────────────────────────────────────────────────

describe('isPaginationUrl', () => {
  it('returns true for ?page= pattern', () => {
    assert.equal(isPaginationUrl('https://example.com/blog?page=2'), true);
  });

  it('returns true for /page/ pattern', () => {
    assert.equal(isPaginationUrl('https://example.com/blog/page/2'), true);
  });

  it('returns true for ?paged= pattern', () => {
    assert.equal(isPaginationUrl('https://example.com/?paged=3'), true);
  });

  it('returns true for ?start= pattern', () => {
    assert.equal(isPaginationUrl('https://example.com/products?start=20'), true);
  });

  it('returns true for ?offset= pattern', () => {
    assert.equal(isPaginationUrl('https://example.com/items?offset=10'), true);
  });

  it('returns false for normal url', () => {
    assert.equal(isPaginationUrl('https://example.com/about'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isPaginationUrl(''), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isPaginationUrl(null as any));
  });
});

// ── extractPaginationRoot ─────────────────────────────────────────────────────

describe('extractPaginationRoot', () => {
  it('strips ?page= query param', () => {
    const result = extractPaginationRoot('https://example.com/blog?page=2');
    assert.ok(!result.includes('page='), `Expected no page= in ${result}`);
  });

  it('strips /page/N path segment', () => {
    const result = extractPaginationRoot('https://example.com/blog/page/3/');
    assert.ok(!result.includes('/page/'), `Expected no /page/ in ${result}`);
  });

  it('strips ?paged= query param', () => {
    const result = extractPaginationRoot('https://example.com/?paged=2');
    assert.ok(!result.includes('paged='), `Expected no paged= in ${result}`);
  });

  it('returns same URL for non-paginated url', () => {
    const url = 'https://example.com/about';
    assert.equal(extractPaginationRoot(url), url);
  });

  it('never throws on empty string', () => {
    assert.doesNotThrow(() => extractPaginationRoot(''));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => extractPaginationRoot(null as any));
  });
});

// ── groupPaginationUrls ───────────────────────────────────────────────────────

describe('groupPaginationUrls', () => {
  it('groups paginated urls by root', () => {
    const urls = [
      'https://example.com/blog?page=2',
      'https://example.com/blog?page=3',
      'https://example.com/about',
    ];
    const groups = groupPaginationUrls(urls);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.paginated_urls.length, 2);
  });

  it('handles multiple roots', () => {
    const urls = [
      'https://example.com/blog?page=2',
      'https://example.com/shop?page=2',
    ];
    const groups = groupPaginationUrls(urls);
    assert.equal(groups.length, 2);
  });

  it('excludes non-pagination urls', () => {
    const urls = ['https://example.com/about', 'https://example.com/contact'];
    const groups = groupPaginationUrls(urls);
    assert.equal(groups.length, 0);
  });

  it('handles empty array', () => {
    assert.deepEqual(groupPaginationUrls([]), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => groupPaginationUrls(null as any));
  });
});

// ── Selector arrays ───────────────────────────────────────────────────────────

describe('selector constants', () => {
  it('NAVIGATION_SELECTORS is non-empty array', () => {
    assert.ok(Array.isArray(NAVIGATION_SELECTORS) && NAVIGATION_SELECTORS.length > 0);
  });

  it('FOOTER_SELECTORS is non-empty array', () => {
    assert.ok(Array.isArray(FOOTER_SELECTORS) && FOOTER_SELECTORS.length > 0);
  });

  it('SIDEBAR_SELECTORS is non-empty array', () => {
    assert.ok(Array.isArray(SIDEBAR_SELECTORS) && SIDEBAR_SELECTORS.length > 0);
  });

  it('BREADCRUMB_SELECTORS is non-empty array', () => {
    assert.ok(Array.isArray(BREADCRUMB_SELECTORS) && BREADCRUMB_SELECTORS.length > 0);
  });
});
