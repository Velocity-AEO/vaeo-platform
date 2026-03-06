/**
 * packages/schema-engine/src/index.test.ts
 *
 * Unit tests for the VAEO schema template engine.
 * Pure functions — no mocking required.
 *
 * Tests confirm:
 *   1.  Organization schema generates correctly with required fields
 *   2.  WebSite schema includes potentialAction when search_url present
 *   3.  WebSite schema omits potentialAction when search_url absent
 *   4.  Product schema generates with InStock / OutOfStock correctly
 *   5.  Article schema omits author block when author_name missing
 *   6.  Article schema includes author block when author_name present
 *   7.  BreadcrumbList skips when fewer than 2 breadcrumb items
 *   8.  BreadcrumbList generates correctly with 2+ items
 *   9.  FAQPage generates correctly with multiple Q&A items
 *  10.  FAQPage skips when faq_items missing or empty
 *  11.  All outputs pass JSON.parse() — validated: true
 *  12.  Null fields are stripped from output
 *  13.  Singleton check blocks duplicate @type generation
 *  14.  Missing required field adds to issues[] but does not throw
 *  15.  Homepage generates @graph with Organization + WebSite
 *  16.  stripNulls utility works recursively
 *  17.  findDuplicateType detects conflicts
 *  18.  ActionLog: schema-engine:generated on success
 *  19.  ActionLog: schema-engine:skipped on singleton collision
 *  20.  post page_type maps to Article
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSchema,
  stripNulls,
  findDuplicateType,
  SCHEMA_TEMPLATES,
  type SchemaRequest,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureStdout(fn: () => void): string[] {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try { fn(); } finally { process.stdout.write = orig; }
  return captured;
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

function req(overrides: Partial<SchemaRequest> & { cms_data?: Record<string, unknown> } = {}): SchemaRequest {
  return {
    run_id:    'run-sch-001',
    tenant_id: 't-aaa',
    site_id:   's-bbb',
    cms:       'shopify',
    url:       'https://cococabanalife.com/products/sun-glow-bikini',
    page_type: 'product',
    cms_data:  {},
    ...overrides,
  };
}

function parsed(json: string): Record<string, unknown> {
  return JSON.parse(json) as Record<string, unknown>;
}

// ── stripNulls ────────────────────────────────────────────────────────────────

describe('stripNulls', () => {
  it('removes null top-level keys', () => {
    const result = stripNulls({ a: 'hello', b: null, c: undefined }) as Record<string, unknown>;
    assert.ok(!('b' in result));
    assert.ok(!('c' in result));
    assert.equal(result['a'], 'hello');
  });

  it('removes null keys recursively in nested objects', () => {
    const result = stripNulls({ outer: { inner: null, keep: 'yes' } }) as Record<string, unknown>;
    const outer = result['outer'] as Record<string, unknown>;
    assert.ok(!('inner' in outer));
    assert.equal(outer['keep'], 'yes');
  });

  it('handles arrays recursively', () => {
    const result = stripNulls([{ a: null, b: 1 }, { a: 2 }]) as Array<Record<string, unknown>>;
    assert.ok(!('a' in result[0]));
    assert.equal(result[0]['b'], 1);
    assert.equal(result[1]['a'], 2);
  });

  it('passes through primitives unchanged', () => {
    assert.equal(stripNulls('hello'), 'hello');
    assert.equal(stripNulls(42), 42);
    assert.equal(stripNulls(true), true);
  });
});

// ── findDuplicateType ────────────────────────────────────────────────────────

describe('findDuplicateType', () => {
  it('returns type when conflict found', () => {
    const existing = [{ '@type': 'Product', name: 'Old' }];
    assert.equal(findDuplicateType(existing, 'Product'), 'Product');
  });

  it('returns null when no conflict', () => {
    const existing = [{ '@type': 'Article' }];
    assert.equal(findDuplicateType(existing, 'Product'), null);
  });

  it('returns null for empty blocks', () => {
    assert.equal(findDuplicateType([], 'Product'), null);
  });
});

// ── SCHEMA_TEMPLATES coverage ────────────────────────────────────────────────

describe('SCHEMA_TEMPLATES', () => {
  it('has entries for all 6 page types', () => {
    const types = ['product', 'article', 'homepage', 'collection', 'page', 'post'] as const;
    for (const t of types) {
      assert.equal(typeof SCHEMA_TEMPLATES[t], 'function', `missing template for ${t}`);
    }
  });
});

// ── Organization schema ───────────────────────────────────────────────────────

describe('generateSchema — Organization (homepage)', () => {
  const cms_data = {
    site_name: 'Coco Cabana',
    site_url:  'https://cococabanalife.com',
    logo_url:  'https://cococabanalife.com/logo.png',
  };

  it('generates @graph with Organization and WebSite', () => {
    const result = generateSchema(req({ page_type: 'homepage', cms_data }));
    assert.equal(result.schema_type, 'Organization');
    assert.equal(result.validated, true);
    assert.equal(result.issues.length, 0);

    const obj = parsed(result.schema_json);
    assert.equal(obj['@context'], 'https://schema.org');
    const graph = obj['@graph'] as Record<string, unknown>[];
    assert.equal(graph.length, 2);
    assert.equal(graph[0]['@type'], 'Organization');
    assert.equal(graph[1]['@type'], 'WebSite');
  });

  it('Organization block has correct name, url, logo', () => {
    const result = generateSchema(req({ page_type: 'homepage', cms_data }));
    const graph = (parsed(result.schema_json)['@graph']) as Record<string, unknown>[];
    const org = graph[0];
    assert.equal(org['name'], 'Coco Cabana');
    assert.equal(org['url'], 'https://cococabanalife.com');
    const logo = org['logo'] as Record<string, unknown>;
    assert.equal(logo['@type'], 'ImageObject');
    assert.equal(logo['url'], 'https://cococabanalife.com/logo.png');
  });

  it('omits logo block when logo_url missing', () => {
    const result = generateSchema(req({
      page_type: 'homepage',
      cms_data:  { site_name: 'Coco Cabana', site_url: 'https://cococabanalife.com' },
    }));
    const graph = (parsed(result.schema_json)['@graph']) as Record<string, unknown>[];
    const org = graph[0];
    assert.ok(!('logo' in org), 'logo should be absent');
  });

  it('adds to issues[] when site_name missing, does not throw', () => {
    const result = generateSchema(req({
      page_type: 'homepage',
      cms_data:  { site_url: 'https://cococabanalife.com' },
    }));
    assert.ok(result.issues.some((i) => i.includes('site_name')));
  });
});

// ── WebSite schema ────────────────────────────────────────────────────────────

describe('generateSchema — WebSite (homepage)', () => {
  it('includes potentialAction when search_url present', () => {
    const cms_data = {
      site_name:  'Coco Cabana',
      site_url:   'https://cococabanalife.com',
      search_url: 'https://cococabanalife.com/search',
    };
    const result = generateSchema(req({ page_type: 'homepage', cms_data }));
    const graph = (parsed(result.schema_json)['@graph']) as Record<string, unknown>[];
    const website = graph[1];
    const action = website['potentialAction'] as Record<string, unknown>;
    assert.ok(action, 'potentialAction should be present');
    assert.equal(action['@type'], 'SearchAction');
  });

  it('omits potentialAction when search_url absent', () => {
    const cms_data = { site_name: 'Coco Cabana', site_url: 'https://cococabanalife.com' };
    const result = generateSchema(req({ page_type: 'homepage', cms_data }));
    const graph = (parsed(result.schema_json)['@graph']) as Record<string, unknown>[];
    const website = graph[1];
    assert.ok(!('potentialAction' in website), 'potentialAction should be absent');
  });
});

// ── Product schema ────────────────────────────────────────────────────────────

describe('generateSchema — Product', () => {
  const cms_data = {
    product_title:       'Sun Glow Bikini',
    product_description: 'A stunning two-piece swimsuit.',
    product_image:       'https://cdn.shopify.com/sun-glow.jpg',
    sku:                 'SGB-001',
    price:               49.99,
    currency:            'USD',
    available:           true,
  };

  it('generates valid Product schema with InStock', () => {
    const result = generateSchema(req({ page_type: 'product', cms_data }));
    assert.equal(result.schema_type, 'Product');
    assert.equal(result.validated, true);
    assert.equal(result.issues.length, 0);

    const obj = parsed(result.schema_json);
    assert.equal(obj['@type'], 'Product');
    assert.equal(obj['name'], 'Sun Glow Bikini');
    assert.equal(obj['sku'],  'SGB-001');

    const offers = obj['offers'] as Record<string, unknown>;
    assert.equal(offers['availability'], 'https://schema.org/InStock');
    assert.equal(offers['price'],        49.99);
    assert.equal(offers['priceCurrency'], 'USD');
  });

  it('generates OutOfStock when available = false', () => {
    const result = generateSchema(req({
      page_type: 'product',
      cms_data:  { ...cms_data, available: false },
    }));
    const obj = parsed(result.schema_json);
    const offers = obj['offers'] as Record<string, unknown>;
    assert.equal(offers['availability'], 'https://schema.org/OutOfStock');
  });

  it('defaults to InStock when available field absent', () => {
    const { available: _a, ...noAvail } = cms_data;
    const result = generateSchema(req({ page_type: 'product', cms_data: noAvail }));
    const obj = parsed(result.schema_json);
    const offers = obj['offers'] as Record<string, unknown>;
    assert.equal(offers['availability'], 'https://schema.org/InStock');
  });

  it('defaults priceCurrency to USD when absent', () => {
    const { currency: _c, ...noCurrency } = cms_data;
    const result = generateSchema(req({ page_type: 'product', cms_data: noCurrency }));
    const obj = parsed(result.schema_json);
    const offers = obj['offers'] as Record<string, unknown>;
    assert.equal(offers['priceCurrency'], 'USD');
  });

  it('omits description, image, sku when missing (null stripped)', () => {
    const minimal = { product_title: 'Sun Glow Bikini', price: 49.99 };
    const result = generateSchema(req({ page_type: 'product', cms_data: minimal }));
    const obj = parsed(result.schema_json);
    assert.ok(!('description' in obj));
    assert.ok(!('image' in obj));
    assert.ok(!('sku' in obj));
  });

  it('adds to issues[] when product_title missing, does not throw', () => {
    const result = generateSchema(req({ page_type: 'product', cms_data: { price: 49.99 } }));
    assert.ok(result.issues.some((i) => i.includes('product_title')));
  });

  it('adds to issues[] when price missing, does not throw', () => {
    const result = generateSchema(req({ page_type: 'product', cms_data: { product_title: 'X' } }));
    assert.ok(result.issues.some((i) => i.includes('price')));
  });
});

// ── Article schema ────────────────────────────────────────────────────────────

describe('generateSchema — Article', () => {
  it('includes author block when author_name present', () => {
    const cms_data = {
      post_title:    'Top 10 Beach Styles',
      author_name:   'Jane Doe',
      publish_date:  '2026-03-01',
      modified_date: '2026-03-05',
      featured_image: 'https://cdn.example.com/beach.jpg',
    };
    const result = generateSchema(req({ page_type: 'article', cms_data }));
    assert.equal(result.schema_type, 'Article');
    assert.equal(result.validated, true);

    const obj = parsed(result.schema_json);
    const author = obj['author'] as Record<string, unknown>;
    assert.ok(author, 'author block should be present');
    assert.equal(author['@type'], 'Person');
    assert.equal(author['name'],  'Jane Doe');
    assert.equal(obj['headline'], 'Top 10 Beach Styles');
    assert.equal(obj['datePublished'], '2026-03-01');
    assert.equal(obj['dateModified'],  '2026-03-05');
  });

  it('omits author block when author_name missing', () => {
    const cms_data = { post_title: 'Beach Tips', publish_date: '2026-03-01' };
    const result = generateSchema(req({ page_type: 'article', cms_data }));
    const obj = parsed(result.schema_json);
    assert.ok(!('author' in obj), 'author should be absent when no author_name');
  });

  it('uses publish_date as dateModified fallback', () => {
    const cms_data = { post_title: 'Beach Tips', publish_date: '2026-03-01' };
    const result = generateSchema(req({ page_type: 'article', cms_data }));
    const obj = parsed(result.schema_json);
    assert.equal(obj['dateModified'], '2026-03-01');
  });

  it('omits featured_image when missing', () => {
    const cms_data = { post_title: 'Beach Tips', publish_date: '2026-03-01' };
    const result = generateSchema(req({ page_type: 'article', cms_data }));
    const obj = parsed(result.schema_json);
    assert.ok(!('image' in obj));
  });

  it('post page_type also produces Article schema', () => {
    const result = generateSchema(req({
      page_type: 'post',
      cms_data:  { post_title: 'A Blog Post', publish_date: '2026-03-01' },
    }));
    assert.equal(result.schema_type, 'Article');
    const obj = parsed(result.schema_json);
    assert.equal(obj['@type'], 'Article');
  });

  it('adds to issues[] when post_title missing, does not throw', () => {
    const result = generateSchema(req({ page_type: 'article', cms_data: { publish_date: '2026-03-01' } }));
    assert.ok(result.issues.some((i) => i.includes('post_title')));
  });
});

// ── BreadcrumbList ────────────────────────────────────────────────────────────

describe('generateSchema — BreadcrumbList', () => {
  it('skips when fewer than 2 breadcrumb items', () => {
    const result = generateSchema(req({
      page_type: 'page',
      cms_data:  { breadcrumbs: [{ name: 'Home', url: 'https://example.com' }] },
    }));
    // page with only 1 crumb and no faq → insufficient_data
    assert.ok(result.issues.some((i) => i.includes('insufficient_data')));
  });

  it('skips when breadcrumbs array is missing', () => {
    const result = generateSchema(req({ page_type: 'page', cms_data: {} }));
    assert.ok(result.issues.some((i) => i.includes('insufficient_data')));
  });

  it('generates BreadcrumbList with 2+ items', () => {
    const cms_data = {
      breadcrumbs: [
        { name: 'Home',     url: 'https://cococabanalife.com' },
        { name: 'Products', url: 'https://cococabanalife.com/collections/all' },
        { name: 'Sun Glow', url: 'https://cococabanalife.com/products/sun-glow' },
      ],
    };
    const result = generateSchema(req({ page_type: 'page', cms_data }));
    assert.equal(result.schema_type, 'BreadcrumbList');
    assert.equal(result.validated, true);

    const obj = parsed(result.schema_json);
    assert.equal(obj['@type'], 'BreadcrumbList');
    const items = obj['itemListElement'] as Record<string, unknown>[];
    assert.equal(items.length, 3);
    assert.equal(items[0]['position'], 1);
    assert.equal(items[0]['name'], 'Home');
    assert.equal(items[2]['position'], 3);
  });

  it('generates @graph with BreadcrumbList + FAQPage when both data present', () => {
    const cms_data = {
      breadcrumbs: [
        { name: 'Home',     url: 'https://cococabanalife.com' },
        { name: 'Products', url: 'https://cococabanalife.com/collections/all' },
      ],
      faq_items: [
        { question: 'What is your return policy?', answer: '30-day returns.' },
      ],
    };
    const result = generateSchema(req({ page_type: 'page', cms_data }));
    assert.equal(result.validated, true);

    const obj = parsed(result.schema_json);
    const graph = obj['@graph'] as Record<string, unknown>[];
    assert.equal(graph.length, 2);
    assert.equal(graph[0]['@type'], 'BreadcrumbList');
    assert.equal(graph[1]['@type'], 'FAQPage');
  });
});

// ── FAQPage ───────────────────────────────────────────────────────────────────

describe('generateSchema — FAQPage', () => {
  it('generates FAQPage with multiple Q&A items', () => {
    const cms_data = {
      breadcrumbs: [
        { name: 'Home', url: 'https://cococabanalife.com' },
        { name: 'FAQ',  url: 'https://cococabanalife.com/faq' },
      ],
      faq_items: [
        { question: 'What is your return policy?',  answer: '30-day returns on all items.' },
        { question: 'Do you offer free shipping?',  answer: 'Yes, on orders over $50.' },
        { question: 'Are swimsuits size-inclusive?', answer: 'Yes, we carry XS to 3XL.' },
      ],
    };
    const result = generateSchema(req({ page_type: 'page', cms_data }));
    assert.equal(result.validated, true);

    const obj = parsed(result.schema_json);
    const graph = obj['@graph'] as Record<string, unknown>[];
    const faq = graph.find((b) => b['@type'] === 'FAQPage') as Record<string, unknown>;
    assert.ok(faq, 'FAQPage block expected in @graph');

    const entities = faq['mainEntity'] as Record<string, unknown>[];
    assert.equal(entities.length, 3);
    assert.equal(entities[0]['@type'], 'Question');
    assert.equal(entities[0]['name'], 'What is your return policy?');

    const answer = entities[0]['acceptedAnswer'] as Record<string, unknown>;
    assert.equal(answer['@type'], 'Answer');
    assert.equal(answer['text'],  '30-day returns on all items.');
  });

  it('skips FAQPage when faq_items is empty array', () => {
    const cms_data = {
      breadcrumbs: [
        { name: 'Home', url: 'https://cococabanalife.com' },
        { name: 'FAQ',  url: 'https://cococabanalife.com/faq' },
      ],
      faq_items: [],
    };
    const result = generateSchema(req({ page_type: 'page', cms_data }));
    // Only BreadcrumbList generated — no FAQPage
    const obj = parsed(result.schema_json);
    assert.equal(obj['@type'], 'BreadcrumbList');
  });

  it('skips when faq_items missing entirely', () => {
    const cms_data = {
      breadcrumbs: [
        { name: 'Home', url: 'https://cococabanalife.com' },
        { name: 'FAQ',  url: 'https://cococabanalife.com/faq' },
      ],
    };
    const result = generateSchema(req({ page_type: 'page', cms_data }));
    const obj = parsed(result.schema_json);
    assert.equal(obj['@type'], 'BreadcrumbList'); // no FAQ
  });
});

// ── Singleton enforcement ────────────────────────────────────────────────────

describe('generateSchema — singleton check', () => {
  it('blocks generation when existing block has same @type', () => {
    const existing_schema_blocks = [
      {
        '@context': 'https://schema.org',
        '@type':    'Product',
        name:       'Existing Product',
        offers:     { '@type': 'Offer', price: 29.99, priceCurrency: 'USD' },
      },
    ];
    const cms_data = {
      product_title: 'Sun Glow Bikini',
      price:         49.99,
      existing_schema_blocks,
    };
    const result = generateSchema(req({ page_type: 'product', cms_data }));
    assert.ok(result.issues.includes('schema_already_exists_for_type'));
    // Returned JSON is the existing block, not the new one
    const obj = parsed(result.schema_json);
    assert.equal(obj['name'], 'Existing Product');
  });

  it('does not block when existing block is a different @type', () => {
    const existing_schema_blocks = [{ '@context': 'https://schema.org', '@type': 'Article' }];
    const cms_data = {
      product_title: 'Sun Glow Bikini',
      price:         49.99,
      existing_schema_blocks,
    };
    const result = generateSchema(req({ page_type: 'product', cms_data }));
    assert.ok(!result.issues.includes('schema_already_exists_for_type'));
    const obj = parsed(result.schema_json);
    assert.equal(obj['@type'], 'Product');
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('generateSchema — validation', () => {
  it('all standard page types produce validated: true', () => {
    const scenarios: Array<[Parameters<typeof req>[0]]> = [
      [{ page_type: 'product',  cms_data: { product_title: 'X', price: 10 } }],
      [{ page_type: 'article',  cms_data: { post_title: 'Y', publish_date: '2026-01-01' } }],
      [{ page_type: 'post',     cms_data: { post_title: 'Z', publish_date: '2026-01-01' } }],
      [{ page_type: 'homepage', cms_data: { site_name: 'ACME', site_url: 'https://acme.com' } }],
    ];
    for (const [overrides] of scenarios) {
      const result = generateSchema(req(overrides));
      assert.equal(result.validated, true, `expected validated=true for ${overrides.page_type}`);
    }
  });

  it('schema_json always parses as valid JSON', () => {
    const result = generateSchema(req({
      page_type: 'product',
      cms_data:  { product_title: 'Sun Glow', price: 49.99, available: true },
    }));
    assert.doesNotThrow(() => JSON.parse(result.schema_json));
  });

  it('null fields never appear in output JSON', () => {
    const result = generateSchema(req({
      page_type: 'product',
      cms_data:  { product_title: 'Sun Glow', price: 49.99 },
    }));
    assert.ok(!result.schema_json.includes('"null"'));
    assert.ok(!result.schema_json.includes(':null'));
  });
});

// ── ActionLog ────────────────────────────────────────────────────────────────

describe('generateSchema — ActionLog', () => {
  it('writes schema-engine:generated with schema_type and validated on success', () => {
    const lines = captureStdout(() => {
      generateSchema(req({
        page_type: 'product',
        cms_data:  { product_title: 'Sun Glow', price: 49.99 },
      }));
    });
    const entries  = parseLines(lines);
    const generated = entries.find((e) => e['stage'] === 'schema-engine:generated');
    assert.ok(generated, 'schema-engine:generated entry expected');
    assert.equal(generated!['status'], 'ok');
    const meta = generated!['metadata'] as Record<string, unknown>;
    assert.equal(meta['schema_type'], 'Product');
    assert.equal(meta['validated'],   true);
  });

  it('writes schema-engine:skipped with singleton_collision reason', () => {
    const lines = captureStdout(() => {
      generateSchema(req({
        page_type: 'product',
        cms_data:  {
          product_title:          'Sun Glow',
          price:                  49.99,
          existing_schema_blocks: [{ '@type': 'Product', name: 'Old' }],
        },
      }));
    });
    const entries = parseLines(lines);
    const skipped = entries.find((e) => e['stage'] === 'schema-engine:skipped');
    assert.ok(skipped, 'schema-engine:skipped entry expected');
    assert.equal(skipped!['status'], 'skipped');
    const meta = skipped!['metadata'] as Record<string, unknown>;
    assert.equal(meta['reason'], 'singleton_collision');
  });

  it('writes schema-engine:skipped with insufficient_data when no schema possible', () => {
    const lines = captureStdout(() => {
      generateSchema(req({ page_type: 'page', cms_data: {} }));
    });
    const entries = parseLines(lines);
    const skipped = entries.find((e) => e['stage'] === 'schema-engine:skipped');
    assert.ok(skipped);
    const meta = skipped!['metadata'] as Record<string, unknown>;
    assert.equal(meta['reason'], 'insufficient_data');
  });
});
