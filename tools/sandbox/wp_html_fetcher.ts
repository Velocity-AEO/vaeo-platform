/**
 * tools/sandbox/wp_html_fetcher.ts
 *
 * WordPress-specific HTML snapshot adapter for sandbox verification.
 * Fetches page HTML with auth headers and optional cache bypass.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPHTMLFetchConfig {
  wp_url:        string;
  username:      string;
  app_password:  string;
  timeout_ms:    number;
  bypass_cache:  boolean;
}

export interface WPHTMLFetchResult {
  url:            string;
  html:           string;
  fetched_at:     string;
  status_code:    number;
  cache_bypassed: boolean;
  success:        boolean;
  error?:         string;
}

// ── buildCacheBypassUrl ───────────────────────────────────────────────────────

export function buildCacheBypassUrl(url: string): string {
  try {
    const ts = Date.now();
    const sep = (url ?? '').includes('?') ? '&' : '?';
    return `${url}${sep}vaeo_nocache=${ts}`;
  } catch {
    return url ?? '';
  }
}

// ── buildWPFetchHeaders ───────────────────────────────────────────────────────

export function buildWPFetchHeaders(
  username:     string,
  app_password: string,
  bypass_cache: boolean,
): Record<string, string> {
  try {
    const credentials = Buffer.from(`${username}:${app_password}`).toString('base64');
    const headers: Record<string, string> = {
      Authorization: `Basic ${credentials}`,
      'User-Agent':  'VAEO-Sandbox/1.0',
    };
    if (bypass_cache) {
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma']        = 'no-cache';
    }
    return headers;
  } catch {
    return {};
  }
}

// ── fetchWPPageHTML ───────────────────────────────────────────────────────────

type FetchFn = typeof fetch;

export async function fetchWPPageHTML(
  url:    string,
  config: WPHTMLFetchConfig,
  deps?:  { fetchFn?: FetchFn },
): Promise<WPHTMLFetchResult> {
  const fetched_at     = new Date().toISOString();
  const cache_bypassed = config.bypass_cache;
  const fetchUrl       = cache_bypassed ? buildCacheBypassUrl(url) : url;
  const headers        = buildWPFetchHeaders(config.username, config.app_password, cache_bypassed);
  const fetchFn        = deps?.fetchFn ?? fetch;

  const attempt = async (): Promise<WPHTMLFetchResult> => {
    const res = await fetchFn(fetchUrl, {
      headers,
      signal: AbortSignal.timeout(config.timeout_ms ?? 30_000),
    });
    const html = await res.text();
    return {
      url,
      html,
      fetched_at,
      status_code:    res.status,
      cache_bypassed,
      success:        res.ok,
      ...(!res.ok ? { error: `HTTP ${res.status}` } : {}),
    };
  };

  try {
    return await attempt();
  } catch (firstErr) {
    // Retry once on timeout/network error
    try {
      return await attempt();
    } catch (err) {
      return {
        url,
        html:           '',
        fetched_at,
        status_code:    0,
        cache_bypassed,
        success:        false,
        error:          err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ── fetchWPPageHTMLBefore ─────────────────────────────────────────────────────

export async function fetchWPPageHTMLBefore(
  url:    string,
  config: WPHTMLFetchConfig,
  deps?:  { fetchFn?: FetchFn },
): Promise<WPHTMLFetchResult> {
  return fetchWPPageHTML(url, { ...config, bypass_cache: true }, deps);
}

// ── fetchWPPageHTMLAfter ──────────────────────────────────────────────────────

export async function fetchWPPageHTMLAfter(
  url:    string,
  config: WPHTMLFetchConfig,
  deps?:  { fetchFn?: FetchFn; sleepFn?: (ms: number) => Promise<void> },
): Promise<WPHTMLFetchResult> {
  try {
    // Wait 2 seconds for WordPress to process the change (injectable for tests)
    const sleep = deps?.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    await sleep(2_000);
    return fetchWPPageHTML(url, { ...config, bypass_cache: true }, deps);
  } catch (err) {
    return {
      url,
      html:           '',
      fetched_at:     new Date().toISOString(),
      status_code:    0,
      cache_bypassed: true,
      success:        false,
      error:          err instanceof Error ? err.message : String(err),
    };
  }
}
