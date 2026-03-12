/**
 * tools/gsc/gsc_onboarding_orchestrator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  onboardSiteToGSC,
  type OnboardingDeps,
  type GSCOnboardingResult,
} from './gsc_onboarding_orchestrator.ts';
import { buildAccountPool } from './gsc_account_pool.ts';
import type { GSCAccountPool } from './gsc_account_pool.ts';
import type { VerificationInjectionConfig } from './gsc_verification_injector.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pool(full = false): GSCAccountPool {
  return buildAccountPool([{
    account_id:     'acct_1',
    google_email:   'gsc@vaeo.io',
    property_count: full ? 100 : 50,
    max_properties: 100,
    active:         true,
    created_at:     new Date().toISOString(),
  }]);
}

function successDeps(overrides?: Partial<OnboardingDeps>): OnboardingDeps {
  return {
    loadPoolFn:      async () => pool(false),
    addPropertyFn:   async () => ({ success: true }),
    injectTagFn:     async () => ({ success: true }),
    checkVerifiedFn: async () => ({ verified: true }),
    savePropertyFn:  async () => {},
    removeTagFn:     async () => ({ success: true }),
    ...overrides,
  };
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe('onboardSiteToGSC — happy path', () => {
  it('returns site_id', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.site_id, 'site_1');
  });

  it('returns domain', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.domain, 'x.com');
  });

  it('returns account_id from pool', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.account_id, 'acct_1');
  });

  it('returns property_url in sc-domain format', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.property_url, 'sc-domain:x.com');
  });

  it('returns verification_tag', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.ok(r.verification_tag.startsWith('vaeo-gsc-verify'));
  });

  it('tag_injected=true on success', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.tag_injected, true);
  });

  it('property_added=true on success', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.property_added, true);
  });

  it('verified=true on success', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.verified, true);
  });

  it('no error on success', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps());
    assert.equal(r.error, undefined);
  });
});

// ── Pool full ─────────────────────────────────────────────────────────────────

describe('onboardSiteToGSC — pool full', () => {
  it('returns error when pool is full', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      loadPoolFn: async () => pool(true),
    }));
    assert.ok(r.error?.includes('pool is full'));
  });

  it('returns verified=false when pool full', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      loadPoolFn: async () => pool(true),
    }));
    assert.equal(r.verified, false);
  });
});

// ── Inject failure ────────────────────────────────────────────────────────────

describe('onboardSiteToGSC — inject failure', () => {
  it('tag_injected=false when inject fn fails', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      injectTagFn: async () => ({ success: false }),
    }));
    assert.equal(r.tag_injected, false);
  });

  it('tag_injected=false when inject fn throws', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      injectTagFn: async () => { throw new Error('inject boom'); },
    }));
    assert.equal(r.tag_injected, false);
  });
});

// ── Verification failure ──────────────────────────────────────────────────────

describe('onboardSiteToGSC — verification failure', () => {
  it('verified=false when check fails', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      checkVerifiedFn: async () => ({ verified: false }),
    }));
    assert.equal(r.verified, false);
  });

  it('verified=false when checkVerifiedFn throws', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      checkVerifiedFn: async () => { throw new Error('check boom'); },
    }));
    assert.equal(r.verified, false);
  });

  it('savePropertyFn NOT called when not verified', async () => {
    let saved = false;
    await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      checkVerifiedFn: async () => ({ verified: false }),
      savePropertyFn:  async () => { saved = true; },
    }));
    assert.equal(saved, false);
  });
});

// ── Save and cleanup ──────────────────────────────────────────────────────────

describe('onboardSiteToGSC — save and cleanup', () => {
  it('savePropertyFn called on success', async () => {
    let saved = false;
    await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      savePropertyFn: async () => { saved = true; },
    }));
    assert.equal(saved, true);
  });

  it('removeTagFn called after verification', async () => {
    let removed = false;
    await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      removeTagFn: async () => { removed = true; return { success: true }; },
    }));
    assert.equal(removed, true);
  });

  it('still returns result even when removeTagFn throws', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      removeTagFn: async () => { throw new Error('remove boom'); },
    }));
    assert.equal(r.verified, true);
  });

  it('still returns result even when savePropertyFn throws', async () => {
    const r = await onboardSiteToGSC('site_1', 'x.com', 'shopify', successDeps({
      savePropertyFn: async () => { throw new Error('save boom'); },
    }));
    assert.equal(r.verified, true);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('onboardSiteToGSC — never throws', () => {
  it('never throws when loadPoolFn throws', async () => {
    await assert.doesNotReject(() =>
      onboardSiteToGSC('s', 'd', 'shopify', successDeps({
        loadPoolFn: async () => { throw new Error('db fail'); },
      })),
    );
  });

  it('never throws when addPropertyFn throws', async () => {
    await assert.doesNotReject(() =>
      onboardSiteToGSC('s', 'd', 'shopify', successDeps({
        addPropertyFn: async () => { throw new Error('api fail'); },
      })),
    );
  });

  it('never throws with empty deps', async () => {
    await assert.doesNotReject(() => onboardSiteToGSC('s', 'd', 'shopify', {}));
  });
});
