/**
 * tools/gsc/gsc_verification_injector.ts
 *
 * Injects (and removes) the GSC verification meta tag into client sites.
 * Routes to Shopify or WordPress platform handler via injectable deps.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerificationInjectionConfig {
  site_id:          string;
  platform:         'shopify' | 'wordpress';
  verification_tag: string;
  meta_tag_html:    string;
}

export interface VerificationInjectionResult {
  success:      boolean;
  site_id:      string;
  platform:     string;
  injected_at:  string | null;
  error?:       string;
}

type PlatformFn = (
  config: VerificationInjectionConfig,
) => Promise<{ success: boolean; error?: string }>;

export interface InjectorDeps {
  shopifyInjectFn?:   PlatformFn;
  wordpressInjectFn?: PlatformFn;
}

export interface RemoverDeps {
  shopifyRemoveFn?:   PlatformFn;
  wordpressRemoveFn?: PlatformFn;
}

// ── injectVerificationTag ─────────────────────────────────────────────────────

export async function injectVerificationTag(
  config: VerificationInjectionConfig,
  deps?:  InjectorDeps,
): Promise<VerificationInjectionResult> {
  try {
    const platformFn =
      config.platform === 'shopify'
        ? (deps?.shopifyInjectFn   ?? defaultShopifyInject)
        : (deps?.wordpressInjectFn ?? defaultWordpressInject);

    const result = await platformFn(config);

    return {
      success:     result.success,
      site_id:     config.site_id,
      platform:    config.platform,
      injected_at: result.success ? new Date().toISOString() : null,
      error:       result.error,
    };
  } catch (err) {
    return {
      success:     false,
      site_id:     config.site_id,
      platform:    config.platform,
      injected_at: null,
      error:       err instanceof Error ? err.message : String(err),
    };
  }
}

// ── removeVerificationTag ─────────────────────────────────────────────────────

export async function removeVerificationTag(
  config: VerificationInjectionConfig,
  deps?:  RemoverDeps,
): Promise<VerificationInjectionResult> {
  try {
    const platformFn =
      config.platform === 'shopify'
        ? (deps?.shopifyRemoveFn   ?? defaultShopifyRemove)
        : (deps?.wordpressRemoveFn ?? defaultWordpressRemove);

    const result = await platformFn(config);

    return {
      success:     result.success,
      site_id:     config.site_id,
      platform:    config.platform,
      injected_at: null,
      error:       result.error,
    };
  } catch (err) {
    return {
      success:     false,
      site_id:     config.site_id,
      platform:    config.platform,
      injected_at: null,
      error:       err instanceof Error ? err.message : String(err),
    };
  }
}

// ── isTagPresent ──────────────────────────────────────────────────────────────

/**
 * Returns true if a google-site-verification meta tag with the given
 * verification_tag content exists in the HTML string.
 */
export function isTagPresent(html: string, verification_tag: string): boolean {
  try {
    if (!html || !verification_tag) return false;
    return html.includes(verification_tag) &&
           html.includes('google-site-verification');
  } catch {
    return false;
  }
}

// ── Defaults (no-ops for offline/test environments) ───────────────────────────

async function defaultShopifyInject(
  _config: VerificationInjectionConfig,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'No Shopify inject function configured' };
}

async function defaultWordpressInject(
  _config: VerificationInjectionConfig,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'No WordPress inject function configured' };
}

async function defaultShopifyRemove(
  _config: VerificationInjectionConfig,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'No Shopify remove function configured' };
}

async function defaultWordpressRemove(
  _config: VerificationInjectionConfig,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'No WordPress remove function configured' };
}
