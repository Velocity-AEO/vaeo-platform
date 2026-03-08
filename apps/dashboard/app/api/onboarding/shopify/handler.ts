/**
 * Shopify onboarding handler — pure business logic, no Next.js imports.
 * Injectable deps for testing.
 */

export interface OnboardingDeps {
  /** Verify Shopify credentials by calling the Admin API */
  verifyShopify: (storeUrl: string, accessToken: string) => Promise<{ shop_id: string; name: string; theme_id: string | null }>;
  /** Check if a site already exists for this tenant + url */
  findSite: (tenantId: string, siteUrl: string) => Promise<{ site_id: string } | null>;
  /** Insert a new site row and return the site_id */
  insertSite: (tenantId: string, siteUrl: string) => Promise<string>;
  /** Store a credential for the site */
  storeCredential: (siteId: string, tenantId: string, key: string, val: string) => Promise<void>;
}

export interface OnboardingRequest {
  store_url: string;
  access_token: string;
  tenant_id?: string;
}

export interface OnboardingResult {
  ok: boolean;
  site_id?: string;
  shop_name?: string;
  theme_id?: string | null;
  error?: string;
  step?: string;
}

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

/** Normalise store URL to https://xyz.myshopify.com */
function normaliseStoreUrl(raw: string): string {
  let url = raw.trim().toLowerCase();
  if (!url.startsWith('http')) url = `https://${url}`;
  // ensure .myshopify.com domain
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}`;
}

export async function handleShopifyOnboarding(
  req: OnboardingRequest,
  deps: OnboardingDeps,
): Promise<OnboardingResult> {
  // Step 1 — validate inputs
  if (!req.store_url || !req.access_token) {
    return { ok: false, error: 'store_url and access_token are required', step: 'validate' };
  }

  let storeUrl: string;
  try {
    storeUrl = normaliseStoreUrl(req.store_url);
  } catch {
    return { ok: false, error: 'Invalid store URL', step: 'validate' };
  }

  if (!storeUrl.includes('.myshopify.com') && !storeUrl.includes('localhost')) {
    return { ok: false, error: 'store_url must be a .myshopify.com domain', step: 'validate' };
  }

  const tenantId = req.tenant_id ?? HARDCODED_TENANT;

  // Step 2 — verify credentials against Shopify Admin API
  let shopInfo: { shop_id: string; name: string; theme_id: string | null };
  try {
    shopInfo = await deps.verifyShopify(storeUrl, req.access_token);
  } catch (err) {
    return { ok: false, error: `Shopify credential verification failed: ${(err as Error).message}`, step: 'verify_credentials' };
  }

  // Step 3 — check for duplicate
  let existing: { site_id: string } | null;
  try {
    existing = await deps.findSite(tenantId, storeUrl);
  } catch (err) {
    return { ok: false, error: `Duplicate check failed: ${(err as Error).message}`, step: 'check_duplicate' };
  }

  if (existing) {
    // Re-store credential in case token was rotated, return existing site
    try {
      await deps.storeCredential(existing.site_id, tenantId, 'shopify_access_token', req.access_token);
    } catch {
      // non-fatal — site already exists
    }
    return {
      ok: true,
      site_id: existing.site_id,
      shop_name: shopInfo.name,
      theme_id: shopInfo.theme_id,
    };
  }

  // Step 4 — insert site
  let siteId: string;
  try {
    siteId = await deps.insertSite(tenantId, storeUrl);
  } catch (err) {
    return { ok: false, error: `Failed to create site: ${(err as Error).message}`, step: 'insert_site' };
  }

  // Step 5 — store credential
  try {
    await deps.storeCredential(siteId, tenantId, 'shopify_access_token', req.access_token);
  } catch (err) {
    return { ok: false, error: `Failed to store credentials: ${(err as Error).message}`, step: 'store_credentials' };
  }

  // Step 6 — return success
  return {
    ok: true,
    site_id: siteId,
    shop_name: shopInfo.name,
    theme_id: shopInfo.theme_id,
  };
}
