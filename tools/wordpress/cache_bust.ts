/**
 * tools/wordpress/cache_bust.ts
 *
 * Cache busting for WordPress sites after VAEO applies fixes.
 * Detects cache plugins, clears caches, warms affected URLs.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CachePlugin =
  | 'wp_rocket'
  | 'w3_total_cache'
  | 'wp_super_cache'
  | 'litespeed'
  | 'cloudflare'
  | 'server_level'
  | 'unknown';

export interface CacheBustConfig {
  site_id:       string;
  wp_url:        string;
  username:      string;
  app_password:  string;
  cache_plugins: CachePlugin[];
}

export interface CacheBustResult {
  success:           boolean;
  methods_attempted: CachePlugin[];
  methods_succeeded: CachePlugin[];
  error?:            string;
}

export interface CacheBustDeps {
  fetchFn?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>;
}

// ── detectCachePlugins ───────────────────────────────────────────────────────

export function detectCachePlugins(plugin_slugs: string[]): CachePlugin[] {
  try {
    const slugs = new Set(plugin_slugs.map((s) => s.toLowerCase().trim()));
    const detected: CachePlugin[] = [];

    if (slugs.has('wp-rocket')) detected.push('wp_rocket');
    if (slugs.has('w3-total-cache')) detected.push('w3_total_cache');
    if (slugs.has('wp-super-cache')) detected.push('wp_super_cache');
    if (slugs.has('litespeed-cache')) detected.push('litespeed');

    return detected;
  } catch {
    return [];
  }
}

// ── bustCache ────────────────────────────────────────────────────────────────

export async function bustCache(
  config: CacheBustConfig,
  deps?: CacheBustDeps,
): Promise<CacheBustResult> {
  try {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const auth = 'Basic ' + Buffer.from(`${config.username}:${config.app_password}`).toString('base64');
    const methods = config.cache_plugins.length > 0 ? config.cache_plugins : (['server_level'] as CachePlugin[]);
    const succeeded: CachePlugin[] = [];

    for (const method of methods) {
      try {
        let url = '';
        let init: RequestInit = { headers: { Authorization: auth } };

        switch (method) {
          case 'wp_rocket':
            url = `${config.wp_url}/wp-json/wp-rocket/v1/clear-cache`;
            init.method = 'POST';
            break;
          case 'w3_total_cache':
            url = `${config.wp_url}/wp-json/w3tc/v1/flush`;
            init.method = 'POST';
            break;
          case 'wp_super_cache':
            url = `${config.wp_url}/?wpsc_delete_all=1`;
            init.method = 'GET';
            break;
          case 'litespeed':
            url = `${config.wp_url}/wp-json/litespeed/v1/purge_all`;
            init.method = 'POST';
            break;
          case 'server_level':
          default:
            url = config.wp_url;
            init.method = 'GET';
            break;
        }

        const res = await fetchFn(url, init);
        if (res.ok) succeeded.push(method);
      } catch {
        // per-method failure, continue
      }
    }

    return {
      success: succeeded.length > 0,
      methods_attempted: methods,
      methods_succeeded: succeeded,
    };
  } catch (err) {
    return {
      success: false,
      methods_attempted: [],
      methods_succeeded: [],
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

// ── bustCacheAfterFix ────────────────────────────────────────────────────────

export async function bustCacheAfterFix(
  config: CacheBustConfig,
  affected_urls: string[],
  deps?: CacheBustDeps,
): Promise<CacheBustResult> {
  try {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const result = await bustCache(config, deps);

    // Warm each affected URL
    for (const url of affected_urls) {
      try {
        await fetchFn(url, { method: 'GET' });
      } catch {
        // non-fatal warm failure
      }
    }

    return result;
  } catch (err) {
    return {
      success: false,
      methods_attempted: [],
      methods_succeeded: [],
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}
