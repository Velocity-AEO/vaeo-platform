/**
 * packages/adapters/gsc/src/index.ts
 * @vaeo/gsc-adapter
 *
 * Google Search Console adapter for VAEO.
 * Provides keyword data (Search Analytics) and URL indexing status
 * (URL Inspection API) for a verified GSC property.
 *
 * Design:
 *   - Injectable GscFetch for unit tests (no real HTTP in tests)
 *   - In-memory OAuth2 access token cache with expiry (1 hr tokens)
 *   - Never throws — both public functions return safe defaults on error
 *   - Env vars: GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN
 *
 * Re-auth: if the refresh token is expired, run the OAuth2 consent
 * flow again and update GSC_REFRESH_TOKEN in Doppler.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Injectable fetch — use real fetch in prod, mock in tests. */
export type GscFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Override credentials in tests without touching process.env. */
export interface GscCredentials {
  clientId:     string;
  clientSecret: string;
  refreshToken: string;
}

export interface KeywordRow {
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

export interface IndexingStatus {
  indexed:       boolean;
  lastCrawled:   string | null;
  coverageState: string;
}

// ── Token cache (module-level, shared across calls in a single process) ───────

let _tokenCache: { accessToken: string; expiresAt: number } | null = null;

/** Clear the token cache — useful for test isolation. */
export function clearTokenCache(): void {
  _tokenCache = null;
}

// ── OAuth2 token refresh ──────────────────────────────────────────────────────

async function getAccessToken(
  creds?:    GscCredentials,
  gscFetch?: GscFetch,
): Promise<string> {
  // Return cached token if still valid (with 60s safety margin)
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.accessToken;
  }

  const clientId     = creds?.clientId     ?? process.env['GSC_CLIENT_ID']     ?? '';
  const clientSecret = creds?.clientSecret ?? process.env['GSC_CLIENT_SECRET'] ?? '';
  const refreshToken = creds?.refreshToken ?? process.env['GSC_REFRESH_TOKEN'] ?? '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GSC credentials not configured. ' +
      'Set GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN in Doppler.',
    );
  }

  const doFetch = gscFetch ?? fetch;
  const resp = await doFetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }).toString(),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GSC token refresh failed (${resp.status}): ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };

  _tokenCache = {
    accessToken: data.access_token,
    expiresAt:   Date.now() + data.expires_in * 1000,
  };

  return _tokenCache.accessToken;
}

// ── getTopKeywords ────────────────────────────────────────────────────────────

const GSC_SEARCH_ANALYTICS_BASE =
  'https://searchconsole.googleapis.com/webmasters/v3/sites';

/**
 * Returns the top 3 search queries driving traffic to `pageUrl`, sorted by
 * impressions DESC.  Returns [] on any error (auth, quota, no data).
 *
 * @param siteUrl  GSC property URL  e.g. "https://cococabanalife.com/"
 * @param pageUrl  Full page URL     e.g. "https://cococabanalife.com/pages/returns"
 * @param daysBack Rolling window in days (default 28)
 */
export async function getTopKeywords(
  siteUrl:  string,
  pageUrl:  string,
  daysBack = 28,
  _opts?: {
    credentials?: GscCredentials;
    gscFetch?:    GscFetch;
  },
): Promise<KeywordRow[]> {
  try {
    const token    = await getAccessToken(_opts?.credentials, _opts?.gscFetch);
    const doFetch  = _opts?.gscFetch ?? fetch;

    const endDate   = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - daysBack);

    const encodedSite = encodeURIComponent(siteUrl);
    const url = `${GSC_SEARCH_ANALYTICS_BASE}/${encodedSite}/searchAnalytics/query`;

    const resp = await doFetch(url, {
      method:  'POST',
      headers: {
        authorization:  `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        startDate:  startDate.toISOString().slice(0, 10),
        endDate:    endDate.toISOString().slice(0, 10),
        dimensions: ['query', 'page'],
        dimensionFilterGroups: [{
          filters: [{
            dimension:  'page',
            operator:   'equals',
            expression: pageUrl,
          }],
        }],
        rowLimit: 10,
      }),
    });

    if (!resp.ok) {
      process.stderr.write(`[gsc] Search Analytics ${resp.status} for ${pageUrl}\n`);
      return [];
    }

    const data = await resp.json() as {
      rows?: Array<{
        keys:        string[];
        clicks:      number;
        impressions: number;
        ctr:         number;
        position:    number;
      }>;
    };

    return (data.rows ?? [])
      .map((r) => ({
        query:       r.keys[0] ?? '',
        clicks:      r.clicks,
        impressions: r.impressions,
        ctr:         r.ctr,
        position:    r.position,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3);

  } catch (err) {
    process.stderr.write(`[gsc] getTopKeywords error: ${String(err)}\n`);
    return [];
  }
}

// ── getIndexingStatus ─────────────────────────────────────────────────────────

const GSC_URL_INSPECTION = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

const DEFAULT_INDEXING: IndexingStatus = {
  indexed:       false,
  lastCrawled:   null,
  coverageState: 'unknown',
};

/**
 * Returns the GSC URL Inspection result for `pageUrl`.
 * Returns the default safe object on any error.
 */
export async function getIndexingStatus(
  siteUrl: string,
  pageUrl: string,
  _opts?: {
    credentials?: GscCredentials;
    gscFetch?:    GscFetch;
  },
): Promise<IndexingStatus> {
  try {
    const token   = await getAccessToken(_opts?.credentials, _opts?.gscFetch);
    const doFetch = _opts?.gscFetch ?? fetch;

    const resp = await doFetch(GSC_URL_INSPECTION, {
      method:  'POST',
      headers: {
        authorization:  `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inspectionUrl: pageUrl,
        siteUrl,
      }),
    });

    if (!resp.ok) {
      process.stderr.write(`[gsc] URL Inspection ${resp.status} for ${pageUrl}\n`);
      return { ...DEFAULT_INDEXING };
    }

    const data = await resp.json() as {
      inspectionResult?: {
        indexStatusResult?: {
          verdict?:       string;
          lastCrawlTime?: string;
          coverageState?: string;
        };
      };
    };

    const idx = data.inspectionResult?.indexStatusResult;
    return {
      indexed:       idx?.verdict === 'PASS',
      lastCrawled:   idx?.lastCrawlTime  ?? null,
      coverageState: idx?.coverageState  ?? 'unknown',
    };

  } catch (err) {
    process.stderr.write(`[gsc] getIndexingStatus error: ${String(err)}\n`);
    return { ...DEFAULT_INDEXING };
  }
}
