/**
 * tools/reports/localbusiness_report.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalBusinessSiteReport } from './localbusiness_report.ts';

// ── Sample HTML fixtures ──────────────────────────────────────────────────────

const LOCAL_PAGE_WITH_SCHEMA = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Test Shop","telephone":"555-123-4567","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75201"},"openingHours":["Mo-Fr 09:00-17:00"],"geo":{"@type":"GeoCoordinates","latitude":"32.78","longitude":"-96.80"},"sameAs":["https://www.yelp.com/biz/test"],"priceRange":"$$"}</script>
</head><body><p>Welcome to Test Shop</p></body></html>`;

const LOCAL_PAGE_NO_SCHEMA = `<html><head><title>Contact Us</title></head>
<body>
<p>Call us at (555) 987-6543</p>
<address>456 Oak Avenue Dallas, TX 75201</address>
<p>Business Hours: Mon-Fri 9am-5pm</p>
</body></html>`;

const NON_LOCAL_PAGE = `<html><head><title>Blog Post</title></head>
<body><article><h1>SEO Tips</h1><p>Here are some tips...</p></article></body></html>`;

const NAP_INCONSISTENT_PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"My Store","telephone":"555-111-0000","address":{"@type":"PostalAddress","streetAddress":"789 Pine Rd","addressLocality":"Austin","addressRegion":"TX","postalCode":"78701"}}</script>
</head><body>
<p>Call us at (555) 999-8888 for help.</p>
</body></html>`;

describe('buildLocalBusinessSiteReport', () => {
  it('returns empty report for empty pages array', () => {
    const report = buildLocalBusinessSiteReport('site-001', []);
    assert.equal(report.site_id, 'site-001');
    assert.equal(report.total_local_pages, 0);
    assert.equal(report.pages_with_schema, 0);
    assert.equal(report.schema_coverage_pct, 0);
    assert.equal(report.nap_consistent, true);
    assert.equal(report.pages.length, 0);
  });

  it('counts local pages correctly (excludes non-local)', () => {
    const pages = [
      { url: 'https://example.com/contact', html: LOCAL_PAGE_NO_SCHEMA },
      { url: 'https://example.com/blog', html: NON_LOCAL_PAGE },
    ];
    const report = buildLocalBusinessSiteReport('site-002', pages);
    assert.equal(report.total_local_pages, 1);
    assert.equal(report.pages.length, 2);
  });

  it('counts pages_with_schema correctly', () => {
    const pages = [
      { url: 'https://example.com/home', html: LOCAL_PAGE_WITH_SCHEMA },
      { url: 'https://example.com/contact', html: LOCAL_PAGE_NO_SCHEMA },
    ];
    const report = buildLocalBusinessSiteReport('site-003', pages);
    assert.equal(report.pages_with_schema, 1);
    assert.equal(report.pages_missing_schema, 1);
  });

  it('calculates schema_coverage_pct correctly', () => {
    const pages = [
      { url: 'https://example.com/a', html: LOCAL_PAGE_WITH_SCHEMA },
      { url: 'https://example.com/b', html: LOCAL_PAGE_NO_SCHEMA },
    ];
    const report = buildLocalBusinessSiteReport('site-004', pages);
    assert.equal(report.schema_coverage_pct, 50);
  });

  it('schema_coverage_pct is 100 when all local pages have schema', () => {
    const pages = [
      { url: 'https://example.com/a', html: LOCAL_PAGE_WITH_SCHEMA },
      { url: 'https://example.com/b', html: LOCAL_PAGE_WITH_SCHEMA },
    ];
    const report = buildLocalBusinessSiteReport('site-005', pages);
    assert.equal(report.schema_coverage_pct, 100);
  });

  it('nap_consistent is true when no NAP issues found', () => {
    const pages = [{ url: 'https://example.com/', html: LOCAL_PAGE_WITH_SCHEMA }];
    const report = buildLocalBusinessSiteReport('site-006', pages);
    assert.equal(report.nap_consistent, true);
  });

  it('nap_consistent is false when NAP inconsistency detected', () => {
    const pages = [
      { url: 'https://example.com/contact', html: NAP_INCONSISTENT_PAGE },
    ];
    const report = buildLocalBusinessSiteReport('site-007', pages);
    assert.equal(report.nap_consistent, false);
  });

  it('top_issues limited to 5 entries', () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      url:  `https://example.com/${i}`,
      html: LOCAL_PAGE_NO_SCHEMA,
    }));
    const report = buildLocalBusinessSiteReport('site-008', pages);
    assert.ok(report.top_issues.length <= 5);
  });

  it('top_issues sorted by count descending', () => {
    const pages = [
      { url: 'https://example.com/a', html: LOCAL_PAGE_NO_SCHEMA },
      { url: 'https://example.com/b', html: LOCAL_PAGE_NO_SCHEMA },
    ];
    const report = buildLocalBusinessSiteReport('site-009', pages);
    for (let i = 1; i < report.top_issues.length; i++) {
      assert.ok(report.top_issues[i - 1]!.count >= report.top_issues[i]!.count);
    }
  });

  it('LocalBusinessPageReport has correct fields', () => {
    const pages = [{ url: 'https://example.com/', html: LOCAL_PAGE_WITH_SCHEMA }];
    const report = buildLocalBusinessSiteReport('site-010', pages);
    const page   = report.pages[0]!;
    assert.ok('url'                      in page);
    assert.ok('is_local_business_page'   in page);
    assert.ok('has_localbusiness_schema' in page);
    assert.ok('issues'                   in page);
    assert.ok('local_data'               in page);
    assert.ok('schema_generated'         in page);
    assert.equal(page.schema_generated, false);
  });

  it('extracts local_data for local pages', () => {
    const pages = [{ url: 'https://example.com/', html: LOCAL_PAGE_WITH_SCHEMA }];
    const report = buildLocalBusinessSiteReport('site-011', pages);
    const page   = report.pages[0]!;
    assert.ok(page.local_data.name === 'Test Shop');
  });

  it('never throws on malformed html', () => {
    const pages = [
      { url: 'https://example.com/a', html: '<html><script type="application/ld+json">{bad}</script></html>' },
      { url: 'https://example.com/b', html: null as unknown as string },
    ];
    assert.doesNotThrow(() => buildLocalBusinessSiteReport('site-012', pages));
  });
});
