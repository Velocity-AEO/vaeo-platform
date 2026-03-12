/**
 * apps/dashboard/lib/add_site_form_logic.test.ts
 *
 * Tests for add-client-site form logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialFormState,
  normalizeDomain,
  isValidDomain,
  isValidClientName,
  validateForm,
  hasErrors,
  buildPayload,
  getPlatformOptions,
  getSubmitButtonLabel,
  type AddSiteFormState,
} from './add_site_form_logic.js';

// ── buildInitialFormState ────────────────────────────────────────────────────

describe('buildInitialFormState', () => {
  it('returns empty domain and client_name', () => {
    const s = buildInitialFormState();
    assert.equal(s.domain, '');
    assert.equal(s.client_name, '');
  });

  it('defaults platform to shopify', () => {
    assert.equal(buildInitialFormState().platform, 'shopify');
  });

  it('starts not submitting', () => {
    assert.equal(buildInitialFormState().submitting, false);
  });

  it('starts with no error', () => {
    assert.equal(buildInitialFormState().error, null);
  });
});

// ── normalizeDomain ──────────────────────────────────────────────────────────

describe('normalizeDomain', () => {
  it('strips https://', () => {
    assert.equal(normalizeDomain('https://example.com'), 'example.com');
  });

  it('strips http://', () => {
    assert.equal(normalizeDomain('http://example.com'), 'example.com');
  });

  it('strips www.', () => {
    assert.equal(normalizeDomain('www.example.com'), 'example.com');
  });

  it('strips trailing path', () => {
    assert.equal(normalizeDomain('example.com/page'), 'example.com');
  });

  it('lowercases', () => {
    assert.equal(normalizeDomain('EXAMPLE.COM'), 'example.com');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeDomain('  example.com  '), 'example.com');
  });

  it('returns empty for null', () => {
    assert.equal(normalizeDomain(null as any), '');
  });

  it('handles full URL with www and path', () => {
    assert.equal(normalizeDomain('https://www.example.com/page'), 'example.com');
  });
});

// ── isValidDomain ────────────────────────────────────────────────────────────

describe('isValidDomain', () => {
  it('accepts valid domain', () => {
    assert.equal(isValidDomain('example.com'), true);
  });

  it('accepts subdomain', () => {
    assert.equal(isValidDomain('shop.example.com'), true);
  });

  it('rejects empty', () => {
    assert.equal(isValidDomain(''), false);
  });

  it('rejects no TLD', () => {
    assert.equal(isValidDomain('example'), false);
  });

  it('rejects spaces', () => {
    assert.equal(isValidDomain('example .com'), false);
  });

  it('accepts domain with https prefix (normalizes)', () => {
    assert.equal(isValidDomain('https://example.com'), true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isValidDomain(null as any));
  });
});

// ── isValidClientName ────────────────────────────────────────────────────────

describe('isValidClientName', () => {
  it('accepts normal name', () => {
    assert.equal(isValidClientName('Acme Corp'), true);
  });

  it('rejects empty', () => {
    assert.equal(isValidClientName(''), false);
  });

  it('rejects whitespace-only', () => {
    assert.equal(isValidClientName('   '), false);
  });

  it('rejects over 100 chars', () => {
    assert.equal(isValidClientName('a'.repeat(101)), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isValidClientName(null as any));
  });
});

// ── validateForm ─────────────────────────────────────────────────────────────

describe('validateForm', () => {
  const valid: AddSiteFormState = {
    domain: 'example.com',
    platform: 'shopify',
    client_name: 'Acme',
    submitting: false,
    error: null,
  };

  it('returns no errors for valid form', () => {
    const errs = validateForm(valid);
    assert.equal(errs.domain, null);
    assert.equal(errs.client_name, null);
  });

  it('flags empty domain', () => {
    const errs = validateForm({ ...valid, domain: '' });
    assert.ok(errs.domain);
  });

  it('flags invalid domain', () => {
    const errs = validateForm({ ...valid, domain: 'not-a-domain' });
    assert.ok(errs.domain);
  });

  it('flags empty client_name', () => {
    const errs = validateForm({ ...valid, client_name: '' });
    assert.ok(errs.client_name);
  });
});

// ── hasErrors ────────────────────────────────────────────────────────────────

describe('hasErrors', () => {
  it('returns false when no errors', () => {
    assert.equal(hasErrors({ domain: null, client_name: null }), false);
  });

  it('returns true when domain error', () => {
    assert.equal(hasErrors({ domain: 'bad', client_name: null }), true);
  });

  it('returns true when client_name error', () => {
    assert.equal(hasErrors({ domain: null, client_name: 'bad' }), true);
  });
});

// ── buildPayload ─────────────────────────────────────────────────────────────

describe('buildPayload', () => {
  it('normalizes domain in payload', () => {
    const state: AddSiteFormState = {
      domain: 'https://www.Example.COM/page',
      platform: 'wordpress',
      client_name: '  Acme  ',
      submitting: false,
      error: null,
    };
    const p = buildPayload(state);
    assert.equal(p.domain, 'example.com');
    assert.equal(p.platform, 'wordpress');
    assert.equal(p.client_name, 'Acme');
  });

  it('never throws on null state', () => {
    assert.doesNotThrow(() => buildPayload(null as any));
  });
});

// ── getPlatformOptions ───────────────────────────────────────────────────────

describe('getPlatformOptions', () => {
  it('returns 3 options', () => {
    assert.equal(getPlatformOptions().length, 3);
  });

  it('includes shopify', () => {
    assert.ok(getPlatformOptions().some(o => o.value === 'shopify'));
  });
});

// ── getSubmitButtonLabel ─────────────────────────────────────────────────────

describe('getSubmitButtonLabel', () => {
  it('returns Adding… when submitting', () => {
    assert.equal(getSubmitButtonLabel(true), 'Adding…');
  });

  it('returns Add Site when not submitting', () => {
    assert.equal(getSubmitButtonLabel(false), 'Add Site');
  });
});
