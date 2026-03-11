/**
 * tools/sandbox/jsonld_extractor.test.ts
 *
 * Tests for extractJsonLd.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonLd } from './jsonld_extractor.js';

describe('extractJsonLd', () => {
  it('returns empty array when no JSON-LD blocks', () => {
    const html = '<html><head><title>No Schema</title></head><body></body></html>';
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 0);
  });

  it('extracts a single JSON-LD block', () => {
    const schema = { '@context': 'https://schema.org', '@type': 'Product', name: 'Widget' };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(schema)}</script></head></html>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.deepStrictEqual(blocks[0].parsed, schema);
    assert.equal(blocks[0].error, undefined);
  });

  it('extracts multiple JSON-LD blocks', () => {
    const s1 = { '@type': 'Product', name: 'A' };
    const s2 = { '@type': 'BreadcrumbList', itemListElement: [] };
    const html = `
      <head>
        <script type="application/ld+json">${JSON.stringify(s1)}</script>
        <script type="application/ld+json">${JSON.stringify(s2)}</script>
      </head>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].parsed!['@type'], 'Product');
    assert.equal(blocks[1].parsed!['@type'], 'BreadcrumbList');
  });

  it('returns error entry for malformed JSON', () => {
    const html = '<script type="application/ld+json">{ invalid json }</script>';
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed, null);
    assert.ok(blocks[0].error?.includes('Invalid JSON'));
    assert.equal(blocks[0].raw, '{ invalid json }');
  });

  it('handles empty script tag', () => {
    const html = '<script type="application/ld+json">  </script>';
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed, null);
    assert.ok(blocks[0].error?.includes('Empty'));
  });

  it('handles JSON-LD array by flattening into separate blocks', () => {
    const arr = [{ '@type': 'Product', name: 'A' }, { '@type': 'Offer', price: '10' }];
    const html = `<script type="application/ld+json">${JSON.stringify(arr)}</script>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].parsed!['@type'], 'Product');
    assert.equal(blocks[1].parsed!['@type'], 'Offer');
  });

  it('is case-insensitive for script type attribute', () => {
    const schema = { '@type': 'WebPage' };
    const html = `<SCRIPT TYPE="application/ld+json">${JSON.stringify(schema)}</SCRIPT>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed!['@type'], 'WebPage');
  });

  it('handles script tag with extra attributes', () => {
    const schema = { '@type': 'Organization' };
    const html = `<script id="schema" type="application/ld+json" data-page="home">${JSON.stringify(schema)}</script>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed!['@type'], 'Organization');
  });

  it('never throws on any input', () => {
    assert.doesNotThrow(() => extractJsonLd(''));
    assert.doesNotThrow(() => extractJsonLd('<script type="application/ld+json">null</script>'));
    assert.doesNotThrow(() => extractJsonLd('<script type="application/ld+json">42</script>'));
    assert.doesNotThrow(() => extractJsonLd('<script type="application/ld+json">"just a string"</script>'));
  });

  it('handles multiline JSON-LD', () => {
    const html = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Multi\\nLine"
}
</script>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed!['@type'], 'Product');
  });

  it('ignores non-JSON-LD script tags', () => {
    const html = `
      <script type="text/javascript">var x = 1;</script>
      <script type="application/ld+json">{"@type":"Product"}</script>
      <script>console.log('hi');</script>`;
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed!['@type'], 'Product');
  });
});
