/**
 * tools/shopify/oauth_scopes.ts
 *
 * Shopify OAuth scope validation and management.
 * Pure functions (except checkInstalledScopes which calls Shopify API).
 * Never throws.
 */

// ── Scope definitions ────────────────────────────────────────────────────────

export const REQUIRED_SCOPES: string[] = [
  'read_themes',
  'write_themes',
  'read_content',
  'write_content',
  'read_products',
  'read_online_store_pages',
  'write_online_store_pages',
];

export const OPTIONAL_SCOPES: string[] = [
  'read_analytics',
  'read_reports',
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScopeValidationResult {
  valid:             boolean;
  granted:           string[];
  missing_required:  string[];
  missing_optional:  string[];
  has_all_required:  boolean;
}

export interface OAuthScopeDeps {
  fetch: typeof globalThis.fetch;
}

// ── Validate scopes ──────────────────────────────────────────────────────────

/**
 * Validate granted OAuth scopes against required and optional scopes.
 * Accepts either a comma-separated string or an array.
 */
export function validateOAuthScopes(
  granted_scopes: string | string[],
): ScopeValidationResult {
  const granted = Array.isArray(granted_scopes)
    ? granted_scopes.map((s) => s.trim()).filter(Boolean)
    : granted_scopes.split(',').map((s) => s.trim()).filter(Boolean);

  const grantedSet = new Set(granted);

  const missing_required = REQUIRED_SCOPES.filter((s) => !grantedSet.has(s));
  const missing_optional = OPTIONAL_SCOPES.filter((s) => !grantedSet.has(s));
  const has_all_required = missing_required.length === 0;

  return {
    valid:            has_all_required,
    granted,
    missing_required,
    missing_optional,
    has_all_required,
  };
}

// ── Build scope string ───────────────────────────────────────────────────────

/**
 * Returns all required scopes as a comma-separated string.
 * Used when building the OAuth authorization URL.
 */
export function buildScopeString(): string {
  return REQUIRED_SCOPES.join(',');
}

// ── Check installed scopes ───────────────────────────────────────────────────

/**
 * Fetch currently installed scopes from Shopify Admin API
 * and validate them.
 */
export async function checkInstalledScopes(
  shop_domain:  string,
  access_token: string,
  deps:         OAuthScopeDeps = { fetch: globalThis.fetch },
): Promise<ScopeValidationResult> {
  try {
    const url = `https://${shop_domain}/admin/oauth/access_scopes.json`;
    const res = await deps.fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type':           'application/json',
      },
    });

    if (!res.ok) {
      return {
        valid:            false,
        granted:          [],
        missing_required: [...REQUIRED_SCOPES],
        missing_optional: [...OPTIONAL_SCOPES],
        has_all_required: false,
      };
    }

    const data = await res.json() as Record<string, unknown>;
    const scopes = (data.access_scopes ?? []) as Array<{ handle: string }>;
    const handles = scopes.map((s) => s.handle);

    return validateOAuthScopes(handles);
  } catch {
    return {
      valid:            false,
      granted:          [],
      missing_required: [...REQUIRED_SCOPES],
      missing_optional: [...OPTIONAL_SCOPES],
      has_all_required: false,
    };
  }
}
