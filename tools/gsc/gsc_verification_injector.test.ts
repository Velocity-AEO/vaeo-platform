/**
 * tools/gsc/gsc_verification_injector.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  injectVerificationTag,
  removeVerificationTag,
  isTagPresent,
  type VerificationInjectionConfig,
} from './gsc_verification_injector.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function config(platform: 'shopify' | 'wordpress' = 'shopify'): VerificationInjectionConfig {
  return {
    site_id:          'site_1',
    platform,
    verification_tag: 'vaeo-gsc-verify-site_1-acct_1',
    meta_tag_html:    '<meta name="google-site-verification" content="vaeo-gsc-verify-site_1-acct_1" />',
  };
}

const successFn = async () => ({ success: true });
const failFn    = async () => ({ success: false, error: 'inject failed' });
const throwFn   = async (): Promise<{ success: boolean }> => { throw new Error('boom'); };

// ── injectVerificationTag ─────────────────────────────────────────────────────

describe('injectVerificationTag', () => {
  it('calls shopifyInjectFn for shopify platform', async () => {
    let called = false;
    await injectVerificationTag(config('shopify'), {
      shopifyInjectFn: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('does NOT call wordpressInjectFn for shopify', async () => {
    let called = false;
    await injectVerificationTag(config('shopify'), {
      shopifyInjectFn:   successFn,
      wordpressInjectFn: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, false);
  });

  it('calls wordpressInjectFn for wordpress platform', async () => {
    let called = false;
    await injectVerificationTag(config('wordpress'), {
      wordpressInjectFn: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('returns success=true on success', async () => {
    const result = await injectVerificationTag(config(), { shopifyInjectFn: successFn });
    assert.equal(result.success, true);
  });

  it('sets injected_at on success', async () => {
    const result = await injectVerificationTag(config(), { shopifyInjectFn: successFn });
    assert.ok(result.injected_at?.includes('T'));
  });

  it('injected_at is null on failure', async () => {
    const result = await injectVerificationTag(config(), { shopifyInjectFn: failFn });
    assert.equal(result.injected_at, null);
  });

  it('returns success=false when inject fn returns failure', async () => {
    const result = await injectVerificationTag(config(), { shopifyInjectFn: failFn });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('inject failed'));
  });

  it('returns success=false when inject fn throws', async () => {
    const result = await injectVerificationTag(config(), { shopifyInjectFn: throwFn });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('boom'));
  });

  it('never throws when inject fn throws', async () => {
    await assert.doesNotReject(() =>
      injectVerificationTag(config(), { shopifyInjectFn: throwFn }),
    );
  });

  it('returns site_id on result', async () => {
    const result = await injectVerificationTag(config(), { shopifyInjectFn: successFn });
    assert.equal(result.site_id, 'site_1');
  });

  it('returns platform on result', async () => {
    const result = await injectVerificationTag(config('wordpress'), {
      wordpressInjectFn: successFn,
    });
    assert.equal(result.platform, 'wordpress');
  });
});

// ── removeVerificationTag ─────────────────────────────────────────────────────

describe('removeVerificationTag', () => {
  it('calls shopifyRemoveFn for shopify platform', async () => {
    let called = false;
    await removeVerificationTag(config('shopify'), {
      shopifyRemoveFn: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('calls wordpressRemoveFn for wordpress platform', async () => {
    let called = false;
    await removeVerificationTag(config('wordpress'), {
      wordpressRemoveFn: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('returns success=true when remove fn succeeds', async () => {
    const result = await removeVerificationTag(config(), { shopifyRemoveFn: successFn });
    assert.equal(result.success, true);
  });

  it('returns success=false when remove fn throws', async () => {
    const result = await removeVerificationTag(config(), { shopifyRemoveFn: throwFn });
    assert.equal(result.success, false);
  });

  it('never throws when remove fn throws', async () => {
    await assert.doesNotReject(() =>
      removeVerificationTag(config(), { shopifyRemoveFn: throwFn }),
    );
  });
});

// ── isTagPresent ──────────────────────────────────────────────────────────────

describe('isTagPresent', () => {
  it('returns true when tag is in HTML', () => {
    const html = '<head><meta name="google-site-verification" content="vaeo-token" /></head>';
    assert.equal(isTagPresent(html, 'vaeo-token'), true);
  });

  it('returns false when tag is missing', () => {
    const html = '<head><title>Test</title></head>';
    assert.equal(isTagPresent(html, 'vaeo-token'), false);
  });

  it('returns false when token present but not google-site-verification', () => {
    const html = '<head><meta name="other" content="vaeo-token" /></head>';
    assert.equal(isTagPresent(html, 'vaeo-token'), false);
  });

  it('returns false on empty html', () => {
    assert.equal(isTagPresent('', 'vaeo-token'), false);
  });

  it('returns false on empty token', () => {
    const html = '<meta name="google-site-verification" content="" />';
    assert.equal(isTagPresent(html, ''), false);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => isTagPresent(null as never, null as never));
  });
});
