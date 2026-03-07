/**
 * packages/validators/src/index.test.ts
 *
 * Unit tests for the @vaeo/validators unified ladder.
 * All external HTTP calls are injected — no real network required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateSchema,
  validateLighthouse,
  validateW3c,
  runValidators,
  type LighthouseFetcher,
  type W3cFetcher,
} from './index.js';

// ── validateSchema ─────────────────────────────────────────────────────────────

describe('validateSchema', () => {
  it('valid Product schema → passes', () => {
    const block = JSON.stringify({ '@type': 'Product', name: 'Widget', offers: { '@type': 'Offer', price: 9.99 } });
    const result = validateSchema([block]);
    assert.equal(result.passed, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.validator, 'schema');
  });

  it('invalid JSON block → fails with parse error', () => {
    const result = validateSchema(['not valid json {{{']);
    assert.equal(result.passed, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0]!.includes('invalid JSON'));
  });

  it('Product missing required field "offers" → fails', () => {
    const block = JSON.stringify({ '@type': 'Product', name: 'Widget' }); // missing offers
    const result = validateSchema([block]);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some(e => e.includes('offers')));
  });

  it('unknown @type → passes (only @type itself required)', () => {
    const block = JSON.stringify({ '@type': 'UnknownCustomType', someProp: 'value' });
    const result = validateSchema([block]);
    assert.equal(result.passed, true);
    assert.deepEqual(result.errors, []);
  });
});

// ── validateW3c ────────────────────────────────────────────────────────────────

describe('validateW3c', () => {
  it('valid HTML (no errors) → passes', async () => {
    const fetcher: W3cFetcher = async () => ({
      ok: true,
      json: async () => ({ messages: [] }),
    });
    const result = await validateW3c('<!DOCTYPE html><html><body></body></html>', fetcher);
    assert.equal(result.passed, true);
    assert.equal(result.error_count, 0);
    assert.equal(result.skipped, undefined);
    assert.equal(result.validator, 'w3c');
  });

  it('HTML with error messages → fails', async () => {
    const fetcher: W3cFetcher = async () => ({
      ok: true,
      json: async () => ({
        messages: [
          { type: 'error', message: 'Element "foo" not allowed here.' },
          { type: 'warning', message: 'Consider adding a "lang" attribute.' },
        ],
      }),
    });
    const result = await validateW3c('<html><body><foo/></body></html>', fetcher);
    assert.equal(result.passed, false);
    assert.equal(result.error_count, 1);
    assert.equal(result.warning_count, 1);
  });

  it('fetcher throws (timeout/network error) → skipped, passed: true', async () => {
    const fetcher: W3cFetcher = async () => {
      throw new Error('AbortError: The user aborted a request.');
    };
    const result = await validateW3c('<html></html>', fetcher);
    assert.equal(result.passed, true);
    assert.equal(result.skipped, true);
    assert.equal(result.error_count, 0);
  });
});

// ── validateLighthouse ─────────────────────────────────────────────────────────

describe('validateLighthouse', () => {
  it('missing PAGESPEED_API_KEY → skipped, passed: true', async () => {
    const saved = process.env['PAGESPEED_API_KEY'];
    delete process.env['PAGESPEED_API_KEY'];
    try {
      const result = await validateLighthouse('https://example.com');
      assert.equal(result.passed, true);
      assert.equal(result.skipped, true);
      assert.equal(result.validator, 'lighthouse');
    } finally {
      if (saved !== undefined) process.env['PAGESPEED_API_KEY'] = saved;
    }
  });
});

// ── runValidators ──────────────────────────────────────────────────────────────

describe('runValidators', () => {
  it('all validators pass → result.passed=true, blocked_by=[]', async () => {
    const block = JSON.stringify({
      '@type': 'Organization',
      name: 'VAEO',
      url: 'https://vaeo.com',
    });
    // No PAGESPEED_API_KEY → lighthouse auto-skips (passes)
    // No html → w3c skipped (passes)
    const saved = process.env['PAGESPEED_API_KEY'];
    delete process.env['PAGESPEED_API_KEY'];
    try {
      const result = await runValidators({
        url:           'https://example.com',
        schema_blocks: [block],
        run_lighthouse: false,
      });
      assert.equal(result.passed, true);
      assert.deepEqual(result.blocked_by, []);
      assert.ok(result.run_at);
    } finally {
      if (saved !== undefined) process.env['PAGESPEED_API_KEY'] = saved;
    }
  });

  it('schema fails → result.passed=false, blocked_by includes "schema"', async () => {
    const block = JSON.stringify({ '@type': 'Product', name: 'Widget' }); // missing offers
    const result = await runValidators({
      url:           'https://example.com',
      schema_blocks: [block],
      run_lighthouse: false,
    });
    assert.equal(result.passed, false);
    assert.ok(result.blocked_by.includes('schema'));
    assert.ok(result.validators.schema !== null);
    assert.equal(result.validators.schema?.passed, false);
  });
});
