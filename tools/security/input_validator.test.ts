/**
 * tools/security/input_validator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInput,
  COMMON_SCHEMAS,
  type ValidationSchema,
} from './input_validator.ts';

// ── string ────────────────────────────────────────────────────────────────────

describe('string validation', () => {
  const schema: ValidationSchema = { name: { type: 'string', required: true, min_length: 2, max_length: 10 } };

  it('passes valid string', () => {
    const r = validateInput({ name: 'Alice' }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.sanitized['name'], 'Alice');
  });

  it('fails when required field missing', () => {
    const r = validateInput({}, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors['name']);
  });

  it('fails when too short', () => {
    const r = validateInput({ name: 'A' }, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors['name']!.includes('2'));
  });

  it('fails when too long', () => {
    const r = validateInput({ name: 'A'.repeat(11) }, schema);
    assert.equal(r.valid, false);
  });

  it('strips HTML tags when sanitize=true', () => {
    const s: ValidationSchema = { bio: { type: 'string', sanitize: true } };
    const r = validateInput({ bio: '<b>hello</b> world' }, s);
    assert.equal(r.sanitized['bio'], 'hello world');
  });

  it('removes null bytes when sanitize=true', () => {
    const s: ValidationSchema = { val: { type: 'string', sanitize: true } };
    const r = validateInput({ val: 'abc\0def' }, s);
    assert.equal(r.sanitized['val'], 'abcdef');
  });

  it('validates against custom pattern', () => {
    const s: ValidationSchema = { code: { type: 'string', pattern: /^[A-Z]{3}$/ } };
    const ok  = validateInput({ code: 'ABC' }, s);
    const bad = validateInput({ code: 'abc' }, s);
    assert.equal(ok.valid, true);
    assert.equal(bad.valid, false);
  });
});

// ── uuid ──────────────────────────────────────────────────────────────────────

describe('uuid validation', () => {
  const schema: ValidationSchema = { id: { type: 'uuid', required: true } };

  it('accepts valid UUID', () => {
    const r = validateInput({ id: '550e8400-e29b-41d4-a716-446655440000' }, schema);
    assert.equal(r.valid, true);
  });

  it('rejects non-UUID string', () => {
    const r = validateInput({ id: 'not-a-uuid' }, schema);
    assert.equal(r.valid, false);
  });

  it('normalises UUID to lowercase', () => {
    const r = validateInput({ id: '550E8400-E29B-41D4-A716-446655440000' }, schema);
    assert.equal(r.sanitized['id'], '550e8400-e29b-41d4-a716-446655440000');
  });
});

// ── url ───────────────────────────────────────────────────────────────────────

describe('url validation', () => {
  const schema: ValidationSchema = { link: { type: 'url' } };

  it('accepts https URL', () => {
    const r = validateInput({ link: 'https://example.com/path' }, schema);
    assert.equal(r.valid, true);
  });

  it('accepts http URL', () => {
    const r = validateInput({ link: 'http://example.com' }, schema);
    assert.equal(r.valid, true);
  });

  it('rejects non-http/https URL', () => {
    const r = validateInput({ link: 'ftp://example.com' }, schema);
    assert.equal(r.valid, false);
  });

  it('rejects plain string without protocol', () => {
    const r = validateInput({ link: 'example.com' }, schema);
    assert.equal(r.valid, false);
  });
});

// ── email / domain ────────────────────────────────────────────────────────────

describe('email validation', () => {
  const schema: ValidationSchema = { email: { type: 'email' } };

  it('accepts valid email', () => {
    const r = validateInput({ email: 'user@example.com' }, schema);
    assert.equal(r.valid, true);
  });

  it('rejects email without @', () => {
    const r = validateInput({ email: 'notanemail' }, schema);
    assert.equal(r.valid, false);
  });

  it('lowercases email in sanitized output', () => {
    const r = validateInput({ email: 'USER@Example.COM' }, schema);
    assert.equal(r.sanitized['email'], 'user@example.com');
  });
});

describe('domain validation', () => {
  const schema: ValidationSchema = { domain: { type: 'domain' } };

  it('accepts valid domain', () => {
    const r = validateInput({ domain: 'example.myshopify.com' }, schema);
    assert.equal(r.valid, true);
  });

  it('rejects domain with protocol', () => {
    const r = validateInput({ domain: 'https://example.com' }, schema);
    assert.equal(r.valid, false);
  });

  it('rejects domain with path', () => {
    const r = validateInput({ domain: 'example.com/path' }, schema);
    assert.equal(r.valid, false);
  });
});

// ── number / boolean / array ──────────────────────────────────────────────────

describe('number validation', () => {
  const schema: ValidationSchema = { count: { type: 'number', min: 1, max: 100 } };

  it('accepts in-range number', () => {
    const r = validateInput({ count: 50 }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.sanitized['count'], 50);
  });

  it('rejects below min', () => {
    const r = validateInput({ count: 0 }, schema);
    assert.equal(r.valid, false);
  });

  it('rejects above max', () => {
    const r = validateInput({ count: 101 }, schema);
    assert.equal(r.valid, false);
  });
});

describe('boolean validation', () => {
  it('accepts true/false', () => {
    const s: ValidationSchema = { flag: { type: 'boolean' } };
    assert.equal(validateInput({ flag: true }, s).valid, true);
    assert.equal(validateInput({ flag: false }, s).valid, true);
  });

  it('rejects string "true"', () => {
    const s: ValidationSchema = { flag: { type: 'boolean' } };
    assert.equal(validateInput({ flag: 'true' }, s).valid, false);
  });
});

describe('array validation', () => {
  const schema: ValidationSchema = { ids: { type: 'array', min: 1, max: 3 } };

  it('accepts valid array', () => {
    const r = validateInput({ ids: ['a', 'b'] }, schema);
    assert.equal(r.valid, true);
  });

  it('rejects empty array when min=1', () => {
    const r = validateInput({ ids: [] }, schema);
    assert.equal(r.valid, false);
  });

  it('rejects oversized array', () => {
    const r = validateInput({ ids: [1, 2, 3, 4] }, schema);
    assert.equal(r.valid, false);
  });
});

// ── COMMON_SCHEMAS ────────────────────────────────────────────────────────────

describe('COMMON_SCHEMAS', () => {
  it('SITE_REGISTRATION accepts valid input', () => {
    const r = validateInput(
      { shop_domain: 'store.myshopify.com', tenant_id: '550e8400-e29b-41d4-a716-446655440000' },
      COMMON_SCHEMAS['SITE_REGISTRATION']!,
    );
    assert.equal(r.valid, true);
  });

  it('CRAWL_REQUEST accepts valid input', () => {
    const r = validateInput(
      { site_id: '550e8400-e29b-41d4-a716-446655440000', max_urls: 200 },
      COMMON_SCHEMAS['CRAWL_REQUEST']!,
    );
    assert.equal(r.valid, true);
  });

  it('FIX_APPROVAL rejects invalid action', () => {
    const r = validateInput(
      { site_id: '550e8400-e29b-41d4-a716-446655440000', fix_id: '550e8400-e29b-41d4-a716-446655440001', action: 'delete' },
      COMMON_SCHEMAS['FIX_APPROVAL']!,
    );
    assert.equal(r.valid, false);
  });

  it('API_KEY rejects short key', () => {
    const r = validateInput({ key: 'short' }, COMMON_SCHEMAS['API_KEY']!);
    assert.equal(r.valid, false);
  });

  it('collects multiple errors simultaneously', () => {
    const r = validateInput({}, COMMON_SCHEMAS['SITE_REGISTRATION']!);
    assert.equal(r.valid, false);
    assert.ok(r.errors['shop_domain']);
    assert.ok(r.errors['tenant_id']);
    assert.equal(Object.keys(r.errors).length, 2);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => validateInput(null as any, COMMON_SCHEMAS['CRAWL_REQUEST']!));
  });
});
