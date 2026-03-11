/**
 * tools/sandbox/sandbox_verify.test.ts
 *
 * Tests for sandboxVerify with mocked fetchHtml.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sandboxVerify, type SandboxVerifyDeps } from './sandbox_verify.js';
import { FetchError } from './html_fetcher.js';
import { extractJsonLd } from './jsonld_extractor.js';

function htmlWith(...schemas: Record<string, unknown>[]): string {
  const scripts = schemas
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('\n');
  return `<html><head>${scripts}</head><body></body></html>`;
}

function mockDeps(html: string): Partial<SandboxVerifyDeps> {
  return {
    fetchHtml:     async () => html,
    extractJsonLd,
  };
}

describe('sandboxVerify', () => {
  it('returns PASS for valid Product schema', async () => {
    const html = htmlWith({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Widget',
    });
    const result = await sandboxVerify('https://example.com/products/widget', mockDeps(html));

    assert.equal(result.status, 'PASS');
    assert.equal(result.schemaFound, true);
    assert.equal(result.schemaType, 'Product');
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.rawSchema?.includes('Product'));
  });

  it('returns NO_SCHEMA when no JSON-LD blocks', async () => {
    const html = '<html><head><title>No Schema</title></head></html>';
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'NO_SCHEMA');
    assert.equal(result.schemaFound, false);
    assert.equal(result.schemaType, null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('No JSON-LD'));
  });

  it('returns FAIL when fetch fails with 404', async () => {
    const deps: Partial<SandboxVerifyDeps> = {
      fetchHtml: async () => { throw new FetchError('https://example.com', 404); },
      extractJsonLd,
    };
    const result = await sandboxVerify('https://example.com', deps);

    assert.equal(result.status, 'FAIL');
    assert.equal(result.schemaFound, false);
    assert.ok(result.errors[0]?.includes('404'));
  });

  it('returns FAIL when fetch throws network error', async () => {
    const deps: Partial<SandboxVerifyDeps> = {
      fetchHtml: async () => { throw new Error('ECONNREFUSED'); },
      extractJsonLd,
    };
    const result = await sandboxVerify('https://example.com', deps);

    assert.equal(result.status, 'FAIL');
    assert.ok(result.errors[0]?.includes('ECONNREFUSED'));
  });

  it('returns FAIL for schema missing @context', async () => {
    const html = htmlWith({ '@type': 'Product', name: 'Widget' });
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'FAIL');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('@context')));
  });

  it('returns FAIL for schema missing @type', async () => {
    const html = htmlWith({ '@context': 'https://schema.org', name: 'Widget' });
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'FAIL');
    assert.ok(result.errors.some((e) => e.includes('@type')));
  });

  it('selects Product over WebPage when both present', async () => {
    const html = htmlWith(
      { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Page' },
      { '@context': 'https://schema.org', '@type': 'Product', name: 'Widget' },
    );
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'PASS');
    assert.equal(result.schemaType, 'Product');
  });

  it('selects Collection over Article when both present', async () => {
    const html = htmlWith(
      { '@context': 'https://schema.org', '@type': 'Article', headline: 'Post' },
      { '@context': 'https://schema.org', '@type': 'Collection', name: 'Shoes' },
    );
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'PASS');
    assert.equal(result.schemaType, 'Collection');
  });

  it('falls back to first valid block when type not in priority list', async () => {
    const html = htmlWith(
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
    );
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'PASS');
    assert.equal(result.schemaType, 'Organization');
  });

  it('returns NO_SCHEMA with parse errors when all blocks malformed', async () => {
    const html = '<script type="application/ld+json">{ broken }</script>';
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'NO_SCHEMA');
    assert.equal(result.schemaFound, true);
    assert.ok(result.errors[0]?.includes('Invalid JSON'));
  });

  it('returns FAIL for Product missing name', async () => {
    const html = htmlWith({
      '@context': 'https://schema.org',
      '@type': 'Product',
    });
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'FAIL');
    assert.ok(result.errors.some((e) => e.includes('missing name')));
  });

  it('url and fetchedAt are populated in result', async () => {
    const html = htmlWith({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'X' });
    const result = await sandboxVerify('https://example.com/page', mockDeps(html));

    assert.equal(result.url, 'https://example.com/page');
    assert.ok(result.fetchedAt.length > 0);
    assert.ok(result.fetchedAt.includes('T'), 'fetchedAt should be ISO 8601');
  });

  it('accepts http://schema.org as valid @context', async () => {
    const html = htmlWith({
      '@context': 'http://schema.org',
      '@type': 'WebPage',
      name: 'Test',
    });
    const result = await sandboxVerify('https://example.com', mockDeps(html));

    assert.equal(result.status, 'PASS');
    assert.equal(result.valid, true);
  });
});
