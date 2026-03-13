/**
 * tools/link_graph/external_link_fixer.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExternalLinkFix,
  applyExternalLinkFix,
  type ExternalLinkFix,
} from './external_link_fixer.js';
import type { ExternalLinkCheckResult } from './external_link_checker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCheck(overrides: Partial<ExternalLinkCheckResult> = {}): ExternalLinkCheckResult {
  return {
    url:                'https://example.com/page',
    destination_url:    'https://target.com/resource',
    destination_domain: 'target.com',
    status_code:        200,
    is_broken:          false,
    is_redirect:        false,
    final_url:          null,
    redirect_hops:      0,
    response_time_ms:   100,
    is_nofollow:        false,
    domain_reputation:  'unknown',
    check_error:        null,
    checked_at:         new Date().toISOString(),
    ...overrides,
  };
}

// ── buildExternalLinkFix ──────────────────────────────────────────────────────

describe('buildExternalLinkFix', () => {
  it('returns remove_link for broken link (404)', () => {
    const check = makeCheck({ is_broken: true, status_code: 404 });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.fix_type, 'remove_link');
  });

  it('returns remove_link for broken link (network error)', () => {
    const check = makeCheck({ is_broken: true, status_code: null, check_error: 'ECONNREFUSED' });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.fix_type, 'remove_link');
  });

  it('remove_link includes status code in reason', () => {
    const check = makeCheck({ is_broken: true, status_code: 404 });
    const fix = buildExternalLinkFix(check, '');
    assert.ok(fix?.reason.includes('404'));
  });

  it('remove_link has null replacement_href', () => {
    const check = makeCheck({ is_broken: true, status_code: 404 });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.replacement_href, null);
  });

  it('returns update_to_final_url for redirect with final_url', () => {
    const check = makeCheck({ is_redirect: true, final_url: 'https://new.com/', redirect_hops: 2 });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.fix_type, 'update_to_final_url');
  });

  it('update_to_final_url sets replacement_href to final_url', () => {
    const check = makeCheck({ is_redirect: true, final_url: 'https://new.com/', redirect_hops: 1 });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.replacement_href, 'https://new.com/');
  });

  it('update_to_final_url reason mentions hops (plural)', () => {
    const check = makeCheck({ is_redirect: true, final_url: 'https://new.com/', redirect_hops: 3 });
    const fix = buildExternalLinkFix(check, '');
    assert.ok(fix?.reason.includes('hops'));
  });

  it('update_to_final_url reason mentions hop (singular)', () => {
    const check = makeCheck({ is_redirect: true, final_url: 'https://new.com/', redirect_hops: 1 });
    const fix = buildExternalLinkFix(check, '');
    assert.ok(fix?.reason.includes('hop'));
    assert.ok(!fix?.reason.includes('hops'));
  });

  it('returns add_nofollow for low_value domain without nofollow', () => {
    const check = makeCheck({ domain_reputation: 'low_value', is_nofollow: false });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.fix_type, 'add_nofollow');
  });

  it('add_nofollow includes reason mentioning low-value', () => {
    const check = makeCheck({ domain_reputation: 'low_value', is_nofollow: false });
    const fix = buildExternalLinkFix(check, '');
    assert.ok(fix?.reason.toLowerCase().includes('low-value') || fix?.reason.toLowerCase().includes('low_value'));
  });

  it('returns null for trusted domain (no fix needed)', () => {
    const check = makeCheck({ domain_reputation: 'trusted', is_nofollow: false });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix, null);
  });

  it('returns null for low_value domain that already has nofollow', () => {
    const check = makeCheck({ domain_reputation: 'low_value', is_nofollow: true });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix, null);
  });

  it('returns null for healthy unknown domain', () => {
    const check = makeCheck({ domain_reputation: 'unknown', is_broken: false, is_redirect: false });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix, null);
  });

  it('fix includes source_url from check', () => {
    const check = makeCheck({ is_broken: true, status_code: 500, source_url: 'https://src.com/page' });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.source_url, 'https://src.com/page');
  });

  it('fix includes original_href as destination_url', () => {
    const check = makeCheck({ is_broken: true, status_code: 404, destination_url: 'https://dead.com/' });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.original_href, 'https://dead.com/');
  });

  it('broken takes priority over redirect', () => {
    const check = makeCheck({ is_broken: true, is_redirect: true, final_url: 'https://new.com/', status_code: 410 });
    const fix = buildExternalLinkFix(check, '');
    assert.equal(fix?.fix_type, 'remove_link');
  });

  it('never throws on null check', () => {
    assert.doesNotThrow(() => buildExternalLinkFix(null as any, ''));
  });

  it('never throws on null source_html', () => {
    assert.doesNotThrow(() => buildExternalLinkFix(makeCheck({ is_broken: true }), null as any));
  });
});

// ── applyExternalLinkFix ──────────────────────────────────────────────────────

describe('applyExternalLinkFix', () => {
  const makeFix = (overrides: Partial<ExternalLinkFix> = {}): ExternalLinkFix => ({
    source_url:       'https://src.com/',
    original_href:    'https://target.com/',
    fix_type:         'remove_link',
    replacement_href: null,
    reason:           'broken',
    ...overrides,
  });

  it('calls shopifyFn for shopify platform', async () => {
    let called = false;
    const result = await applyExternalLinkFix(makeFix(), 'site_1', 'shopify', {
      shopifyFn: async () => { called = true; return true; },
    });
    assert.equal(called, true);
    assert.equal(result, true);
  });

  it('calls wpFn for wordpress platform', async () => {
    let called = false;
    const result = await applyExternalLinkFix(makeFix(), 'site_1', 'wordpress', {
      wpFn: async () => { called = true; return true; },
    });
    assert.equal(called, true);
    assert.equal(result, true);
  });

  it('returns false when no platform handler provided', async () => {
    const result = await applyExternalLinkFix(makeFix(), 'site_1', 'shopify');
    assert.equal(result, false);
  });

  it('returns false when shopifyFn throws', async () => {
    const result = await applyExternalLinkFix(makeFix(), 'site_1', 'shopify', {
      shopifyFn: async () => { throw new Error('API error'); },
    });
    assert.equal(result, false);
  });

  it('returns false for null fix', async () => {
    const result = await applyExternalLinkFix(null as any, 'site_1', 'shopify', {
      shopifyFn: async () => true,
    });
    assert.equal(result, false);
  });

  it('returns false for empty site_id', async () => {
    const result = await applyExternalLinkFix(makeFix(), '', 'shopify', {
      shopifyFn: async () => true,
    });
    assert.equal(result, false);
  });

  it('returns shopifyFn result (false)', async () => {
    const result = await applyExternalLinkFix(makeFix(), 'site_1', 'shopify', {
      shopifyFn: async () => false,
    });
    assert.equal(result, false);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => applyExternalLinkFix(null as any, null as any, null as any));
  });
});
