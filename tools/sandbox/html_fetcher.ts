/**
 * tools/sandbox/html_fetcher.ts
 *
 * Fetches raw HTML from a URL for sandbox verification.
 * Follows redirects, retries on 5xx (max 2 attempts), throws FetchError on failure.
 */

// ── FetchError ──────────────────────────────────────────────────────────────

export class FetchError extends Error {
  url:        string;
  statusCode: number;

  constructor(url: string, statusCode: number, message?: string) {
    super(message ?? `Fetch failed: ${statusCode} for ${url}`);
    this.name       = 'FetchError';
    this.url        = url;
    this.statusCode = statusCode;
  }
}

// ── Injectable fetch ────────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

let _fetchFn: FetchFn | undefined;

export function _injectFetch(fn: FetchFn): void {
  _fetchFn = fn;
}

export function _resetInjections(): void {
  _fetchFn = undefined;
}

function getFetch(): FetchFn {
  return _fetchFn ?? fetch;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES        = 2;
const RETRY_DELAY_MS     = 500;

// ── fetchHtml ───────────────────────────────────────────────────────────────

/**
 * Fetch raw HTML from a URL.
 *
 * - Follows redirects (default fetch behaviour).
 * - Retries on 5xx up to MAX_RETRIES times.
 * - Throws FetchError on 4xx/5xx after retries exhausted.
 * - Throws FetchError with statusCode=0 on network/timeout errors.
 */
export async function fetchHtml(url: string, timeoutMs?: number): Promise<string> {
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await getFetch()(url, {
        signal:   controller.signal,
        redirect: 'follow',
        headers:  { 'User-Agent': 'VelocityAEO-Sandbox/1.0' },
      });

      clearTimeout(timer);

      if (res.ok) {
        return await res.text();
      }

      // 4xx — don't retry
      if (res.status >= 400 && res.status < 500) {
        throw new FetchError(url, res.status);
      }

      // 5xx — retry
      lastError = new FetchError(url, res.status);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw lastError;
    } catch (err) {
      if (err instanceof FetchError) {
        // 4xx errors or final 5xx — propagate immediately
        if ((err.statusCode >= 400 && err.statusCode < 500) || attempt >= MAX_RETRIES) {
          throw err;
        }
        lastError = err;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      // Network error, abort, etc.
      throw new FetchError(url, 0, err instanceof Error ? err.message : String(err));
    }
  }

  throw lastError ?? new FetchError(url, 0, 'Max retries exceeded');
}
