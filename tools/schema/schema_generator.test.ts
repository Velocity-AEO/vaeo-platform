/**
 * tools/schema/schema_generator.test.ts
 *
 * Tests for schema generator functions.
 * All outputs are checked against validateSchema.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateProductSchema,
  generateCollectionSchema,
  generatePageSchema,
  generateArticleSchema,
  generateOrganizationSchema,
  type ShopifyProduct,
  type ShopifyCollection,
  type ShopifyPage,
  type ShopifyArticle,
  type ShopifyShop,
} from './schema_generator.js';

import { validateSchema } from './schema_validator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id:       '123',
    title:    'Blue Widget',
    body_html:'<p>A great product</p>',
    image:    { src: 'https://cdn.shopify.com/widget.jpg' },
    variants: [{ price: '29.99' }],
    vendor:   'Acme',
    ...overrides,
  };
}

function makeCollection(overrides: Partial<ShopifyCollection> = {}): ShopifyCollection {
  return { id: '456', title: 'Summer Collection', handle: 'summer', ...overrides };
}

function makePage(overrides: Partial<ShopifyPage> = {}): ShopifyPage {
  return { id: '789', title: 'About Us', handle: 'about', ...overrides };
}

function makeShop(overrides: Partial<ShopifyShop> = {}): ShopifyShop {
  return { name: 'Coco Cabana', domain: 'cococabanalife.com', email: 'hello@coco.com', ...overrides };
}

function makeArticle(overrides: Partial<ShopifyArticle> = {}): ShopifyArticle {
  return {
    id:           '55',
    title:        'Top 7 Pool Floats for Summer',
    handle:       'top-7-pool-floats',
    published_at: '2024-06-01T10:00:00Z',
    blog_handle:  'news',
    blog_title:   'Coco Cabana Blog',
    ...overrides,
  };
}

// ── generateProductSchema ─────────────────────────────────────────────────────

describe('generateProductSchema', () => {
  it('produces valid schema (passes validateSchema)', () => {
    const schema = generateProductSchema(makeProduct());
    const r = validateSchema(schema);
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('has @context and @type=Product', () => {
    const s = generateProductSchema(makeProduct());
    assert.equal(s['@context'], 'https://schema.org');
    assert.equal(s['@type'], 'Product');
  });

  it('includes name and description', () => {
    const s = generateProductSchema(makeProduct());
    assert.equal(s['name'], 'Blue Widget');
    assert.ok(typeof s['description'] === 'string');
  });

  it('includes offers with price and priceCurrency', () => {
    const s = generateProductSchema(makeProduct());
    const offers = s['offers'] as Record<string, unknown>;
    assert.equal(offers['price'], '29.99');
    assert.equal(offers['priceCurrency'], 'USD');
  });

  it('strips HTML from body_html for description', () => {
    const s = generateProductSchema(makeProduct({ body_html: '<p>Hello <b>world</b></p>' }));
    const desc = s['description'] as string;
    assert.ok(!desc.includes('<p>'));
    assert.ok(desc.includes('Hello'));
  });

  it('omits image when not provided', () => {
    const s = generateProductSchema(makeProduct({ image: undefined }));
    assert.ok(!('image' in s) || s['image'] == null);
  });

  it('uses "0" price when no variants', () => {
    const s = generateProductSchema(makeProduct({ variants: undefined }));
    const offers = s['offers'] as Record<string, unknown>;
    assert.equal(offers['price'], '0');
  });

  it('works without shopUrl', () => {
    assert.doesNotThrow(() => generateProductSchema(makeProduct()));
  });

  it('includes product url when shopUrl provided', () => {
    const s = generateProductSchema(makeProduct(), 'https://example.com');
    const offers = s['offers'] as Record<string, unknown>;
    assert.ok(String(offers['url']).includes('/products/'));
  });
});

// ── generateCollectionSchema ──────────────────────────────────────────────────

describe('generateCollectionSchema', () => {
  it('produces valid schema (passes validateSchema)', () => {
    const schema = generateCollectionSchema(makeCollection(), 'https://example.com');
    const r = validateSchema(schema);
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('has @type=BreadcrumbList', () => {
    const s = generateCollectionSchema(makeCollection());
    assert.equal(s['@type'], 'BreadcrumbList');
  });

  it('has itemListElement as array', () => {
    const s = generateCollectionSchema(makeCollection());
    assert.ok(Array.isArray(s['itemListElement']));
    assert.ok((s['itemListElement'] as unknown[]).length >= 1);
  });

  it('first item has correct @type ListItem and position 1', () => {
    const s = generateCollectionSchema(makeCollection());
    const items = s['itemListElement'] as Record<string, unknown>[];
    assert.equal(items[0]!['@type'], 'ListItem');
    assert.equal(items[0]!['position'], 1);
  });

  it('uses collection title as item name', () => {
    const s = generateCollectionSchema(makeCollection({ title: 'Outdoor Furniture' }));
    const items = s['itemListElement'] as Record<string, unknown>[];
    assert.equal(items[0]!['name'], 'Outdoor Furniture');
  });
});

// ── generatePageSchema ────────────────────────────────────────────────────────

describe('generatePageSchema', () => {
  it('produces valid schema (passes validateSchema)', () => {
    const schema = generatePageSchema(makePage(), 'https://example.com');
    const r = validateSchema(schema);
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('has @type=WebPage', () => {
    const s = generatePageSchema(makePage(), 'https://example.com');
    assert.equal(s['@type'], 'WebPage');
  });

  it('includes name and url', () => {
    const s = generatePageSchema(makePage(), 'https://example.com');
    assert.equal(s['name'], 'About Us');
    assert.ok(String(s['url']).includes('/pages/about'));
  });
});

// ── generateArticleSchema ─────────────────────────────────────────────────────

describe('generateArticleSchema', () => {
  it('produces valid schema (passes validateSchema)', () => {
    const schema = generateArticleSchema(makeArticle(), 'https://example.com');
    const r = validateSchema(schema);
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('has @context and @type=Article', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com');
    assert.equal(s['@context'], 'https://schema.org');
    assert.equal(s['@type'], 'Article');
  });

  it('headline equals article title', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com');
    assert.equal(s['headline'], 'Top 7 Pool Floats for Summer');
  });

  it('url constructed from blog_handle + handle when url not provided', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com');
    assert.equal(s['url'], 'https://example.com/blogs/news/top-7-pool-floats');
  });

  it('uses provided url directly when given', () => {
    const s = generateArticleSchema(
      makeArticle({ url: 'https://custom.com/blogs/news/top-7-pool-floats' }),
      'https://example.com',
    );
    assert.equal(s['url'], 'https://custom.com/blogs/news/top-7-pool-floats');
  });

  it('datePublished uses published_at (date only)', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com');
    assert.equal(s['datePublished'], '2024-06-01');
  });

  it('datePublished falls back to today when published_at absent', () => {
    const s = generateArticleSchema(makeArticle({ published_at: undefined }), 'https://example.com');
    const today = new Date().toISOString().split('T')[0]!;
    assert.equal(s['datePublished'], today);
  });

  it('author is Organization with shopName when provided', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com', 'Coco Cabana');
    const author = s['author'] as Record<string, unknown>;
    assert.equal(author['@type'], 'Organization');
    assert.equal(author['name'], 'Coco Cabana');
  });

  it('author falls back to blog_title when shopName not provided', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com');
    const author = s['author'] as Record<string, unknown>;
    assert.equal(author['name'], 'Coco Cabana Blog');
  });

  it('publisher matches author', () => {
    const s = generateArticleSchema(makeArticle(), 'https://example.com', 'Coco Cabana');
    const publisher = s['publisher'] as Record<string, unknown>;
    assert.equal(publisher['@type'], 'Organization');
    assert.equal(publisher['name'], 'Coco Cabana');
  });

  it('never throws on minimal input', () => {
    assert.doesNotThrow(() =>
      generateArticleSchema({ id: '1', title: 'T', handle: 'h' }, 'https://x.com'),
    );
  });

  it('produces valid schema without optional fields', () => {
    const schema = generateArticleSchema(
      { id: '1', title: 'Minimal Article', handle: 'minimal' },
      'https://example.com',
    );
    const r = validateSchema(schema);
    assert.equal(r.valid, true, r.errors.join(', '));
  });
});

// ── generateOrganizationSchema ────────────────────────────────────────────────

describe('generateOrganizationSchema', () => {
  it('produces valid schema (passes validateSchema)', () => {
    const schema = generateOrganizationSchema(makeShop());
    const r = validateSchema(schema);
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('has @type=Organization', () => {
    const s = generateOrganizationSchema(makeShop());
    assert.equal(s['@type'], 'Organization');
  });

  it('includes name and url', () => {
    const s = generateOrganizationSchema(makeShop());
    assert.equal(s['name'], 'Coco Cabana');
    assert.ok(String(s['url']).includes('cococabanalife.com'));
  });

  it('omits contactPoint when no email', () => {
    const s = generateOrganizationSchema(makeShop({ email: undefined }));
    assert.ok(!('contactPoint' in s) || s['contactPoint'] == null);
  });

  it('includes contactPoint when email provided', () => {
    const s = generateOrganizationSchema(makeShop({ email: 'hi@co.com' }));
    assert.ok('contactPoint' in s);
  });
});

// ── Never throws ──────────────────────────────────────────────────────────────

describe('generators — never throw', () => {
  it('generateProductSchema does not throw on minimal input', () => {
    assert.doesNotThrow(() => generateProductSchema({ id: '1', title: 'X' }));
  });
  it('generateCollectionSchema does not throw on minimal input', () => {
    assert.doesNotThrow(() => generateCollectionSchema({ id: '1', title: 'C', handle: 'c' }));
  });
  it('generatePageSchema does not throw on minimal input', () => {
    assert.doesNotThrow(() => generatePageSchema({ id: '1', title: 'P', handle: 'p' }, 'https://x.com'));
  });
  it('generateOrganizationSchema does not throw on minimal input', () => {
    assert.doesNotThrow(() => generateOrganizationSchema({ name: 'S', domain: 'x.com' }));
  });
});
