/**
 * tools/detect/resource_hint_detect.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectResourceHints, PRIORITY_DOMAINS } from './resource_hint_detect.ts';

const PAGE_URL = 'https://mystore.myshopify.com/products/shoes';

function page(head: string, body = ''): string {
  return `<html><head>${head}</head><body>${body}</body></html>`;
}

describe('PRIORITY_DOMAINS', () => {
  it('contains all 12 required entries', () => {
    const required = [
      'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.shopify.com',
      'monorail-edge.shopifysvc.com', 'connect.facebook.net',
      'www.googletagmanager.com', 'www.google-analytics.com',
      'static.klaviyo.com', 'fast.fonts.net', 'use.typekit.net',
      'js.hs-scripts.com', 'widget.intercom.io',
    ];
    for (const d of required) {
      assert.ok(d in PRIORITY_DOMAINS, `Missing: ${d}`);
    }
  });
});

describe('detectResourceHints', () => {
  it('returns empty signals for empty html', () => {
    const s = detectResourceHints('', PAGE_URL);
    assert.equal(s.needs_hints, false);
    assert.equal(s.external_domains.length, 0);
  });

  it('detects external domain from script src', () => {
    const s = detectResourceHints(
      page('', '<script src="https://www.googletagmanager.com/gtm.js"></script>'),
      PAGE_URL,
    );
    assert.ok(s.external_domains.includes('www.googletagmanager.com'));
  });

  it('detects external domain from link href', () => {
    const s = detectResourceHints(
      page('<link href="https://fonts.googleapis.com/css2?family=Roboto" rel="stylesheet">'),
      PAGE_URL,
    );
    assert.ok(s.external_domains.includes('fonts.googleapis.com'));
  });

  it('excludes same-origin domains', () => {
    const s = detectResourceHints(
      page('<link href="https://mystore.myshopify.com/assets/app.css" rel="stylesheet">'),
      PAGE_URL,
    );
    assert.ok(!s.external_domains.includes('mystore.myshopify.com'));
  });

  it('detects protocol-relative external URLs (//domain)', () => {
    const s = detectResourceHints(
      page('', '<script src="//cdn.shopify.com/s/files/app.js"></script>'),
      PAGE_URL,
    );
    assert.ok(s.external_domains.includes('cdn.shopify.com'));
  });

  it('detects existing preconnect tags', () => {
    const s = detectResourceHints(
      page('<link rel="preconnect" href="https://fonts.googleapis.com">'),
      PAGE_URL,
    );
    assert.ok(s.has_preconnect.includes('fonts.googleapis.com'));
  });

  it('detects existing dns-prefetch tags', () => {
    const s = detectResourceHints(
      page('<link rel="dns-prefetch" href="//fonts.gstatic.com">'),
      PAGE_URL,
    );
    assert.ok(s.has_dns_prefetch.includes('fonts.gstatic.com'));
  });

  it('flags missing_preconnect for priority domain with no preconnect', () => {
    const s = detectResourceHints(
      page('', '<script src="https://www.googletagmanager.com/gtm.js"></script>'),
      PAGE_URL,
    );
    assert.ok(s.missing_preconnect.includes('www.googletagmanager.com'));
  });

  it('flags missing_dns_prefetch for priority domain with no dns-prefetch', () => {
    const s = detectResourceHints(
      page('', '<script src="https://www.googletagmanager.com/gtm.js"></script>'),
      PAGE_URL,
    );
    assert.ok(s.missing_dns_prefetch.includes('www.googletagmanager.com'));
  });

  it('does NOT flag missing_preconnect when preconnect already exists', () => {
    const html = page(
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link href="https://fonts.googleapis.com/css2" rel="stylesheet">',
    );
    const s = detectResourceHints(html, PAGE_URL);
    assert.ok(!s.missing_preconnect.includes('fonts.googleapis.com'));
  });

  it('does NOT flag missing_dns_prefetch when dns-prefetch already exists', () => {
    const html = page(
      '<link rel="dns-prefetch" href="//fonts.gstatic.com">',
      '<link href="https://fonts.gstatic.com/s/fonts.css" rel="stylesheet">',
    );
    const s = detectResourceHints(html, PAGE_URL);
    assert.ok(!s.missing_dns_prefetch.includes('fonts.gstatic.com'));
  });

  it('sets needs_hints = true when any missing hints exist', () => {
    const s = detectResourceHints(
      page('', '<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>'),
      PAGE_URL,
    );
    assert.equal(s.needs_hints, true);
  });

  it('sets needs_hints = false when no priority domains detected', () => {
    const s = detectResourceHints(
      page('', '<script src="https://some-random-cdn.example.com/app.js"></script>'),
      PAGE_URL,
    );
    assert.equal(s.needs_hints, false);
  });

  it('does not include non-priority external domains in missing lists', () => {
    const s = detectResourceHints(
      page('', '<script src="https://custom-analytics.example.com/track.js"></script>'),
      PAGE_URL,
    );
    assert.ok(!s.missing_preconnect.includes('custom-analytics.example.com'));
    assert.ok(!s.missing_dns_prefetch.includes('custom-analytics.example.com'));
  });

  it('handles multiple priority domains at once', () => {
    const html = page(
      '',
      `<script src="https://www.googletagmanager.com/gtm.js"></script>
       <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
       <link href="https://fonts.googleapis.com/css2" rel="stylesheet">`,
    );
    const s = detectResourceHints(html, PAGE_URL);
    assert.ok(s.missing_preconnect.includes('www.googletagmanager.com'));
    assert.ok(s.missing_preconnect.includes('connect.facebook.net'));
    assert.ok(s.missing_preconnect.includes('fonts.googleapis.com'));
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() =>
      detectResourceHints(null as unknown as string, PAGE_URL),
    );
  });

  it('never throws on malformed URL', () => {
    assert.doesNotThrow(() =>
      detectResourceHints('<script src="https://cdn.shopify.com/app.js"></script>', 'not-a-url'),
    );
  });

  it('deduplicates external domains', () => {
    const html = page(
      '',
      `<script src="https://cdn.shopify.com/a.js"></script>
       <script src="https://cdn.shopify.com/b.js"></script>`,
    );
    const s = detectResourceHints(html, PAGE_URL);
    const count = s.external_domains.filter((d) => d === 'cdn.shopify.com').length;
    assert.equal(count, 1);
  });
});
