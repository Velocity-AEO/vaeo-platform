/**
 * tools/schema/schema_validator.test.ts
 *
 * Tests for validateSchema.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema } from './schema_validator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function validProduct(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name:       'Blue Widget',
    description:'A great widget',
    offers:     { '@type': 'Offer', price: 29.99, priceCurrency: 'USD' },
  };
}

function validBreadcrumb(): Record<string, unknown> {
  return {
    '@context':       'https://schema.org',
    '@type':          'BreadcrumbList',
    itemListElement:  [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com' },
    ],
  };
}

function validOrganization(): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme Corp', url: 'https://example.com' };
}

function validWebSite(): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: 'My Site', url: 'https://example.com' };
}

function validWebPage(): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'WebPage', name: 'About', url: 'https://example.com/pages/about' };
}

// ── Basic validation ──────────────────────────────────────────────────────────

describe('validateSchema — valid schemas', () => {
  it('accepts valid Product schema', () => {
    const r = validateSchema(validProduct());
    assert.equal(r.valid, true, r.errors.join(', '));
    assert.deepStrictEqual(r.errors, []);
  });

  it('accepts valid BreadcrumbList schema', () => {
    const r = validateSchema(validBreadcrumb());
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('accepts valid Organization schema', () => {
    const r = validateSchema(validOrganization());
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('accepts valid WebSite schema', () => {
    const r = validateSchema(validWebSite());
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('accepts valid WebPage schema', () => {
    const r = validateSchema(validWebPage());
    assert.equal(r.valid, true, r.errors.join(', '));
  });
});

// ── @context checks ───────────────────────────────────────────────────────────

describe('validateSchema — @context', () => {
  it('rejects missing @context', () => {
    const s = { ...validProduct() };
    delete s['@context'];
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('@context')));
  });

  it('rejects @context !== "https://schema.org"', () => {
    const s = { ...validProduct(), '@context': 'http://schema.org' };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('@context must equal')));
  });

  it('rejects @context = null', () => {
    const s = { ...validProduct(), '@context': null };
    const r = validateSchema(s as unknown as Record<string, unknown>);
    assert.equal(r.valid, false);
  });
});

// ── @type checks ──────────────────────────────────────────────────────────────

describe('validateSchema — @type', () => {
  it('rejects missing @type', () => {
    const s = { ...validProduct() };
    delete s['@type'];
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('@type')));
  });

  it('accepts @type as array of strings', () => {
    const s = { ...validOrganization(), '@type': ['Organization', 'LocalBusiness'] };
    // LocalBusiness needs address — just check no @type error
    const r = validateSchema(s);
    assert.ok(!r.errors.some((e) => e.includes('@type must be')));
  });

  it('rejects @type as number', () => {
    const s = { ...validProduct(), '@type': 42 };
    const r = validateSchema(s as unknown as Record<string, unknown>);
    assert.equal(r.valid, false);
  });
});

// ── Product checks ────────────────────────────────────────────────────────────

describe('validateSchema — Product', () => {
  it('rejects Product missing offers', () => {
    const s = { ...validProduct() };
    delete s['offers'];
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('missing_offers') || e.includes('offers')));
  });

  it('rejects Product with offers missing price', () => {
    const s = { ...validProduct(), offers: { '@type': 'Offer', priceCurrency: 'USD' } };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('price')));
  });

  it('rejects Product with offers missing priceCurrency', () => {
    const s = { ...validProduct(), offers: { '@type': 'Offer', price: 10 } };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('priceCurrency')));
  });

  it('accepts price as string (Shopify format)', () => {
    const s = { ...validProduct(), offers: { '@type': 'Offer', price: '29.99', priceCurrency: 'USD' } };
    const r = validateSchema(s);
    assert.equal(r.valid, true, r.errors.join(', '));
  });
});

// ── BreadcrumbList checks ─────────────────────────────────────────────────────

describe('validateSchema — BreadcrumbList', () => {
  it('rejects BreadcrumbList with empty itemListElement', () => {
    const s = { ...validBreadcrumb(), itemListElement: [] };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('itemListElement')));
  });

  it('rejects BreadcrumbList item missing @type ListItem', () => {
    const s = { ...validBreadcrumb(), itemListElement: [{ position: 1, name: 'Home' }] };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('ListItem')));
  });

  it('rejects BreadcrumbList item with non-number position', () => {
    const s = { ...validBreadcrumb(), itemListElement: [{ '@type': 'ListItem', position: '1', name: 'Home' }] };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('position')));
  });

  it('rejects BreadcrumbList item with missing name', () => {
    const s = { ...validBreadcrumb(), itemListElement: [{ '@type': 'ListItem', position: 1 }] };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('name')));
  });

  it('accepts multi-item BreadcrumbList', () => {
    const s = { ...validBreadcrumb(), itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com' },
      { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://example.com/collections' },
    ]};
    const r = validateSchema(s);
    assert.equal(r.valid, true, r.errors.join(', '));
  });
});

// ── Organization / WebSite / WebPage ─────────────────────────────────────────

describe('validateSchema — Organization / WebSite / WebPage', () => {
  it('rejects Organization missing url', () => {
    const s = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('url')));
  });

  it('rejects WebSite missing name', () => {
    const s = { '@context': 'https://schema.org', '@type': 'WebSite', url: 'https://example.com' };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('name')));
  });

  it('rejects WebPage missing url', () => {
    const s = { '@context': 'https://schema.org', '@type': 'WebPage', name: 'About' };
    const r = validateSchema(s);
    assert.equal(r.valid, false);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('validateSchema — edge cases', () => {
  it('never throws on empty object', () => {
    assert.doesNotThrow(() => validateSchema({}));
    const r = validateSchema({});
    assert.equal(r.valid, false);
  });

  it('returns errors array even for valid schemas', () => {
    const r = validateSchema(validProduct());
    assert.ok(Array.isArray(r.errors));
  });

  it('unknown @type passes without spec-specific errors', () => {
    const s = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'App' };
    // No spec-specific check for SoftwareApplication
    const r = validateSchema(s);
    assert.equal(r.valid, true, r.errors.join(', '));
  });
});
