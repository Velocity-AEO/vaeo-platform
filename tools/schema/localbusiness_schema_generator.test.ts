/**
 * tools/schema/localbusiness_schema_generator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLocalBusinessSchema,
  extractLocalBusinessDataFromHtml,
  LOCALBUSINESS_TYPES,
  type LocalBusinessData,
} from './localbusiness_schema_generator.ts';
import type { LocalBusinessSignals } from '../detect/localbusiness_detect.ts';

const EMPTY_SIGNALS: LocalBusinessSignals = {
  has_localbusiness_schema: false, has_address: false, has_phone: false,
  has_hours: false, has_geo: false, has_price_range: false, has_same_as: false,
  is_local_business_page: false, issues: [],
};

function sigWith(overrides: Partial<LocalBusinessSignals>): LocalBusinessSignals {
  return { ...EMPTY_SIGNALS, ...overrides };
}

describe('LOCALBUSINESS_TYPES', () => {
  it('includes LocalBusiness', () => {
    assert.ok(LOCALBUSINESS_TYPES.includes('LocalBusiness'));
  });

  it('includes all 9 required types', () => {
    const required = [
      'LocalBusiness', 'Store', 'AutoDealer', 'Restaurant',
      'HomeAndConstructionBusiness', 'HealthAndBeautyBusiness',
      'SportsActivityLocation', 'TouristAttraction', 'LodgingBusiness',
    ];
    for (const t of required) {
      assert.ok(LOCALBUSINESS_TYPES.includes(t), `Missing type: ${t}`);
    }
  });
});

describe('generateLocalBusinessSchema', () => {
  it('includes @context = https://schema.org', () => {
    const s = generateLocalBusinessSchema({}, 'https://example.com');
    assert.equal(s['@context'], 'https://schema.org');
  });

  it('defaults @type to LocalBusiness when no type given', () => {
    const s = generateLocalBusinessSchema({}, 'https://example.com');
    assert.equal(s['@type'], 'LocalBusiness');
  });

  it('uses data.type as @type when provided', () => {
    const s = generateLocalBusinessSchema({ type: 'Restaurant' }, 'https://example.com');
    assert.equal(s['@type'], 'Restaurant');
  });

  it('maps name to schema name', () => {
    const s = generateLocalBusinessSchema({ name: 'My Shop' }, 'https://example.com');
    assert.equal(s.name, 'My Shop');
  });

  it('maps phone to telephone', () => {
    const s = generateLocalBusinessSchema({ phone: '555-123-4567' }, 'https://example.com');
    assert.equal(s.telephone, '555-123-4567');
  });

  it('maps website to url (overrides page_url)', () => {
    const s = generateLocalBusinessSchema({ website: 'https://mysite.com' }, 'https://example.com');
    assert.equal(s.url, 'https://mysite.com');
  });

  it('uses page_url as url when no website given', () => {
    const s = generateLocalBusinessSchema({ name: 'Test' }, 'https://example.com/page');
    assert.equal(s.url, 'https://example.com/page');
  });

  it('maps address fields to PostalAddress', () => {
    const data: LocalBusinessData = {
      address_street: '123 Main St',
      address_city: 'Springfield',
      address_state: 'IL',
      address_zip: '62701',
      address_country: 'US',
    };
    const s = generateLocalBusinessSchema(data, 'https://example.com');
    const addr = s.address as Record<string, unknown>;
    assert.equal(addr['@type'], 'PostalAddress');
    assert.equal(addr.streetAddress, '123 Main St');
    assert.equal(addr.addressLocality, 'Springfield');
    assert.equal(addr.addressRegion, 'IL');
    assert.equal(addr.postalCode, '62701');
    assert.equal(addr.addressCountry, 'US');
  });

  it('maps latitude + longitude to GeoCoordinates', () => {
    const s = generateLocalBusinessSchema(
      { latitude: '40.7128', longitude: '-74.0060' },
      'https://example.com',
    );
    const geo = s.geo as Record<string, unknown>;
    assert.equal(geo['@type'], 'GeoCoordinates');
    assert.equal(geo.latitude, '40.7128');
    assert.equal(geo.longitude, '-74.0060');
  });

  it('maps hours to openingHours array', () => {
    const s = generateLocalBusinessSchema(
      { hours: ['Mo-Fr 09:00-17:00', 'Sa 10:00-14:00'] },
      'https://example.com',
    );
    assert.deepEqual(s.openingHours, ['Mo-Fr 09:00-17:00', 'Sa 10:00-14:00']);
  });

  it('maps price_range to priceRange', () => {
    const s = generateLocalBusinessSchema({ price_range: '$$' }, 'https://example.com');
    assert.equal(s.priceRange, '$$');
  });

  it('maps description to description', () => {
    const s = generateLocalBusinessSchema({ description: 'A great place' }, 'https://example.com');
    assert.equal(s.description, 'A great place');
  });

  it('maps image_url to image', () => {
    const s = generateLocalBusinessSchema({ image_url: 'https://cdn.example.com/logo.jpg' }, 'https://example.com');
    assert.equal(s.image, 'https://cdn.example.com/logo.jpg');
  });

  it('maps same_as to sameAs array', () => {
    const s = generateLocalBusinessSchema(
      { same_as: ['https://www.yelp.com/biz/test', 'https://www.facebook.com/test'] },
      'https://example.com',
    );
    assert.deepEqual(s.sameAs, ['https://www.yelp.com/biz/test', 'https://www.facebook.com/test']);
  });

  it('omits address when no address fields given', () => {
    const s = generateLocalBusinessSchema({ name: 'Test' }, 'https://example.com');
    assert.equal(s.address, undefined);
  });

  it('omits geo when only one coordinate given', () => {
    const s = generateLocalBusinessSchema({ latitude: '40.7128' }, 'https://example.com');
    assert.equal(s.geo, undefined);
  });

  it('omits openingHours when hours array is empty', () => {
    const s = generateLocalBusinessSchema({ hours: [] }, 'https://example.com');
    assert.equal(s.openingHours, undefined);
  });

  it('never throws on empty data', () => {
    assert.doesNotThrow(() => generateLocalBusinessSchema({}, ''));
  });
});

describe('extractLocalBusinessDataFromHtml', () => {
  it('seeds name from signals.detected_name', () => {
    const signals = sigWith({ detected_name: 'My Bakery' });
    const d = extractLocalBusinessDataFromHtml('', signals);
    assert.equal(d.name, 'My Bakery');
  });

  it('seeds phone from signals.detected_phone', () => {
    const signals = sigWith({ detected_phone: '555-123-4567' });
    const d = extractLocalBusinessDataFromHtml('', signals);
    assert.equal(d.phone, '555-123-4567');
  });

  it('seeds address fields from signals', () => {
    const signals = sigWith({
      detected_address: '123 Main St',
      detected_city: 'Dallas',
      detected_state: 'TX',
      detected_zip: '75201',
      detected_country: 'US',
    });
    const d = extractLocalBusinessDataFromHtml('', signals);
    assert.equal(d.address_street, '123 Main St');
    assert.equal(d.address_city, 'Dallas');
    assert.equal(d.address_state, 'TX');
    assert.equal(d.address_zip, '75201');
  });

  it('extracts description from og:description meta', () => {
    const html = '<meta property="og:description" content="Best pizza in town"/>';
    const d = extractLocalBusinessDataFromHtml(html, EMPTY_SIGNALS);
    assert.equal(d.description, 'Best pizza in town');
  });

  it('extracts image from og:image meta', () => {
    const html = '<meta property="og:image" content="https://example.com/img.jpg"/>';
    const d = extractLocalBusinessDataFromHtml(html, EMPTY_SIGNALS);
    assert.equal(d.image_url, 'https://example.com/img.jpg');
  });

  it('extracts hours from JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","openingHours":["Mo-Fr 10:00-22:00"]}</script>`;
    const d = extractLocalBusinessDataFromHtml(html, EMPTY_SIGNALS);
    assert.deepEqual(d.hours, ['Mo-Fr 10:00-22:00']);
  });

  it('extracts sameAs from JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","sameAs":["https://www.yelp.com/biz/x"]}</script>`;
    const d = extractLocalBusinessDataFromHtml(html, EMPTY_SIGNALS);
    assert.deepEqual(d.same_as, ['https://www.yelp.com/biz/x']);
  });

  it('never throws on empty html', () => {
    assert.doesNotThrow(() => extractLocalBusinessDataFromHtml('', EMPTY_SIGNALS));
  });
});
