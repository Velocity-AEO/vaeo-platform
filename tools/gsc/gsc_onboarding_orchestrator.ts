/**
 * tools/gsc/gsc_onboarding_orchestrator.ts
 *
 * Full GSC onboarding flow:
 *   load pool → get account → add property → generate tag →
 *   inject tag → check verified → save property → remove tag
 * Never throws.
 */

import {
  buildAccountPool,
  getAvailableAccount,
  type GSCAccount,
  type GSCAccountPool,
} from './gsc_account_pool.js';
import {
  buildPropertyUrl,
  generateVerificationTag,
  buildVerificationMetaTag,
  type GSCProperty,
} from './gsc_property_manager.js';
import type { VerificationInjectionConfig } from './gsc_verification_injector.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GSCOnboardingResult {
  site_id:          string;
  domain:           string;
  account_id:       string;
  property_url:     string;
  verification_tag: string;
  tag_injected:     boolean;
  property_added:   boolean;
  verified:         boolean;
  error?:           string;
}

export interface OnboardingDeps {
  loadPoolFn?:     () => Promise<GSCAccountPool>;
  addPropertyFn?:  (domain: string, account_id: string) => Promise<{ success: boolean; error?: string }>;
  injectTagFn?:    (config: VerificationInjectionConfig) => Promise<{ success: boolean; error?: string }>;
  checkVerifiedFn?: (property_url: string) => Promise<{ verified: boolean; error?: string }>;
  savePropertyFn?: (property: Omit<GSCProperty, 'property_id'>) => Promise<void>;
  removeTagFn?:    (config: VerificationInjectionConfig) => Promise<{ success: boolean; error?: string }>;
}

// ── onboardSiteToGSC ──────────────────────────────────────────────────────────

export async function onboardSiteToGSC(
  site_id:  string,
  domain:   string,
  platform: 'shopify' | 'wordpress',
  deps?:    OnboardingDeps,
): Promise<GSCOnboardingResult> {
  const property_url     = buildPropertyUrl(domain);
  let   account_id       = '';
  let   verification_tag = '';
  let   tag_injected     = false;
  let   property_added   = false;
  let   verified         = false;

  try {
    // Step 1: Load pool and get available account
    const loadPoolFn = deps?.loadPoolFn ?? defaultLoadPool;
    const pool       = await loadPoolFn();
    const account    = getAvailableAccount(pool);

    if (!account) {
      return {
        site_id, domain, account_id: '', property_url,
        verification_tag: '', tag_injected: false,
        property_added: false, verified: false,
        error: 'GSC account pool is full',
      };
    }

    account_id = account.account_id;

    // Step 2: Add domain property to GSC account
    const addPropertyFn = deps?.addPropertyFn ?? defaultAddProperty;
    const addResult     = await addPropertyFn(domain, account_id).catch(() => ({ success: false, error: 'addProperty threw' }));
    property_added = addResult.success;

    // Step 3: Generate verification tag
    verification_tag = generateVerificationTag(site_id, account_id);
    const meta_tag_html = buildVerificationMetaTag(verification_tag);

    const injectionConfig: VerificationInjectionConfig = {
      site_id, platform, verification_tag, meta_tag_html,
    };

    // Step 4: Inject verification meta tag into site
    const injectTagFn = deps?.injectTagFn ?? defaultInjectTag;
    const injectResult = await injectTagFn(injectionConfig).catch(() => ({ success: false }));
    tag_injected = injectResult.success;

    // Step 5: Check verification status
    const checkVerifiedFn = deps?.checkVerifiedFn ?? defaultCheckVerified;
    const checkResult     = await checkVerifiedFn(property_url).catch(() => ({ verified: false }));
    verified = checkResult.verified;

    // Step 6: Save GSCProperty to Supabase (only if verified)
    if (verified && deps?.savePropertyFn) {
      try {
        await deps.savePropertyFn({
          site_id,
          account_id,
          domain,
          property_url,
          verified:             true,
          verification_method:  'meta_tag',
          verification_tag,
          added_at:             new Date().toISOString(),
          verified_at:          new Date().toISOString(),
        });
      } catch {
        // non-fatal
      }
    }

    // Step 7: Remove verification tag from site (cleanup)
    const removeTagFn = deps?.removeTagFn ?? defaultRemoveTag;
    await removeTagFn(injectionConfig).catch(() => {
      // non-fatal
    });

    return {
      site_id, domain, account_id, property_url,
      verification_tag, tag_injected, property_added, verified,
    };
  } catch (err) {
    return {
      site_id, domain, account_id, property_url,
      verification_tag, tag_injected, property_added, verified,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultLoadPool(): Promise<GSCAccountPool> {
  return buildAccountPool([]);
}

async function defaultAddProperty(
  _domain: string, _account_id: string,
): Promise<{ success: boolean }> {
  return { success: false };
}

async function defaultInjectTag(
  _config: VerificationInjectionConfig,
): Promise<{ success: boolean }> {
  return { success: false };
}

async function defaultCheckVerified(
  _property_url: string,
): Promise<{ verified: boolean }> {
  return { verified: false };
}

async function defaultRemoveTag(
  _config: VerificationInjectionConfig,
): Promise<{ success: boolean }> {
  return { success: true };
}
