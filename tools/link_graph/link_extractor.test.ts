/**
 * tools/link_graph/link_extractor.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinksFromHTML,
  mergeExtractionResults,
  countLinksPerPage,
  exceedsLinkLimit,
  LINK_LIMIT_PER_PAGE,
} from './link_extractor.js';

const SITE_DOMAIN = 'example.com';
const PAGE_URL    = 'https://example.com/blog/post';

// ── extractLinksFromHTML ──────────────────────────────────────────────────────

describe('extractLinksFromHTML', () => {
  it('extracts internal links', () => {
    const html = '<html><body><a href="/about">About</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 1);
    assert.equal(result.internal_links[0]!.destination_url, 'https://example.com/about');
  });

  it('extracts external links', () => {
    const html = '<html><body><a href="https://google.com">Google</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.external_links.length, 1);
    assert.equal(result.external_links[0]!.destination_url, 'https://google.com');
  });

  it('resolves relative urls to absolute', () => {
    const html = '<html><body><a href="details.html">Details</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 1);
    assert.ok(result.internal_links[0]!.destination_url.startsWith('https://'));
  });

  it('detects nofollow attribute', () => {
    const html = '<html><body><a href="/page" rel="nofollow">Page</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links[0]!.is_nofollow, true);
  });

  it('detects nofollow in ugc rel', () => {
    const html = '<html><body><a href="/page" rel="ugc nofollow">Page</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links[0]!.is_nofollow, true);
  });

  it('extracts anchor text', () => {
    const html = '<html><body><a href="/about">About Us</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links[0]!.anchor_text, 'About Us');
  });

  it('strips fragment-only links', () => {
    const html = '<html><body><a href="#section">Jump</a><a href="/real">Real</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 1);
    assert.equal(result.internal_links[0]!.destination_url, 'https://example.com/real');
  });

  it('strips mailto links', () => {
    const html = '<html><body><a href="mailto:test@example.com">Email</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 0);
    assert.equal(result.external_links.length, 0);
  });

  it('strips javascript links', () => {
    const html = '<html><body><a href="javascript:void(0)">Click</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 0);
    assert.equal(result.external_links.length, 0);
  });

  it('strips tel links', () => {
    const html = '<html><body><a href="tel:+1234567890">Call</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 0);
    assert.equal(result.external_links.length, 0);
  });

  it('deduplicates source+destination pairs', () => {
    const html = '<html><body><a href="/about">A</a><a href="/about">B</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 1);
  });

  it('sets position_in_page in order', () => {
    const html = '<html><body><a href="/a">A</a><a href="/b">B</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links[0]!.position_in_page, 0);
    assert.equal(result.internal_links[1]!.position_in_page, 1);
  });

  it('sets extraction_source to html_static', () => {
    const html = '<html><body><a href="/about">About</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.extraction_source, 'html_static');
  });

  it('sets destination_domain on external links', () => {
    const html = '<html><body><a href="https://twitter.com/user">Twitter</a></body></html>';
    const result = extractLinksFromHTML(html, PAGE_URL, SITE_DOMAIN);
    assert.equal(result.external_links[0]!.destination_domain, 'twitter.com');
  });

  it('handles empty html gracefully', () => {
    const result = extractLinksFromHTML('', PAGE_URL, SITE_DOMAIN);
    assert.equal(result.internal_links.length, 0);
    assert.equal(result.external_links.length, 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => extractLinksFromHTML(null as any, null as any, null as any));
  });
});

// ── mergeExtractionResults ────────────────────────────────────────────────────

describe('mergeExtractionResults', () => {
  it('combines internal links from both results', () => {
    const html_result = extractLinksFromHTML(
      '<a href="/a">A</a>', PAGE_URL, SITE_DOMAIN,
    );
    const js_result = extractLinksFromHTML(
      '<a href="/b">B</a>', PAGE_URL, SITE_DOMAIN,
    );
    const merged = mergeExtractionResults(html_result, js_result);
    assert.equal(merged.internal_links.length, 2);
  });

  it('marks js-only links as js_rendered', () => {
    const html_result = extractLinksFromHTML(
      '<a href="/a">A</a>', PAGE_URL, SITE_DOMAIN,
    );
    const js_result = extractLinksFromHTML(
      '<a href="/b">B</a>', PAGE_URL, SITE_DOMAIN,
    );
    const merged = mergeExtractionResults(html_result, js_result);
    const jsLink = merged.internal_links.find(l => l.destination_url.includes('/b'));
    assert.equal(jsLink?.link_source, 'js_rendered');
  });

  it('deduplicates links present in both', () => {
    const html_result = extractLinksFromHTML(
      '<a href="/shared">Shared</a>', PAGE_URL, SITE_DOMAIN,
    );
    const js_result = extractLinksFromHTML(
      '<a href="/shared">Shared</a><a href="/jsonly">JS</a>', PAGE_URL, SITE_DOMAIN,
    );
    const merged = mergeExtractionResults(html_result, js_result);
    const sharedLinks = merged.internal_links.filter(l => l.destination_url.includes('/shared'));
    assert.equal(sharedLinks.length, 1);
  });

  it('prefers html_static for links in both results', () => {
    const html_result = extractLinksFromHTML(
      '<a href="/shared">Shared</a>', PAGE_URL, SITE_DOMAIN,
    );
    const js_result = extractLinksFromHTML(
      '<a href="/shared">Shared</a>', PAGE_URL, SITE_DOMAIN,
    );
    const merged = mergeExtractionResults(html_result, js_result);
    const link = merged.internal_links.find(l => l.destination_url.includes('/shared'));
    assert.equal(link?.link_source, 'html_static');
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => mergeExtractionResults(null as any, null as any));
  });
});

// ── countLinksPerPage ─────────────────────────────────────────────────────────

describe('countLinksPerPage', () => {
  it('returns total of internal + external', () => {
    const internal = [{ source_url: 'x', destination_url: '/a' } as any];
    const external = [{ source_url: 'x', destination_url: 'https://g.com' } as any,
                      { source_url: 'x', destination_url: 'https://b.com' } as any];
    assert.equal(countLinksPerPage(internal, external), 3);
  });

  it('handles empty arrays', () => {
    assert.equal(countLinksPerPage([], []), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => countLinksPerPage(null as any, null as any));
  });
});

// ── exceedsLinkLimit ──────────────────────────────────────────────────────────

describe('exceedsLinkLimit', () => {
  it('returns true above 100', () => {
    assert.equal(exceedsLinkLimit(101), true);
  });

  it('returns false at exactly 100', () => {
    assert.equal(exceedsLinkLimit(100), false);
  });

  it('returns false below 100', () => {
    assert.equal(exceedsLinkLimit(50), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => exceedsLinkLimit(null as any));
  });
});

// ── LINK_LIMIT_PER_PAGE ───────────────────────────────────────────────────────

describe('LINK_LIMIT_PER_PAGE', () => {
  it('equals 100', () => {
    assert.equal(LINK_LIMIT_PER_PAGE, 100);
  });
});
