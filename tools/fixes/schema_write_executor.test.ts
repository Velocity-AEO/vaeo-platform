/**
 * tools/fixes/schema_write_executor.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeSchemaWrite,
  type SchemaWriteResult,
  type SchemaWriteExecutorDeps,
} from './schema_write_executor.js';
import {
  extractSchemaTypes,
  validateSchemaOnPage,
} from './schema_confirm_validator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type':    'Product',
  name:       'Test Product',
  offers:     { '@type': 'Offer', price: '9.99', priceCurrency: 'USD' },
});

const VALID_SCHEMA_OBJ = JSON.parse(VALID_SCHEMA) as Record<string, unknown>;

function makeDeps(overrides: Partial<SchemaWriteExecutorDeps> = {}): SchemaWriteExecutorDeps {
  return {
    applyFn:    async () => ({ ok: true, theme_file: 'metafield:velocity_seo/schema_json' }),
    validateFn: (_schema) => ({ valid: true, errors: [] }),
    rollbackFn: async () => ({ ok: true }),
    confirmFn:  async () => ({ confirmed: true, found_types: ['Product'] }),
    recordFn:   async () => {},
    ...overrides,
  };
}

// ── executeSchemaWrite ────────────────────────────────────────────────────────

describe('executeSchemaWrite', () => {
  it('returns success=true on valid write with confirmation', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/products/widget', VALID_SCHEMA, 'Product', 'shopify', makeDeps());
    assert.equal(result.success, true);
    assert.equal(result.rolled_back, false);
  });

  it('returns correct schema_type', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/p', VALID_SCHEMA, 'Product', 'shopify', makeDeps());
    assert.equal(result.schema_type, 'Product');
  });

  it('returns bytes_written > 0 for valid schema', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/p', VALID_SCHEMA, 'Product', 'shopify', makeDeps());
    assert.ok(result.bytes_written > 0);
  });

  it('returns theme_file_updated', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/p', VALID_SCHEMA, 'Product', 'shopify', makeDeps());
    assert.ok(result.theme_file_updated.length > 0);
  });

  it('rolls back when confirmation fails', async () => {
    let rollbackCalled = false;
    const result = await executeSchemaWrite(
      'site_1',
      'https://example.com/p',
      VALID_SCHEMA,
      'Product',
      'shopify',
      makeDeps({
        confirmFn:  async () => ({ confirmed: false, found_types: [] }),
        rollbackFn: async () => { rollbackCalled = true; return { ok: true }; },
      }),
    );
    assert.equal(result.success, false);
    assert.equal(result.rolled_back, true);
    assert.equal(rollbackCalled, true);
  });

  it('returns success=false and no rollback when apply fails', async () => {
    const result = await executeSchemaWrite(
      'site_1',
      'https://example.com/p',
      VALID_SCHEMA,
      'Product',
      'shopify',
      makeDeps({ applyFn: async () => ({ ok: false, error: 'API 500' }) }),
    );
    assert.equal(result.success, false);
    assert.equal(result.rolled_back, false);
    assert.ok(result.error?.includes('API 500'));
  });

  it('returns error for malformed JSON schema', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/p', 'not-json', 'Product', 'shopify', makeDeps());
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('not valid JSON'));
  });

  it('returns error when validateFn fails', async () => {
    const result = await executeSchemaWrite(
      'site_1',
      'https://example.com/p',
      VALID_SCHEMA,
      'Product',
      'shopify',
      makeDeps({ validateFn: () => ({ valid: false, errors: ['@context missing'] }) }),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('@context missing'));
  });

  it('calls recordFn with result', async () => {
    let recorded = false;
    await executeSchemaWrite(
      'site_1', 'https://example.com/p', VALID_SCHEMA, 'Product', 'shopify',
      makeDeps({ recordFn: async () => { recorded = true; } }),
    );
    assert.equal(recorded, true);
  });

  it('calls recordFn even on failure', async () => {
    let recorded = false;
    await executeSchemaWrite(
      'site_1', 'https://example.com/p', VALID_SCHEMA, 'Product', 'shopify',
      makeDeps({
        applyFn:   async () => ({ ok: false, error: 'fail' }),
        recordFn:  async () => { recorded = true; },
      }),
    );
    assert.equal(recorded, true);
  });

  it('returns error for missing site_id', async () => {
    const result = await executeSchemaWrite('', 'https://example.com/', VALID_SCHEMA, 'Product', 'shopify', makeDeps());
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('returns error for missing url', async () => {
    const result = await executeSchemaWrite('site_1', '', VALID_SCHEMA, 'Product', 'shopify', makeDeps());
    assert.equal(result.success, false);
  });

  it('returns error for missing schema_json', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/', '', 'Product', 'shopify', makeDeps());
    assert.equal(result.success, false);
  });

  it('all deps are injectable', async () => {
    let applyCalled    = false;
    let validateCalled = false;
    let confirmCalled  = false;
    await executeSchemaWrite(
      'site_1', 'https://example.com/p', VALID_SCHEMA, 'Product', 'shopify',
      {
        applyFn:    async () => { applyCalled = true; return { ok: true }; },
        validateFn: () => { validateCalled = true; return { valid: true, errors: [] }; },
        confirmFn:  async () => { confirmCalled = true; return { confirmed: true, found_types: ['Product'] }; },
        rollbackFn: async () => ({ ok: true }),
        recordFn:   async () => {},
      },
    );
    assert.equal(applyCalled, true);
    assert.equal(validateCalled, true);
    assert.equal(confirmCalled, true);
  });

  it('resolves schema_type from @type when not provided', async () => {
    const result = await executeSchemaWrite('site_1', 'https://example.com/', VALID_SCHEMA, '', 'shopify', makeDeps());
    assert.equal(result.schema_type, 'Product');
  });

  it('never throws when applyFn throws', async () => {
    await assert.doesNotReject(() =>
      executeSchemaWrite(
        'site_1', 'https://example.com/', VALID_SCHEMA, 'Product', 'shopify',
        makeDeps({ applyFn: async () => { throw new Error('network'); } }),
      ),
    );
  });

  it('never throws when rollbackFn throws', async () => {
    await assert.doesNotReject(() =>
      executeSchemaWrite(
        'site_1', 'https://example.com/', VALID_SCHEMA, 'Product', 'shopify',
        makeDeps({
          confirmFn:  async () => ({ confirmed: false, found_types: [] }),
          rollbackFn: async () => { throw new Error('rollback fail'); },
        }),
      ),
    );
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() =>
      executeSchemaWrite(null as any, null as any, null as any, null as any, null as any),
    );
  });
});

// ── extractSchemaTypes ────────────────────────────────────────────────────────

describe('extractSchemaTypes', () => {
  it('finds single @type from ld+json block', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product"}</script>`;
    assert.deepEqual(extractSchemaTypes(html), ['Product']);
  });

  it('finds multiple types from multiple blocks', () => {
    const html = `
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product"}</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
    `;
    const types = extractSchemaTypes(html);
    assert.ok(types.includes('Product'));
    assert.ok(types.includes('BreadcrumbList'));
  });

  it('handles @type as string array', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":["Product","Thing"]}</script>`;
    const types = extractSchemaTypes(html);
    assert.ok(types.includes('Product'));
    assert.ok(types.includes('Thing'));
  });

  it('handles @graph array', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"WebSite"}]}</script>`;
    const types = extractSchemaTypes(html);
    assert.ok(types.includes('Organization'));
    assert.ok(types.includes('WebSite'));
  });

  it('returns empty array for html with no ld+json', () => {
    assert.deepEqual(extractSchemaTypes('<html><body>no schema</body></html>'), []);
  });

  it('skips malformed JSON blocks gracefully', () => {
    const html = `<script type="application/ld+json">not valid json</script>`;
    assert.deepEqual(extractSchemaTypes(html), []);
  });

  it('returns empty array for empty html', () => {
    assert.deepEqual(extractSchemaTypes(''), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => extractSchemaTypes(null as any));
  });
});

// ── validateSchemaOnPage ──────────────────────────────────────────────────────

describe('validateSchemaOnPage', () => {
  it('returns confirmed=true when expected type found', async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product"}</script>`;
    const result = await validateSchemaOnPage('https://example.com/', 'Product', {
      fetchFn: async () => ({ ok: true, text: async () => html }),
    });
    assert.equal(result.confirmed, true);
    assert.ok(result.found_types.includes('Product'));
  });

  it('returns confirmed=false when type not found', async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>`;
    const result = await validateSchemaOnPage('https://example.com/', 'Product', {
      fetchFn: async () => ({ ok: true, text: async () => html }),
    });
    assert.equal(result.confirmed, false);
  });

  it('returns confirmed=false when page fetch fails', async () => {
    const result = await validateSchemaOnPage('https://example.com/', 'Product', {
      fetchFn: async () => ({ ok: false, text: async () => '' }),
    });
    assert.equal(result.confirmed, false);
  });

  it('case-insensitive type matching', async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product"}</script>`;
    const result = await validateSchemaOnPage('https://example.com/', 'product', {
      fetchFn: async () => ({ ok: true, text: async () => html }),
    });
    assert.equal(result.confirmed, true);
  });

  it('returns error for empty url', async () => {
    const result = await validateSchemaOnPage('', 'Product');
    assert.equal(result.confirmed, false);
    assert.ok(result.error);
  });

  it('never throws when fetchFn throws', async () => {
    await assert.doesNotReject(() =>
      validateSchemaOnPage('https://example.com/', 'Product', {
        fetchFn: async () => { throw new Error('network'); },
      }),
    );
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => validateSchemaOnPage(null as any, null as any));
  });
});
