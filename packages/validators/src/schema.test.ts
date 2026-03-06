/**
 * packages/validators/src/schema.test.ts
 *
 * Unit tests for the schema.org JSON-LD validator.
 * Pure local logic — no external API, no mocking required.
 *
 * Tests confirm:
 *   1.  Valid Product schema passes all checks
 *   2.  Invalid JSON returns valid_json=false without throwing
 *   3.  Missing @context returns error
 *   4.  Missing @type returns error
 *   5.  Missing required field for Product (offers) adds to missing_fields[]
 *   6.  Unknown @type passes with warning not error
 *   7.  Duplicate @type across 2 blocks adds warning to both
 *   8.  passed=false when any block has errors
 *   9.  passed=true when only warnings present
 *  10.  REQUIRED_FIELDS covers all 8 spec types
 *  11.  Article checks headline + datePublished
 *  12.  BreadcrumbList checks itemListElement
 *  13.  FAQPage checks mainEntity
 *  14.  Multiple missing fields all reported
 *  15.  Root JSON array (not object) returns invalid_json error
 *  16.  ActionLog: schema-validator:start + :complete
 *  17.  ActionLog: schema-validator:blocked when errors present
 *  18.  ActionLog: NOT blocked when only warnings
 *  19.  Warnings do not count in error_count
 *  20.  error_count is sum across all blocks
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runSchemaValidator,
  validateBlock,
  applyDuplicateTypeWarnings,
  REQUIRED_FIELDS,
  type SchemaRequest,
} from './schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureStdout(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return fn().finally(() => { process.stdout.write = orig; }).then(() => captured);
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

function req(overrides: Partial<SchemaRequest> = {}): SchemaRequest {
  return {
    run_id:        'run-sch-v-001',
    tenant_id:     't-aaa',
    site_id:       's-bbb',
    url:           'https://cococabanalife.com/products/sun-glow-bikini',
    schema_blocks: [],
    ...overrides,
  };
}

// ── Valid JSON-LD fixtures ────────────────────────────────────────────────────

const VALID_PRODUCT = JSON.stringify({
  '@context': 'https://schema.org',
  '@type':    'Product',
  name:       'Sun Glow Bikini',
  offers:     { '@type': 'Offer', price: 49.99, priceCurrency: 'USD' },
});

const VALID_ARTICLE = JSON.stringify({
  '@context':     'https://schema.org',
  '@type':        'Article',
  headline:       'Top 10 Beach Styles',
  datePublished:  '2026-03-01',
});

const VALID_FAQPAGE = JSON.stringify({
  '@context':  'https://schema.org',
  '@type':     'FAQPage',
  mainEntity:  [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }],
});

const VALID_ORG = JSON.stringify({
  '@context': 'https://schema.org',
  '@type':    'Organization',
  name:       'Coco Cabana',
  url:        'https://cococabanalife.com',
});

// ── REQUIRED_FIELDS ───────────────────────────────────────────────────────────

describe('REQUIRED_FIELDS', () => {
  const specTypes = [
    'Organization', 'WebSite', 'Product', 'Article',
    'BreadcrumbList', 'FAQPage', 'Person', 'LocalBusiness',
  ] as const;

  it('covers all 8 spec types', () => {
    for (const t of specTypes) {
      assert.ok(t in REQUIRED_FIELDS, `missing entry for ${t}`);
      assert.ok(Array.isArray(REQUIRED_FIELDS[t]) && REQUIRED_FIELDS[t].length > 0);
    }
  });

  it('Product requires name and offers', () => {
    assert.ok(REQUIRED_FIELDS['Product'].includes('name'));
    assert.ok(REQUIRED_FIELDS['Product'].includes('offers'));
  });

  it('Article requires headline and datePublished', () => {
    assert.ok(REQUIRED_FIELDS['Article'].includes('headline'));
    assert.ok(REQUIRED_FIELDS['Article'].includes('datePublished'));
  });
});

// ── validateBlock — JSON parse ────────────────────────────────────────────────

describe('validateBlock — JSON parse', () => {
  it('valid JSON sets valid_json=true', () => {
    const b = validateBlock(VALID_PRODUCT);
    assert.equal(b.valid_json, true);
    assert.ok(!b.errors.includes('invalid_json'));
  });

  it('invalid JSON sets valid_json=false without throwing', () => {
    assert.doesNotThrow(() => {
      const b = validateBlock('{not valid json');
      assert.equal(b.valid_json, false);
      assert.ok(b.errors.includes('invalid_json'));
    });
  });

  it('JSON array at root sets valid_json=false', () => {
    const b = validateBlock('[{"@type":"Product"}]');
    assert.equal(b.valid_json, false);
    assert.ok(b.errors.some((e) => e.includes('invalid_json')));
  });

  it('empty string returns valid_json=false', () => {
    const b = validateBlock('');
    assert.equal(b.valid_json, false);
  });

  it('invalid JSON sets raw correctly', () => {
    const raw = '{bad json here';
    const b   = validateBlock(raw);
    assert.equal(b.raw, raw);
  });

  it('invalid JSON short-circuits — no further checks run', () => {
    const b = validateBlock('BROKEN');
    assert.equal(b.errors.length, 1, 'only the invalid_json error');
    assert.equal(b.has_context,   false);
    assert.equal(b.has_type,      false);
  });
});

// ── validateBlock — @context + @type ────────────────────────────────────────

describe('validateBlock — @context and @type', () => {
  it('block with both sets has_context=true and has_type=true', () => {
    const b = validateBlock(VALID_PRODUCT);
    assert.equal(b.has_context, true);
    assert.equal(b.has_type,    true);
  });

  it('missing @context adds error', () => {
    const raw = JSON.stringify({ '@type': 'Product', name: 'X', offers: {} });
    const b   = validateBlock(raw);
    assert.equal(b.has_context, false);
    assert.ok(b.errors.includes('missing_@context'));
  });

  it('missing @type adds error', () => {
    const raw = JSON.stringify({ '@context': 'https://schema.org', name: 'X' });
    const b   = validateBlock(raw);
    assert.equal(b.has_type, false);
    assert.ok(b.errors.includes('missing_@type'));
  });

  it('schema_type is "unknown" when @type missing', () => {
    const raw = JSON.stringify({ '@context': 'https://schema.org', name: 'X' });
    const b   = validateBlock(raw);
    assert.equal(b.schema_type, 'unknown');
  });

  it('schema_type reflects @type value', () => {
    const b = validateBlock(VALID_PRODUCT);
    assert.equal(b.schema_type, 'Product');
  });
});

// ── validateBlock — required fields ──────────────────────────────────────────

describe('validateBlock — required field checks', () => {
  it('Product with all required fields → no errors', () => {
    const b = validateBlock(VALID_PRODUCT);
    assert.equal(b.errors.length,         0);
    assert.equal(b.missing_fields.length, 0);
  });

  it('Product missing offers → missing_fields includes offers', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Product',
      name:       'Sun Glow Bikini',
      // offers intentionally absent
    });
    const b = validateBlock(raw);
    assert.ok(b.missing_fields.includes('offers'));
    assert.ok(b.errors.some((e) => e.includes('offers')));
  });

  it('Product missing name + offers → both in missing_fields', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Product',
    });
    const b = validateBlock(raw);
    assert.ok(b.missing_fields.includes('name'));
    assert.ok(b.missing_fields.includes('offers'));
    assert.equal(b.missing_fields.length, 2);
  });

  it('Article missing datePublished → error', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Article',
      headline:   'Top 10 Beach Styles',
    });
    const b = validateBlock(raw);
    assert.ok(b.missing_fields.includes('datePublished'));
  });

  it('BreadcrumbList missing itemListElement → error', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
    });
    const b = validateBlock(raw);
    assert.ok(b.missing_fields.includes('itemListElement'));
  });

  it('FAQPage missing mainEntity → error', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'FAQPage',
    });
    const b = validateBlock(raw);
    assert.ok(b.missing_fields.includes('mainEntity'));
  });

  it('unknown @type → no errors, one warning', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'VideoObject',
      name:       'Promo Video',
    });
    const b = validateBlock(raw);
    assert.equal(b.errors.length, 0, 'unknown type should not error');
    assert.ok(b.warnings.includes('unknown_type_not_validated'));
  });
});

// ── applyDuplicateTypeWarnings ────────────────────────────────────────────────

describe('applyDuplicateTypeWarnings', () => {
  it('adds warning to both blocks when @type duplicated', () => {
    const b1 = validateBlock(VALID_PRODUCT);
    const b2 = validateBlock(VALID_PRODUCT);
    applyDuplicateTypeWarnings([b1, b2]);
    assert.ok(b1.warnings.includes('duplicate_schema_type_Product'));
    assert.ok(b2.warnings.includes('duplicate_schema_type_Product'));
  });

  it('does not add warning when @types are all unique', () => {
    const b1 = validateBlock(VALID_PRODUCT);
    const b2 = validateBlock(VALID_ARTICLE);
    applyDuplicateTypeWarnings([b1, b2]);
    assert.ok(!b1.warnings.some((w) => w.startsWith('duplicate_schema_type')));
    assert.ok(!b2.warnings.some((w) => w.startsWith('duplicate_schema_type')));
  });

  it('does not mark unknown-type blocks as duplicates of each other', () => {
    const raw  = JSON.stringify({ '@context': 'https://schema.org' }); // no @type
    const b1   = validateBlock(raw);
    const b2   = validateBlock(raw);
    applyDuplicateTypeWarnings([b1, b2]);
    // unknown blocks should not generate duplicate warning
    assert.ok(!b1.warnings.some((w) => w.startsWith('duplicate_schema_type')));
  });
});

// ── runSchemaValidator — overall passed ───────────────────────────────────────

describe('runSchemaValidator — passed logic', () => {
  it('passed=true for single valid Product block', async () => {
    const r = await runSchemaValidator(req({ schema_blocks: [VALID_PRODUCT] }));
    assert.equal(r.passed,      true);
    assert.equal(r.error_count, 0);
    assert.equal(r.validated_blocks.length, 1);
  });

  it('passed=false when any block has errors', async () => {
    const invalid = '{bad json}';
    const r = await runSchemaValidator(req({ schema_blocks: [VALID_PRODUCT, invalid] }));
    assert.equal(r.passed, false);
    assert.ok(r.error_count > 0);
  });

  it('passed=true when only warnings present (unknown type)', async () => {
    const unknownType = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'VideoObject',
      name:       'Promo',
    });
    const r = await runSchemaValidator(req({ schema_blocks: [unknownType] }));
    assert.equal(r.passed, true, 'warnings should not block');
    assert.equal(r.error_count, 0);
  });

  it('passed=true when only duplicate warnings present', async () => {
    const r = await runSchemaValidator(req({
      schema_blocks: [VALID_PRODUCT, VALID_PRODUCT],
    }));
    // Duplicate warning — but no errors — should still pass
    assert.equal(r.passed, true);
    assert.equal(r.error_count, 0);
    assert.ok(r.validated_blocks[0].warnings.includes('duplicate_schema_type_Product'));
  });

  it('passed=false when Product missing offers', async () => {
    const noOffers = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Product',
      name:       'Sun Glow Bikini',
    });
    const r = await runSchemaValidator(req({ schema_blocks: [noOffers] }));
    assert.equal(r.passed, false);
    assert.ok(r.error_count > 0);
  });

  it('error_count is sum across all blocks', async () => {
    const noOffers  = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'X' });
    const badJson   = 'BROKEN';
    const r = await runSchemaValidator(req({ schema_blocks: [noOffers, badJson] }));
    // noOffers has 1 error (offers), badJson has 1 error (invalid_json)
    assert.equal(r.error_count, 2);
  });

  it('empty schema_blocks → passed=true, no blocks', async () => {
    const r = await runSchemaValidator(req({ schema_blocks: [] }));
    assert.equal(r.passed, true);
    assert.equal(r.validated_blocks.length, 0);
    assert.equal(r.error_count, 0);
  });

  it('multiple valid blocks → passed=true', async () => {
    const r = await runSchemaValidator(req({
      schema_blocks: [VALID_PRODUCT, VALID_ARTICLE, VALID_FAQPAGE],
    }));
    assert.equal(r.passed,      true);
    assert.equal(r.error_count, 0);
    assert.equal(r.validated_blocks.length, 3);
  });
});

// ── runSchemaValidator — result shape ─────────────────────────────────────────

describe('runSchemaValidator — result shape', () => {
  it('result has run_id, tenant_id, url', async () => {
    const r = await runSchemaValidator(req({ schema_blocks: [VALID_PRODUCT] }));
    assert.equal(r.run_id,    'run-sch-v-001');
    assert.equal(r.tenant_id, 't-aaa');
    assert.equal(r.url,       req().url);
  });

  it('ValidatedBlock has raw field matching input', async () => {
    const r = await runSchemaValidator(req({ schema_blocks: [VALID_PRODUCT] }));
    assert.equal(r.validated_blocks[0].raw, VALID_PRODUCT);
  });

  it('one valid Product + one invalid FAQPage → mixed result', async () => {
    const invalidFaq = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'FAQPage',
      // mainEntity intentionally missing
    });
    const r = await runSchemaValidator(req({
      schema_blocks: [VALID_PRODUCT, invalidFaq],
    }));
    assert.equal(r.passed, false);
    assert.equal(r.validated_blocks.length, 2);

    const productBlock = r.validated_blocks.find((b) => b.schema_type === 'Product');
    const faqBlock     = r.validated_blocks.find((b) => b.schema_type === 'FAQPage');

    assert.ok(productBlock,             'Product block expected');
    assert.equal(productBlock!.errors.length, 0);
    assert.ok(faqBlock,                 'FAQPage block expected');
    assert.ok(faqBlock!.missing_fields.includes('mainEntity'));
  });
});

// ── ActionLog ────────────────────────────────────────────────────────────────

describe('runSchemaValidator — ActionLog', () => {
  it('writes schema-validator:start and :complete on success', async () => {
    const lines   = await captureStdout(async () => {
      await runSchemaValidator(req({ schema_blocks: [VALID_PRODUCT] }));
    });
    const entries = parseLines(lines);
    const start   = entries.find((e) => e['stage'] === 'schema-validator:start');
    const complete = entries.find((e) => e['stage'] === 'schema-validator:complete');

    assert.ok(start,    'schema-validator:start expected');
    assert.ok(complete, 'schema-validator:complete expected');
    assert.equal(complete!['status'], 'ok');

    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['passed'],      true);
    assert.equal(meta['error_count'], 0);
  });

  it('writes schema-validator:blocked when any block fails', async () => {
    const noOffers = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Product',
      name:       'Sun Glow Bikini',
    });
    const lines   = await captureStdout(async () => {
      await runSchemaValidator(req({ schema_blocks: [noOffers] }));
    });
    const entries = parseLines(lines);
    const blocked = entries.find((e) => e['stage'] === 'schema-validator:blocked');

    assert.ok(blocked, 'schema-validator:blocked expected');
    assert.equal(blocked!['status'], 'failed');

    const meta        = blocked!['metadata'] as Record<string, unknown>;
    const failedBlocks = meta['failed_blocks'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(failedBlocks) && failedBlocks.length > 0);
    assert.equal(failedBlocks[0]['type'], 'Product');
  });

  it('does NOT write :blocked when only warnings present', async () => {
    const unknownType = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'VideoObject',
      name:       'Promo',
    });
    const lines   = await captureStdout(async () => {
      await runSchemaValidator(req({ schema_blocks: [unknownType] }));
    });
    const entries = parseLines(lines);
    const blocked = entries.find((e) => e['stage'] === 'schema-validator:blocked');
    assert.ok(!blocked, 'blocked should not fire for warnings-only result');
  });

  it('ActionLog complete for blocked Product page matches spec', async () => {
    const noOffers = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Product',
      name:       'Sun Glow Bikini',
    });
    const lines   = await captureStdout(async () => {
      await runSchemaValidator(req({ schema_blocks: [noOffers] }));
    });
    const entries  = parseLines(lines);
    const complete = entries.find((e) => e['stage'] === 'schema-validator:complete');
    const blocked  = entries.find((e) => e['stage'] === 'schema-validator:blocked');

    assert.ok(complete);
    assert.equal(complete!['status'],    'failed');
    assert.equal(complete!['run_id'],    'run-sch-v-001');
    assert.equal(complete!['tenant_id'], 't-aaa');
    assert.equal(complete!['command'],   'schema-validator');

    const completeMeta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(completeMeta['passed'],      false);
    assert.equal(completeMeta['error_count'], 1);
    assert.deepEqual(completeMeta['failed_types'], ['Product']);

    assert.ok(blocked);
    const blockedMeta  = blocked!['metadata'] as Record<string, unknown>;
    const failedBlocks = blockedMeta['failed_blocks'] as Array<Record<string, unknown>>;
    assert.equal(failedBlocks[0]['type'], 'Product');
    const errors = failedBlocks[0]['errors'] as string[];
    assert.ok(errors.some((e) => e.includes('offers')));
  });
});
