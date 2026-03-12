import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShopifyOnboardingState,
  advanceShopifyOnboarding,
  getShopifyOnboardingProgress,
  buildShopifyInstallUrl,
} from './shopify_onboarding.js';

// ── buildShopifyOnboardingState ─────────────────────────────────────────────

describe('buildShopifyOnboardingState', () => {
  it('starts at enter_domain', () => {
    const s = buildShopifyOnboardingState();
    assert.equal(s.step, 'enter_domain');
  });

  it('connection_verified is false', () => {
    assert.equal(buildShopifyOnboardingState().connection_verified, false);
  });

  it('scopes_granted is empty', () => {
    assert.deepEqual(buildShopifyOnboardingState().scopes_granted, []);
  });

  it('has no error', () => {
    assert.equal(buildShopifyOnboardingState().error, undefined);
  });
});

// ── advanceShopifyOnboarding ────────────────────────────────────────────────

describe('advanceShopifyOnboarding', () => {
  it('advances from enter_domain to install_app', () => {
    const s = buildShopifyOnboardingState();
    const next = advanceShopifyOnboarding(s, { shop_domain: 'test.myshopify.com' });
    assert.equal(next.step, 'install_app');
    assert.equal(next.shop_domain, 'test.myshopify.com');
  });

  it('advances from install_app to authorize_oauth', () => {
    const s = { ...buildShopifyOnboardingState(), step: 'install_app' as const };
    const next = advanceShopifyOnboarding(s, {});
    assert.equal(next.step, 'authorize_oauth');
  });

  it('advances from authorize_oauth to verify_connection', () => {
    const s = { ...buildShopifyOnboardingState(), step: 'authorize_oauth' as const };
    const next = advanceShopifyOnboarding(s, { access_token: 'shpat_xxx' });
    assert.equal(next.step, 'verify_connection');
    assert.equal(next.access_token, 'shpat_xxx');
  });

  it('advances to complete and sets completed_at', () => {
    const s = { ...buildShopifyOnboardingState(), step: 'register_site' as const };
    const next = advanceShopifyOnboarding(s, { site_id: 'site_123' });
    assert.equal(next.step, 'complete');
    assert.ok(next.completed_at);
  });

  it('does not advance past complete', () => {
    const s = { ...buildShopifyOnboardingState(), step: 'complete' as const };
    const next = advanceShopifyOnboarding(s, {});
    assert.equal(next.step, 'complete');
  });

  it('merges scopes_granted', () => {
    const s = buildShopifyOnboardingState();
    const next = advanceShopifyOnboarding(s, { scopes_granted: ['read_products', 'write_content'] });
    assert.deepEqual(next.scopes_granted, ['read_products', 'write_content']);
  });

  it('preserves error from result', () => {
    const s = buildShopifyOnboardingState();
    const next = advanceShopifyOnboarding(s, { error: 'Failed' });
    assert.equal(next.error, 'Failed');
  });

  it('never throws on null state', () => {
    assert.doesNotThrow(() => advanceShopifyOnboarding(null as any, {}));
  });
});

// ── getShopifyOnboardingProgress ────────────────────────────────────────────

describe('getShopifyOnboardingProgress', () => {
  it('returns step 1 for enter_domain', () => {
    const p = getShopifyOnboardingProgress(buildShopifyOnboardingState());
    assert.equal(p.step_number, 1);
    assert.equal(p.percent, 0);
  });

  it('returns 100% for complete', () => {
    const s = { ...buildShopifyOnboardingState(), step: 'complete' as const };
    const p = getShopifyOnboardingProgress(s);
    assert.equal(p.percent, 100);
  });

  it('total_steps is 6', () => {
    assert.equal(getShopifyOnboardingProgress(buildShopifyOnboardingState()).total_steps, 6);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getShopifyOnboardingProgress(null as any));
  });
});

// ── buildShopifyInstallUrl ──────────────────────────────────────────────────

describe('buildShopifyInstallUrl', () => {
  it('includes shop domain', () => {
    const url = buildShopifyInstallUrl('test.myshopify.com', 'id', 'https://cb.com', ['read_products']);
    assert.ok(url.includes('test.myshopify.com'));
  });

  it('includes client_id', () => {
    const url = buildShopifyInstallUrl('test.myshopify.com', 'my_client', 'https://cb.com', []);
    assert.ok(url.includes('my_client'));
  });

  it('includes redirect_uri', () => {
    const url = buildShopifyInstallUrl('test.myshopify.com', 'id', 'https://cb.com/auth', []);
    assert.ok(url.includes(encodeURIComponent('https://cb.com/auth')));
  });

  it('includes scopes joined by comma', () => {
    const url = buildShopifyInstallUrl('s.myshopify.com', 'id', 'https://cb.com', ['read_products', 'write_content']);
    assert.ok(url.includes(encodeURIComponent('read_products,write_content')));
  });

  it('starts with https://', () => {
    const url = buildShopifyInstallUrl('s.myshopify.com', 'id', 'https://cb.com', []);
    assert.ok(url.startsWith('https://'));
  });

  it('includes state nonce', () => {
    const url = buildShopifyInstallUrl('s.myshopify.com', 'id', 'https://cb.com', []);
    assert.ok(url.includes('state='));
  });

  it('never throws on empty args', () => {
    assert.doesNotThrow(() => buildShopifyInstallUrl('', '', '', []));
  });
});
