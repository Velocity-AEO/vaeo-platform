/**
 * tools/wordpress/wp_connection.ts
 *
 * WordPress REST API connection verifier.
 * Never throws at the outer level.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type FetchFn = (url: string, opts: RequestInit) => Promise<Response>;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface WPConnectionConfig {
  site_id:      string;
  domain:       string;
  wp_url:       string;
  username:     string;
  app_password: string;
  platform:     'wordpress';
}

export interface WPConnectionResult {
  success:              boolean;
  site_id:              string;
  domain:               string;
  wp_version?:          string;
  active_plugins?:      string[];
  woocommerce_active:   boolean;
  error?:               string;
}

// ── buildAuthHeader ───────────────────────────────────────────────────────────

export function buildAuthHeader(username: string, app_password: string): string {
  try {
    const u    = username     ?? '';
    const p    = app_password ?? '';
    const cred = Buffer.from(`${u}:${p}`).toString('base64');
    return `Basic ${cred}`;
  } catch {
    return 'Basic ';
  }
}

// ── verifyWPConnection ────────────────────────────────────────────────────────

export async function verifyWPConnection(
  config: WPConnectionConfig,
  deps?: { fetchFn?: FetchFn },
): Promise<WPConnectionResult> {
  try {
    const base      = (config.wp_url ?? '').replace(/\/$/, '');
    const authHeader = buildAuthHeader(config.username, config.app_password);
    const fetchFn   = deps?.fetchFn ?? globalThis.fetch;

    const res = await fetchFn(`${base}/wp-json/wp/v2/`, {
      method:  'GET',
      headers: {
        Authorization:  authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      return {
        success:            false,
        site_id:            config.site_id ?? '',
        domain:             config.domain  ?? '',
        woocommerce_active: false,
        error:              `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json() as Record<string, unknown>;

    const wp_version = typeof data.generator === 'string'
      ? data.generator.replace('WordPress/', '')
      : undefined;

    // Fetch plugins to check WooCommerce
    const plugins     = await fetchActivePlugins(config, deps);
    const wc_active   = plugins.some(p =>
      p.includes('woocommerce') || p.includes('woo-commerce'),
    );

    return {
      success:            true,
      site_id:            config.site_id,
      domain:             config.domain,
      wp_version,
      active_plugins:     plugins,
      woocommerce_active: wc_active,
    };
  } catch (err) {
    return {
      success:            false,
      site_id:            config?.site_id ?? '',
      domain:             config?.domain  ?? '',
      woocommerce_active: false,
      error:              err instanceof Error ? err.message : String(err),
    };
  }
}

// ── fetchActivePlugins ────────────────────────────────────────────────────────

export async function fetchActivePlugins(
  config: WPConnectionConfig,
  deps?: { fetchFn?: FetchFn },
): Promise<string[]> {
  try {
    const base       = (config.wp_url ?? '').replace(/\/$/, '');
    const authHeader = buildAuthHeader(config.username, config.app_password);
    const fetchFn    = deps?.fetchFn ?? globalThis.fetch;

    const res = await fetchFn(`${base}/wp-json/wp/v2/plugins`, {
      method:  'GET',
      headers: {
        Authorization:  authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return [];

    const data = await res.json() as unknown[];
    if (!Array.isArray(data)) return [];

    return data
      .map(p => (p as Record<string, unknown>)['plugin'] as string ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}
