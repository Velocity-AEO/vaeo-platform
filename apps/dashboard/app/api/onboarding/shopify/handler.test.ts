import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleShopifyOnboarding, OnboardingDeps } from './handler.ts';

const TENANT = '00000000-0000-0000-0000-000000000001';
const SITE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeDeps(overrides: Partial<OnboardingDeps> = {}): OnboardingDeps {
  return {
    verifyShopify: async () => ({ shop_id: 'gid://shopify/Shop/1', name: 'Test Shop', theme_id: 'gid://shopify/Theme/123' }),
    findSite: async () => null,
    insertSite: async () => SITE_ID,
    storeCredential: async () => {},
    ...overrides,
  };
}

describe('handleShopifyOnboarding', () => {
  it('happy path: new site → inserts and stores credential', async () => {
    const stored: string[] = [];
    const deps = makeDeps({
      storeCredential: async (_siteId, _tenantId, key, val) => { stored.push(`${key}=${val}`); },
    });

    const result = await handleShopifyOnboarding(
      { store_url: 'myshop.myshopify.com', access_token: 'tok_test' },
      deps,
    );

    assert.equal(result.ok, true);
    assert.equal(result.site_id, SITE_ID);
    assert.equal(result.shop_name, 'Test Shop');
    assert.equal(result.theme_id, 'gid://shopify/Theme/123');
    assert.deepEqual(stored, ['shopify_access_token=tok_test']);
  });

  it('missing inputs → validation error, no Shopify call', async () => {
    let verifyCalled = false;
    const deps = makeDeps({ verifyShopify: async () => { verifyCalled = true; return { shop_id: '', name: '', theme_id: null }; } });

    const result = await handleShopifyOnboarding({ store_url: '', access_token: '' }, deps);

    assert.equal(result.ok, false);
    assert.equal(result.step, 'validate');
    assert.equal(verifyCalled, false);
  });

  it('non-myshopify domain → validation error', async () => {
    const result = await handleShopifyOnboarding(
      { store_url: 'https://example.com', access_token: 'tok' },
      makeDeps(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.step, 'validate');
  });

  it('Shopify API failure → returns error at verify_credentials step', async () => {
    const deps = makeDeps({
      verifyShopify: async () => { throw new Error('401 Unauthorized'); },
    });

    const result = await handleShopifyOnboarding(
      { store_url: 'myshop.myshopify.com', access_token: 'bad_tok' },
      deps,
    );

    assert.equal(result.ok, false);
    assert.equal(result.step, 'verify_credentials');
    assert.ok(result.error?.includes('401'));
  });

  it('duplicate site → re-stores credential and returns existing site_id', async () => {
    const stored: string[] = [];
    const existingSiteId = 'existing-site-uuid';
    const deps = makeDeps({
      findSite: async () => ({ site_id: existingSiteId }),
      insertSite: async () => { throw new Error('should not be called'); },
      storeCredential: async (siteId, _tenantId, key) => { stored.push(`${siteId}:${key}`); },
    });

    const result = await handleShopifyOnboarding(
      { store_url: 'myshop.myshopify.com', access_token: 'new_tok' },
      deps,
    );

    assert.equal(result.ok, true);
    assert.equal(result.site_id, existingSiteId);
    // storeCredential called once to refresh token
    assert.deepEqual(stored, [`${existingSiteId}:shopify_access_token`]);
  });

  it('insert site failure → returns error at insert_site step', async () => {
    const deps = makeDeps({
      insertSite: async () => { throw new Error('DB constraint violation'); },
    });

    const result = await handleShopifyOnboarding(
      { store_url: 'myshop.myshopify.com', access_token: 'tok' },
      deps,
    );

    assert.equal(result.ok, false);
    assert.equal(result.step, 'insert_site');
    assert.ok(result.error?.includes('DB constraint'));
  });
});
