/**
 * tools/sandbox/liquid_renderer.test.ts
 *
 * Unit tests for the Liquid renderer, SEO extractor, and validator.
 * All I/O is mocked via injectable deps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTemplate,
  extractSeoFields,
  validateSeoFields,
  ensureThemeCache,
  renderCachedTemplate,
  type ShopifyContext,
  type SeoFields,
  type LiquidRendererDeps,
  type ThemeCacheEntry,
} from './liquid_renderer.js';

// ── Mock deps ────────────────────────────────────────────────────────────────

interface MockState {
  cache: Map<string, string>;   // "siteId:path" → content
  pullCalls: number;
}

function makeDeps(overrides: Partial<LiquidRendererDeps> = {}): LiquidRendererDeps & { _state: MockState } {
  const state: MockState = { cache: new Map(), pullCalls: 0 };

  return {
    _state: state,

    readCachedFile: async (siteId, filePath) => {
      return state.cache.get(`${siteId}:${filePath}`) ?? null;
    },

    writeCachedFile: async (siteId, filePath, content) => {
      state.cache.set(`${siteId}:${filePath}`, content);
    },

    listCachedFiles: async (siteId) => {
      const prefix = `${siteId}:`;
      const paths: string[] = [];
      for (const key of state.cache.keys()) {
        if (key.startsWith(prefix)) paths.push(key.slice(prefix.length));
      }
      return paths;
    },

    pullThemeFiles: async (_siteId) => {
      state.pullCalls++;
      return [
        { path: 'templates/product.liquid', content: '<h1>{{ product.title }}</h1>' },
        { path: 'layout/theme.liquid', content: '<html>{{ content_for_layout }}</html>' },
      ];
    },

    ...overrides,
  };
}

// ── renderTemplate ───────────────────────────────────────────────────────────

describe('renderTemplate', () => {

  it('renders a simple Liquid template with product context', async () => {
    const template = '<h1>{{ product.title }}</h1>';
    const context: ShopifyContext = { product: { title: 'Pool Float Deluxe' } };
    const html = await renderTemplate(template, context);
    assert.equal(html, '<h1>Pool Float Deluxe</h1>');
  });

  it('renders with collection context', async () => {
    const template = '<h1>{{ collection.title }}</h1><p>{{ collection.description }}</p>';
    const context: ShopifyContext = { collection: { title: 'Summer', description: 'Hot items' } };
    const html = await renderTemplate(template, context);
    assert.equal(html, '<h1>Summer</h1><p>Hot items</p>');
  });

  it('renders with shop context', async () => {
    const template = '<title>{{ page.title }} — {{ shop.name }}</title>';
    const context: ShopifyContext = { page: { title: 'About' }, shop: { name: 'MyStore' } };
    const html = await renderTemplate(template, context);
    assert.equal(html, '<title>About — MyStore</title>');
  });

  it('handles Liquid conditionals', async () => {
    const template = '{% if product.available %}<span>In Stock</span>{% else %}<span>Sold Out</span>{% endif %}';
    const html1 = await renderTemplate(template, { product: { available: true } });
    assert.ok(html1.includes('In Stock'));
    const html2 = await renderTemplate(template, { product: { available: false } });
    assert.ok(html2.includes('Sold Out'));
  });

  it('handles Liquid for loops', async () => {
    const template = '<ul>{% for tag in product.tags %}<li>{{ tag }}</li>{% endfor %}</ul>';
    const context: ShopifyContext = { product: { tags: ['summer', 'pool', 'fun'] } };
    const html = await renderTemplate(template, context);
    assert.ok(html.includes('<li>summer</li>'));
    assert.ok(html.includes('<li>pool</li>'));
    assert.ok(html.includes('<li>fun</li>'));
  });

  it('handles Liquid filters', async () => {
    const template = '{{ product.title | upcase }}';
    const context: ShopifyContext = { product: { title: 'Widget' } };
    const html = await renderTemplate(template, context);
    assert.equal(html, 'WIDGET');
  });

  it('returns empty string for empty template', async () => {
    const html = await renderTemplate('', {});
    assert.equal(html, '');
  });

  it('renders undefined variables as empty strings', async () => {
    const template = '<title>{{ product.title }}</title>';
    const html = await renderTemplate(template, {});
    assert.equal(html, '<title></title>');
  });

  it('handles settings context', async () => {
    const template = '{{ settings.site_tagline }}';
    const context: ShopifyContext = { settings: { site_tagline: 'Best pools ever' } };
    const html = await renderTemplate(template, context);
    assert.equal(html, 'Best pools ever');
  });
});

// ── extractSeoFields ─────────────────────────────────────────────────────────

describe('extractSeoFields', () => {

  it('extracts title from <title> tag', () => {
    const html = '<html><head><title>My Page Title</title></head></html>';
    const fields = extractSeoFields(html);
    assert.equal(fields.title, 'My Page Title');
  });

  it('extracts meta description', () => {
    const html = '<meta name="description" content="A great page about pool floats.">';
    const fields = extractSeoFields(html);
    assert.equal(fields.meta_description, 'A great page about pool floats.');
  });

  it('extracts meta description with single quotes', () => {
    const html = "<meta name='description' content='Single quoted description'>";
    const fields = extractSeoFields(html);
    assert.equal(fields.meta_description, 'Single quoted description');
  });

  it('extracts all h1 tags', () => {
    const html = '<h1>First H1</h1><p>text</p><h1>Second H1</h1>';
    const fields = extractSeoFields(html);
    assert.deepStrictEqual(fields.h1, ['First H1', 'Second H1']);
  });

  it('strips inner HTML from h1 tags', () => {
    const html = '<h1><span class="big">Styled H1</span></h1>';
    const fields = extractSeoFields(html);
    assert.deepStrictEqual(fields.h1, ['Styled H1']);
  });

  it('extracts canonical link', () => {
    const html = '<link rel="canonical" href="https://example.com/products/widget">';
    const fields = extractSeoFields(html);
    assert.equal(fields.canonical, 'https://example.com/products/widget');
  });

  it('extracts JSON-LD schema blocks', () => {
    const schema = '{"@type":"Product","name":"Widget"}';
    const html = `<script type="application/ld+json">${schema}</script>`;
    const fields = extractSeoFields(html);
    assert.equal(fields.schema_json_ld.length, 1);
    assert.equal(fields.schema_json_ld[0], schema);
  });

  it('extracts multiple JSON-LD blocks', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Product"}</script>
      <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
    `;
    const fields = extractSeoFields(html);
    assert.equal(fields.schema_json_ld.length, 2);
  });

  it('returns nulls and empty arrays for missing fields', () => {
    const html = '<html><body><p>No SEO fields here</p></body></html>';
    const fields = extractSeoFields(html);
    assert.equal(fields.title, null);
    assert.equal(fields.meta_description, null);
    assert.deepStrictEqual(fields.h1, []);
    assert.equal(fields.canonical, null);
    assert.deepStrictEqual(fields.schema_json_ld, []);
  });

  it('returns empty result for empty string', () => {
    const fields = extractSeoFields('');
    assert.equal(fields.title, null);
    assert.deepStrictEqual(fields.h1, []);
    assert.deepStrictEqual(fields.schema_json_ld, []);
  });

  it('decodes HTML entities in title', () => {
    const html = '<title>Tom &amp; Jerry&#39;s Pool</title>';
    const fields = extractSeoFields(html);
    assert.equal(fields.title, "Tom & Jerry's Pool");
  });

  it('skips empty h1 tags', () => {
    const html = '<h1></h1><h1>   </h1><h1>Real H1</h1>';
    const fields = extractSeoFields(html);
    assert.deepStrictEqual(fields.h1, ['Real H1']);
  });

  it('handles a complete HTML document', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Pool Float Deluxe — Coco Cabana</title>
  <meta name="description" content="Shop our premium pool float collection with free shipping on orders over $50.">
  <link rel="canonical" href="https://cococabana.com/products/pool-float-deluxe">
  <script type="application/ld+json">{"@type":"Product","name":"Pool Float Deluxe","price":"49.99"}</script>
</head>
<body>
  <h1>Pool Float Deluxe</h1>
  <p>The ultimate pool companion.</p>
</body>
</html>`;
    const fields = extractSeoFields(html);
    assert.equal(fields.title, 'Pool Float Deluxe — Coco Cabana');
    assert.equal(fields.meta_description, 'Shop our premium pool float collection with free shipping on orders over $50.');
    assert.deepStrictEqual(fields.h1, ['Pool Float Deluxe']);
    assert.equal(fields.canonical, 'https://cococabana.com/products/pool-float-deluxe');
    assert.equal(fields.schema_json_ld.length, 1);
    const parsed = JSON.parse(fields.schema_json_ld[0]);
    assert.equal(parsed['@type'], 'Product');
  });
});

// ── validateSeoFields ────────────────────────────────────────────────────────

describe('validateSeoFields', () => {

  const PERFECT_FIELDS: SeoFields = {
    title:            'Pool Float Deluxe — Premium Summer Accessories',  // 48 chars
    meta_description: 'Shop our premium pool float collection featuring luxury designs, durable materials, and vibrant colors. Free shipping on all orders over $50 today.',  // 148 chars
    h1:               ['Pool Float Deluxe'],
    canonical:        'https://example.com/products/pool-float-deluxe',
    schema_json_ld:   ['{"@type":"Product","name":"Pool Float Deluxe"}'],
  };

  it('passes when all fields are valid', () => {
    const result = validateSeoFields(PERFECT_FIELDS);
    assert.equal(result.pass, true);
    assert.equal(result.issues.length, 0);
  });

  // ── Title rules ────────────────────────────────────────────────────────

  it('critical: title_missing when title is null', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, title: null });
    assert.equal(result.pass, false);
    const issue = result.issues.find((i) => i.rule === 'title_missing');
    assert.ok(issue);
    assert.equal(issue!.severity, 'critical');
  });

  it('minor: title_too_short when under 30 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, title: 'Short Title' });
    const issue = result.issues.find((i) => i.rule === 'title_too_short');
    assert.ok(issue);
    assert.equal(issue!.severity, 'minor');
  });

  it('minor: title_too_long when over 60 chars', () => {
    const longTitle = 'A'.repeat(61);
    const result = validateSeoFields({ ...PERFECT_FIELDS, title: longTitle });
    const issue = result.issues.find((i) => i.rule === 'title_too_long');
    assert.ok(issue);
    assert.equal(issue!.severity, 'minor');
  });

  it('no title length issues for exactly 30 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, title: 'A'.repeat(30) });
    const titleIssues = result.issues.filter((i) => i.field === 'title');
    assert.equal(titleIssues.length, 0);
  });

  it('no title length issues for exactly 60 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, title: 'A'.repeat(60) });
    const titleIssues = result.issues.filter((i) => i.field === 'title');
    assert.equal(titleIssues.length, 0);
  });

  // ── Meta description rules ─────────────────────────────────────────────

  it('major: meta_missing when meta_description is null', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, meta_description: null });
    const issue = result.issues.find((i) => i.rule === 'meta_missing');
    assert.ok(issue);
    assert.equal(issue!.severity, 'major');
  });

  it('minor: meta_too_short when under 120 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, meta_description: 'Short meta.' });
    const issue = result.issues.find((i) => i.rule === 'meta_too_short');
    assert.ok(issue);
    assert.equal(issue!.severity, 'minor');
  });

  it('minor: meta_too_long when over 155 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, meta_description: 'A'.repeat(156) });
    const issue = result.issues.find((i) => i.rule === 'meta_too_long');
    assert.ok(issue);
    assert.equal(issue!.severity, 'minor');
  });

  it('no meta length issues for exactly 120 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, meta_description: 'A'.repeat(120) });
    const metaIssues = result.issues.filter((i) => i.field === 'meta_description');
    assert.equal(metaIssues.length, 0);
  });

  it('no meta length issues for exactly 155 chars', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, meta_description: 'A'.repeat(155) });
    const metaIssues = result.issues.filter((i) => i.field === 'meta_description');
    assert.equal(metaIssues.length, 0);
  });

  // ── H1 rules ───────────────────────────────────────────────────────────

  it('critical: h1_missing when h1 array is empty', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, h1: [] });
    const issue = result.issues.find((i) => i.rule === 'h1_missing');
    assert.ok(issue);
    assert.equal(issue!.severity, 'critical');
  });

  it('major: h1_multiple when more than one h1', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, h1: ['First', 'Second'] });
    const issue = result.issues.find((i) => i.rule === 'h1_multiple');
    assert.ok(issue);
    assert.equal(issue!.severity, 'major');
    assert.ok(issue!.message.includes('2'));
  });

  it('no h1 issues for exactly one h1', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, h1: ['Only H1'] });
    const h1Issues = result.issues.filter((i) => i.field === 'h1');
    assert.equal(h1Issues.length, 0);
  });

  // ── Canonical rules ────────────────────────────────────────────────────

  it('critical: canonical_missing when canonical is null', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, canonical: null });
    const issue = result.issues.find((i) => i.rule === 'canonical_missing');
    assert.ok(issue);
    assert.equal(issue!.severity, 'critical');
  });

  // ── Schema rules ───────────────────────────────────────────────────────

  it('major: schema_missing when no JSON-LD blocks', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, schema_json_ld: [] });
    const issue = result.issues.find((i) => i.rule === 'schema_missing');
    assert.ok(issue);
    assert.equal(issue!.severity, 'major');
  });

  it('major: schema_invalid_json for malformed JSON-LD', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, schema_json_ld: ['{not valid json}'] });
    const issue = result.issues.find((i) => i.rule === 'schema_invalid_json');
    assert.ok(issue);
    assert.equal(issue!.severity, 'major');
  });

  it('no schema_invalid_json for valid JSON-LD', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, schema_json_ld: ['{"@type":"Product"}'] });
    const schemaIssues = result.issues.filter((i) => i.rule === 'schema_invalid_json');
    assert.equal(schemaIssues.length, 0);
  });

  it('checks each JSON-LD block individually', () => {
    const result = validateSeoFields({
      ...PERFECT_FIELDS,
      schema_json_ld: ['{"@type":"Product"}', '{bad}', '{"@type":"Breadcrumb"}'],
    });
    const invalidIssues = result.issues.filter((i) => i.rule === 'schema_invalid_json');
    assert.equal(invalidIssues.length, 1);
    assert.ok(invalidIssues[0].message.includes('block 2'));
  });

  // ── Combined ───────────────────────────────────────────────────────────

  it('reports multiple issues at once', () => {
    const result = validateSeoFields({
      title:            null,
      meta_description: null,
      h1:               [],
      canonical:        null,
      schema_json_ld:   [],
    });
    assert.equal(result.pass, false);
    assert.equal(result.issues.length, 5); // title + meta + h1 + canonical + schema
  });

  it('includes value in issue when present', () => {
    const result = validateSeoFields({ ...PERFECT_FIELDS, title: 'Short' });
    const issue = result.issues.find((i) => i.rule === 'title_too_short');
    assert.ok(issue);
    assert.equal(issue!.value, 'Short');
  });
});

// ── ensureThemeCache ─────────────────────────────────────────────────────────

describe('ensureThemeCache', () => {

  it('pulls theme files on first call', async () => {
    const deps = makeDeps();
    const paths = await ensureThemeCache('site-001', deps);

    assert.equal(deps._state.pullCalls, 1);
    assert.equal(paths.length, 2);
    assert.ok(paths.includes('templates/product.liquid'));
    assert.ok(paths.includes('layout/theme.liquid'));
  });

  it('writes pulled files to cache', async () => {
    const deps = makeDeps();
    await ensureThemeCache('site-001', deps);

    assert.equal(deps._state.cache.size, 2);
    const content = deps._state.cache.get('site-001:templates/product.liquid');
    assert.equal(content, '<h1>{{ product.title }}</h1>');
  });

  it('skips pull when cache already populated', async () => {
    const deps = makeDeps();
    deps._state.cache.set('site-001:templates/index.liquid', '<h1>Home</h1>');

    const paths = await ensureThemeCache('site-001', deps);

    assert.equal(deps._state.pullCalls, 0);
    assert.equal(paths.length, 1);
    assert.ok(paths.includes('templates/index.liquid'));
  });

  it('returns empty array for empty siteId', async () => {
    const deps = makeDeps();
    const paths = await ensureThemeCache('', deps);
    assert.deepStrictEqual(paths, []);
    assert.equal(deps._state.pullCalls, 0);
  });

  it('isolates cache between site IDs', async () => {
    const deps = makeDeps();
    await ensureThemeCache('site-001', deps);

    const paths2 = await ensureThemeCache('site-002', deps);
    assert.equal(deps._state.pullCalls, 2);
    assert.equal(paths2.length, 2);
  });
});

// ── renderCachedTemplate ─────────────────────────────────────────────────────

describe('renderCachedTemplate', () => {

  it('reads from cache and renders', async () => {
    const deps = makeDeps();
    deps._state.cache.set('site-001:templates/product.liquid', '<h1>{{ product.title }}</h1>');

    const html = await renderCachedTemplate(
      'site-001',
      'templates/product.liquid',
      { product: { title: 'Widget' } },
      deps,
    );
    assert.equal(html, '<h1>Widget</h1>');
  });

  it('throws when template not in cache', async () => {
    const deps = makeDeps();
    await assert.rejects(
      () => renderCachedTemplate('site-001', 'templates/missing.liquid', {}, deps),
      { message: 'Template not found in cache: templates/missing.liquid' },
    );
  });
});

// ── Integration: render → extract → validate ─────────────────────────────────

describe('render → extract → validate pipeline', () => {

  it('end-to-end: valid template passes validation', async () => {
    const template = `
<html>
<head>
  <title>{{ product.title }} — {{ shop.name }}</title>
  <meta name="description" content="{{ product.description }}">
  <link rel="canonical" href="{{ product.url }}">
  <script type="application/ld+json">{"@type":"Product","name":"{{ product.title }}"}</script>
</head>
<body>
  <h1>{{ product.title }}</h1>
</body>
</html>`;

    const context: ShopifyContext = {
      product: {
        title: 'Premium Pool Float Deluxe Edition',
        description: 'Discover the ultimate luxury pool float with premium materials, vibrant summer colors, and unmatched durability. Free shipping on orders over $50.',
        url: 'https://example.com/products/pool-float-deluxe',
      },
      shop: { name: 'Coco Cabana' },
    };

    const html = await renderTemplate(template, context);
    const fields = extractSeoFields(html);
    const result = validateSeoFields(fields);

    assert.equal(fields.title, 'Premium Pool Float Deluxe Edition — Coco Cabana');
    assert.equal(fields.h1.length, 1);
    assert.ok(fields.canonical);
    assert.equal(fields.schema_json_ld.length, 1);
    assert.equal(result.pass, true);
  });

  it('end-to-end: missing fields fail validation', async () => {
    const template = '<html><body><p>{{ product.description }}</p></body></html>';
    const context: ShopifyContext = { product: { description: 'No SEO here' } };

    const html = await renderTemplate(template, context);
    const fields = extractSeoFields(html);
    const result = validateSeoFields(fields);

    assert.equal(result.pass, false);
    const rules = result.issues.map((i) => i.rule);
    assert.ok(rules.includes('title_missing'));
    assert.ok(rules.includes('meta_missing'));
    assert.ok(rules.includes('h1_missing'));
    assert.ok(rules.includes('canonical_missing'));
    assert.ok(rules.includes('schema_missing'));
  });

  it('end-to-end with cached template', async () => {
    const deps = makeDeps({
      pullThemeFiles: async () => [{
        path: 'templates/product.liquid',
        content: `<title>{{ product.title }} — Store</title>
<meta name="description" content="{{ product.description }}">
<link rel="canonical" href="{{ product.url }}">
<script type="application/ld+json">{"@type":"Product"}</script>
<h1>{{ product.title }}</h1>`,
      }],
    });

    await ensureThemeCache('site-001', deps);
    const html = await renderCachedTemplate('site-001', 'templates/product.liquid', {
      product: {
        title: 'Pool Float Deluxe Premium Edition',
        description: 'Shop our premium pool float collection featuring luxury designs, durable materials, and vibrant colors. Free shipping on all orders over $50 today.',
        url: 'https://example.com/products/pool-float',
      },
    }, deps);
    const fields = extractSeoFields(html);
    const result = validateSeoFields(fields);

    assert.equal(result.pass, true);
  });
});
