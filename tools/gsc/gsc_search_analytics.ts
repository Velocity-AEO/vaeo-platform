/**
 * tools/gsc/gsc_search_analytics.ts
 *
 * Dedicated GSC search analytics puller for VAEO-managed accounts.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GSCSearchAnalyticsRequest {
  property_url: string;
  start_date:   string;
  end_date:     string;
  dimensions:   Array<'query' | 'page' | 'device' | 'country'>;
  row_limit:    number;
  start_row:    number;
}

export interface GSCSearchAnalyticsRow {
  keys:        string[];
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

export interface GSCSearchAnalyticsResponse {
  rows:         GSCSearchAnalyticsRow[];
  property_url: string;
  fetched_at:   string;
  row_count:    number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

// ── buildAnalyticsRequest ────────────────────────────────────────────────────

export function buildAnalyticsRequest(
  property_url: string,
  days_back:    number,
  row_limit?:   number,
): GSCSearchAnalyticsRequest {
  try {
    return {
      property_url: property_url ?? '',
      start_date:   daysAgo(days_back ?? 28),
      end_date:     daysAgo(3), // GSC data has 3-day lag
      dimensions:   ['query', 'page'],
      row_limit:    row_limit ?? 1000,
      start_row:    0,
    };
  } catch {
    return {
      property_url: '',
      start_date:   daysAgo(28),
      end_date:     daysAgo(3),
      dimensions:   ['query', 'page'],
      row_limit:    1000,
      start_row:    0,
    };
  }
}

// ── fetchSearchAnalytics ─────────────────────────────────────────────────────

export async function fetchSearchAnalytics(
  request:   GSCSearchAnalyticsRequest,
  gsc_token: string,
  deps?: { fetchFn?: Function },
): Promise<GSCSearchAnalyticsResponse> {
  try {
    const f = (deps?.fetchFn ?? globalThis.fetch) as typeof fetch;
    const encoded = encodeURIComponent(request.property_url);
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;

    const res = await f(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gsc_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        startDate:  request.start_date,
        endDate:    request.end_date,
        dimensions: request.dimensions,
        rowLimit:   request.row_limit,
        startRow:   request.start_row,
      }),
    });

    if (!res.ok) {
      return {
        rows:         [],
        property_url: request.property_url,
        fetched_at:   new Date().toISOString(),
        row_count:    0,
      };
    }

    const data = await res.json() as { rows?: GSCSearchAnalyticsRow[] };
    const rows = (data.rows ?? []).map(r => ({
      keys:        r.keys ?? [],
      clicks:      r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr:         r.ctr ?? 0,
      position:    r.position ?? 0,
    }));

    return {
      rows,
      property_url: request.property_url,
      fetched_at:   new Date().toISOString(),
      row_count:    rows.length,
    };
  } catch {
    return {
      rows:         [],
      property_url: request?.property_url ?? '',
      fetched_at:   new Date().toISOString(),
      row_count:    0,
    };
  }
}

// ── extractKeywordRankings ───────────────────────────────────────────────────

export function extractKeywordRankings(
  response: GSCSearchAnalyticsResponse,
): Array<{
  keyword:     string;
  position:    number;
  clicks:      number;
  impressions: number;
  url:         string;
}> {
  try {
    if (!response?.rows?.length) return [];
    return response.rows.map(row => ({
      keyword:     row.keys?.[0] ?? '',
      url:         row.keys?.[1] ?? '',
      position:    Math.round((row.position ?? 0) * 10) / 10,
      clicks:      row.clicks ?? 0,
      impressions: row.impressions ?? 0,
    }));
  } catch {
    return [];
  }
}
