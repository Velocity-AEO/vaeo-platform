/**
 * tools/gsc/gsc_property_manager.ts
 *
 * Manages GSC domain properties: URL construction, verification tag
 * generation, and API calls to add/check properties.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GSCProperty {
  property_id:          string;
  site_id:              string;
  account_id:           string;
  domain:               string;
  property_url:         string;
  verified:             boolean;
  verification_method:  'meta_tag' | 'dns' | null;
  verification_tag:     string | null;
  added_at:             string | null;
  verified_at:          string | null;
}

// ── buildPropertyUrl ──────────────────────────────────────────────────────────

/**
 * Returns the GSC domain property URL format: 'sc-domain:{domain}'.
 * Strips any protocol prefix before building.
 */
export function buildPropertyUrl(domain: string): string {
  try {
    const clean = (domain ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return `sc-domain:${clean}`;
  } catch {
    return 'sc-domain:unknown';
  }
}

// ── generateVerificationTag ───────────────────────────────────────────────────

/**
 * Returns a deterministic token: 'vaeo-gsc-verify-{site_id}-{account_id}'
 * truncated to 64 characters.
 */
export function generateVerificationTag(site_id: string, account_id: string): string {
  try {
    const token = `vaeo-gsc-verify-${site_id}-${account_id}`;
    return token.slice(0, 64);
  } catch {
    return 'vaeo-gsc-verify-unknown';
  }
}

// ── buildVerificationMetaTag ──────────────────────────────────────────────────

export function buildVerificationMetaTag(token: string): string {
  try {
    return `<meta name="google-site-verification" content="${token}" />`;
  } catch {
    return '';
  }
}

// ── addPropertyToGSC ─────────────────────────────────────────────────────────

type FetchFn = typeof fetch;

const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

export async function addPropertyToGSC(
  domain:      string,
  account_id:  string,
  gsc_token:   string,
  deps?:       { fetchFn?: FetchFn },
): Promise<{ success: boolean; error?: string }> {
  try {
    const property_url  = buildPropertyUrl(domain);
    const encoded       = encodeURIComponent(property_url);
    const url           = `${GSC_API_BASE}/${encoded}`;
    const fetchFn       = deps?.fetchFn ?? fetch;

    const res = await fetchFn(url, {
      method:  'PUT',
      headers: {
        Authorization:  `Bearer ${gsc_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `GSC API error ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── checkVerificationStatus ───────────────────────────────────────────────────

export async function checkVerificationStatus(
  property_url: string,
  gsc_token:    string,
  deps?:        { fetchFn?: FetchFn },
): Promise<{ verified: boolean; error?: string }> {
  try {
    const encoded = encodeURIComponent(property_url);
    const url     = `${GSC_API_BASE}/${encoded}`;
    const fetchFn = deps?.fetchFn ?? fetch;

    const res = await fetchFn(url, {
      method:  'GET',
      headers: { Authorization: `Bearer ${gsc_token}` },
    });

    if (res.status === 404) {
      return { verified: false };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { verified: false, error: `GSC API error ${res.status}: ${body}` };
    }

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const verified = data['permissionLevel'] != null &&
                     data['permissionLevel'] !== 'siteUnverifiedUser';
    return { verified };
  } catch (err) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
