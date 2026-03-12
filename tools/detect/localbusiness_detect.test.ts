/**
 * tools/detect/localbusiness_detect.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectLocalBusinessSignals } from './localbusiness_detect.ts';

const BASE_URL = 'https://example.com/contact';

function wrapHtml(body: string, head = ''): string {
  return `<html><head><title>Test Shop</title>${head}</head><body>${body}</body></html>`;
}

function localBusinessSchema(type = 'LocalBusiness', extra = ''): string {
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': type,
    name: 'Test Shop',
    telephone: '555-123-4567',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main St',
      addressLocality: 'Springfield',
      addressRegion: 'IL',
      postalCode: '62701',
      addressCountry: 'US',
    },
    ...JSON.parse(extra || '{}'),
  })}</script>`;
}

describe('detectLocalBusinessSignals', () => {
  it('returns empty/false signals for empty html', () => {
    const s = detectLocalBusinessSignals('', BASE_URL);
    assert.equal(s.has_localbusiness_schema, false);
    assert.equal(s.is_local_business_page, false);
    assert.equal(s.issues.length, 0);
  });

  it('detects LocalBusiness JSON-LD schema', () => {
    const s = detectLocalBusinessSignals(wrapHtml(localBusinessSchema()), BASE_URL);
    assert.equal(s.has_localbusiness_schema, true);
    assert.equal(s.has_phone, true);
    assert.equal(s.has_address, true);
    assert.equal(s.detected_name, 'Test Shop');
  });

  it('detects Restaurant subtype as local business', () => {
    const s = detectLocalBusinessSignals(wrapHtml(localBusinessSchema('Restaurant')), BASE_URL);
    assert.equal(s.has_localbusiness_schema, true);
  });

  it('detects Store subtype as local business', () => {
    const s = detectLocalBusinessSignals(wrapHtml(localBusinessSchema('Store')), BASE_URL);
    assert.equal(s.has_localbusiness_schema, true);
  });

  it('detects AutoDealer subtype as local business', () => {
    const s = detectLocalBusinessSignals(wrapHtml(localBusinessSchema('AutoDealer')), BASE_URL);
    assert.equal(s.has_localbusiness_schema, true);
  });

  it('detects phone in (###) ###-#### format', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>Call us: (555) 123-4567</p>'), BASE_URL);
    assert.equal(s.has_phone, true);
    assert.ok(s.detected_phone?.includes('555'));
  });

  it('detects phone in ###-###-#### format', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>Phone: 555-987-6543</p>'), BASE_URL);
    assert.equal(s.has_phone, true);
  });

  it('sets is_local_business_page when phone detected in text', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>Call (800) 555-0100</p>'), BASE_URL);
    assert.equal(s.is_local_business_page, true);
  });

  it('sets is_local_business_page when street address detected', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>123 Main Street Springfield</p>'), BASE_URL);
    assert.equal(s.is_local_business_page, true);
    assert.equal(s.has_address, true);
  });

  it('sets is_local_business_page when hours text present', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>Business Hours: Mon-Fri 9am-5pm</p>'), BASE_URL);
    assert.equal(s.is_local_business_page, true);
    assert.equal(s.has_hours, true);
  });

  it('detects "hours of operation" keyword', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>Hours of Operation: 9am–5pm daily</p>'), BASE_URL);
    assert.equal(s.has_hours, true);
  });

  it('extracts city and state from City, ST pattern', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<address>Springfield, IL 62701</address>'), BASE_URL);
    assert.equal(s.detected_city, 'Springfield');
    assert.equal(s.detected_state, 'IL');
  });

  it('extracts zip code from page text', () => {
    const s = detectLocalBusinessSignals(wrapHtml('<p>Springfield, IL 62701</p>'), BASE_URL);
    assert.equal(s.detected_zip, '62701');
  });

  it('extracts name from og:site_name meta tag', () => {
    const s = detectLocalBusinessSignals(
      wrapHtml('<p>(555) 111-2222</p>', '<meta property="og:site_name" content="Great Eats Diner"/>'),
      BASE_URL,
    );
    assert.equal(s.detected_name, 'Great Eats Diner');
  });

  it('detects geo when schema has geo field', () => {
    const s = detectLocalBusinessSignals(
      wrapHtml(localBusinessSchema('LocalBusiness', '{"geo":{"@type":"GeoCoordinates","latitude":"40.7","longitude":"-74.0"}}')),
      BASE_URL,
    );
    assert.equal(s.has_geo, true);
  });

  it('detects openingHours array in schema', () => {
    const s = detectLocalBusinessSignals(
      wrapHtml(localBusinessSchema('LocalBusiness', '{"openingHours":["Mo-Fr 09:00-17:00"]}')),
      BASE_URL,
    );
    assert.equal(s.has_hours, true);
  });

  it('detects priceRange in schema', () => {
    const s = detectLocalBusinessSignals(
      wrapHtml(localBusinessSchema('LocalBusiness', '{"priceRange":"$$"}')),
      BASE_URL,
    );
    assert.equal(s.has_price_range, true);
  });

  it('detects sameAs in schema sets has_same_as', () => {
    const s = detectLocalBusinessSignals(
      wrapHtml(localBusinessSchema('LocalBusiness', '{"sameAs":["https://www.yelp.com/biz/test"]}')),
      BASE_URL,
    );
    assert.equal(s.has_same_as, true);
  });

  it('adds MISSING_LOCALBUSINESS_SCHEMA issue when local page has no schema', () => {
    const s = detectLocalBusinessSignals(
      wrapHtml('<p>(555) 123-4567</p><p>123 Oak Avenue Dallas, TX 75201</p>'),
      BASE_URL,
    );
    assert.ok(s.issues.includes('MISSING_LOCALBUSINESS_SCHEMA'));
  });

  it('no MISSING_LOCALBUSINESS_SCHEMA when schema is present', () => {
    const s = detectLocalBusinessSignals(wrapHtml(localBusinessSchema()), BASE_URL);
    assert.ok(!s.issues.includes('MISSING_LOCALBUSINESS_SCHEMA'));
  });

  it('extracts address components from schema PostalAddress', () => {
    const s = detectLocalBusinessSignals(wrapHtml(localBusinessSchema()), BASE_URL);
    assert.equal(s.detected_address, '123 Main St');
    assert.equal(s.detected_city, 'Springfield');
    assert.equal(s.detected_state, 'IL');
    assert.equal(s.detected_zip, '62701');
    assert.equal(s.detected_country, 'US');
  });

  it('never throws on malformed JSON-LD', () => {
    assert.doesNotThrow(() =>
      detectLocalBusinessSignals('<script type="application/ld+json">{bad json}</script>', BASE_URL),
    );
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() =>
      detectLocalBusinessSignals(null as unknown as string, BASE_URL),
    );
  });
});
