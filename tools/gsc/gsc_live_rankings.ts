/**
 * tools/gsc/gsc_live_rankings.ts
 *
 * Live rankings pipeline: pulls real GSC data for verified sites
 * using VAEO-managed account tokens.
 * Never throws.
 */

import {
  buildAnalyticsRequest,
  fetchSearchAnalytics,
  extractKeywordRankings,
  type GSCSearchAnalyticsResponse,
} from './gsc_search_analytics.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LiveRankingsConfig {
  site_id:   string;
  domain:    string;
  days_back: number;
  row_limit: number;
}

export interface LiveRankingEntry {
  keyword:     string;
  position:    number;
  clicks:      number;
  impressions: number;
  url:         string;
  data_source: 'gsc_live';
}

export interface LiveRankingsResult {
  site_id:    string;
  domain:     string;
  rankings:   LiveRankingEntry[];
  fetched_at: string;
  account_id: string | null;
  error?:     string;
}

export interface GSCPropertyRecord {
  site_id:    string;
  account_id: string;
  verified:   boolean;
}

// ── fetchLiveRankings ────────────────────────────────────────────────────────

export async function fetchLiveRankings(
  config: LiveRankingsConfig,
  deps?: {
    loadPropertyFn?:    (site_id: string) => Promise<GSCPropertyRecord | null>;
    getTokenFn?:        (account_id: string) => Promise<string | null>;
    fetchAnalyticsFn?:  (request: any, token: string) => Promise<GSCSearchAnalyticsResponse>;
  },
): Promise<LiveRankingsResult> {
  try {
    const now = new Date().toISOString();
    const empty: LiveRankingsResult = {
      site_id:    config?.site_id ?? '',
      domain:     config?.domain ?? '',
      rankings:   [],
      fetched_at: now,
      account_id: null,
    };

    // Step 1: Load GSC property for site
    const loadProperty = deps?.loadPropertyFn ?? defaultLoadProperty;
    const property = await loadProperty(config.site_id);

    if (!property || !property.verified) {
      return { ...empty, error: 'not_verified' };
    }

    // Step 2: Get token for property's account_id
    const getToken = deps?.getTokenFn ?? defaultGetToken;
    const token = await getToken(property.account_id);

    if (!token) {
      return { ...empty, account_id: property.account_id, error: 'no_token' };
    }

    // Step 3: Fetch search analytics
    const propertyUrl = config.domain.startsWith('http')
      ? config.domain
      : `https://${config.domain}`;
    const request = buildAnalyticsRequest(propertyUrl, config.days_back, config.row_limit);

    const fetchAnalytics = deps?.fetchAnalyticsFn ?? ((req: any, tok: string) =>
      fetchSearchAnalytics(req, tok));
    const response = await fetchAnalytics(request, token);

    // Step 4: Extract keyword rankings
    const extracted = extractKeywordRankings(response);

    // Step 5: Return with data_source='gsc_live'
    const rankings: LiveRankingEntry[] = extracted.map(r => ({
      keyword:     r.keyword,
      position:    r.position,
      clicks:      r.clicks,
      impressions: r.impressions,
      url:         r.url,
      data_source: 'gsc_live' as const,
    }));

    return {
      site_id:    config.site_id,
      domain:     config.domain,
      rankings,
      fetched_at: now,
      account_id: property.account_id,
    };
  } catch {
    return {
      site_id:    config?.site_id ?? '',
      domain:     config?.domain ?? '',
      rankings:   [],
      fetched_at: new Date().toISOString(),
      account_id: null,
      error:      'fetch_error',
    };
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultLoadProperty(_site_id: string): Promise<GSCPropertyRecord | null> {
  return null;
}

async function defaultGetToken(_account_id: string): Promise<string | null> {
  return null;
}
