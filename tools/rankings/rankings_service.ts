/**
 * tools/rankings/rankings_service.ts
 *
 * Fetches keyword rankings from GSC when credentials are available,
 * falls back to the deterministic simulator when not.
 * Never throws.
 */

import { simulateRankings } from './ranking_simulator.js';
import { createGSCClient } from '../gsc/gsc_client.js';
import { fetchLiveRankings, type LiveRankingsResult } from '../gsc/gsc_live_rankings.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataSource = 'gsc_live' | 'simulated';

export interface RankingEntry {
  keyword:     string;
  position:    number;
  clicks:      number;
  impressions: number;
  url:         string;
  data_source: DataSource;
  fetched_at:  string;
}

export interface RankingsServiceConfig {
  site_id:                 string;
  domain:                  string;
  gsc_token?:              string;
  use_simulator_fallback:  boolean;
}

type FetchFn = typeof globalThis.fetch;

// ── fetchRankings ─────────────────────────────────────────────────────────────

export async function fetchRankings(
  config: RankingsServiceConfig,
  deps?: { fetchFn?: FetchFn; loadPropertyFn?: Function; getTokenFn?: Function; fetchAnalyticsFn?: Function },
): Promise<RankingEntry[]> {
  try {
    const { site_id, domain, gsc_token, use_simulator_fallback } = config ?? {};
    const now = new Date().toISOString();

    // Try live rankings pipeline when property loader is available
    if (deps?.loadPropertyFn) {
      try {
        const result: LiveRankingsResult = await fetchLiveRankings(
          { site_id, domain, days_back: 28, row_limit: 100 },
          {
            loadPropertyFn: deps.loadPropertyFn as any,
            getTokenFn: deps.getTokenFn as any,
            fetchAnalyticsFn: deps.fetchAnalyticsFn as any,
          },
        );
        if (!result.error && result.rankings.length > 0) {
          return result.rankings.map(r => ({
            keyword:     r.keyword,
            position:    r.position,
            clicks:      r.clicks,
            impressions: r.impressions,
            url:         r.url,
            data_source: 'gsc_live' as DataSource,
            fetched_at:  now,
          }));
        }
        // Fall through to existing logic if live pipeline returned error
      } catch {
        // Live pipeline error — fall through
      }
    }

    if (gsc_token) {
      try {
        const fetchFn = deps?.fetchFn ?? globalThis.fetch;
        const client  = createGSCClient(gsc_token, { fetch: fetchFn });
        const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        const rows    = await client.query(siteUrl, {
          startDate:  daysAgo(28),
          endDate:    daysAgo(0),
          dimensions: ['query', 'page'],
          rowLimit:   100,
        });

        if (rows.length > 0) {
          return rows.map(row => ({
            keyword:     row.keys[0] ?? '',
            url:         row.keys[1] ?? '',
            position:    Math.round(row.position * 10) / 10,
            clicks:      row.clicks,
            impressions: row.impressions,
            data_source: 'gsc_live' as DataSource,
            fetched_at:  now,
          }));
        }

        // Empty GSC result — fall through to simulator if enabled
        if (use_simulator_fallback) {
          return simulatorResults(site_id, domain, now);
        }
        return [];
      } catch {
        // GSC error — fall back to simulator if enabled
        if (use_simulator_fallback) {
          return simulatorResults(site_id, domain, now);
        }
        return [];
      }
    }

    // No token — return simulator results if fallback enabled, otherwise []
    if (!use_simulator_fallback) return [];
    return simulatorResults(site_id, domain, now);
  } catch {
    return [];
  }
}

// ── fetchRankingsForSite ──────────────────────────────────────────────────────

export async function fetchRankingsForSite(
  site_id: string,
  deps?: { fetchFn?: FetchFn; db?: DbLike },
): Promise<RankingEntry[]> {
  try {
    const domain = deriveDomainFromSiteId(site_id);
    let gsc_token: string | undefined;

    // Try to load GSC token from DB
    try {
      const db = deps?.db;
      if (db) {
        const { data } = await db
          .from('gsc_tokens')
          .select('access_token')
          .eq('site_id', site_id)
          .maybeSingle();
        gsc_token = data?.access_token ?? undefined;
      }
    } catch {
      // DB unavailable — token stays undefined
    }

    return fetchRankings(
      { site_id, domain, gsc_token, use_simulator_fallback: true },
      deps,
    );
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface DbLike {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function deriveDomainFromSiteId(site_id: string): string {
  // site_id is often a UUID; map to a generic domain for simulation
  return `${site_id}.myshopify.com`;
}

function simulatorResults(site_id: string, domain: string, now: string): RankingEntry[] {
  try {
    const snapshot = simulateRankings(site_id, domain);
    return snapshot.entries.map(e => ({
      keyword:     e.keyword,
      position:    e.position,
      clicks:      e.clicks,
      impressions: e.impressions,
      url:         e.url,
      data_source: 'simulated' as DataSource,
      fetched_at:  now,
    }));
  } catch {
    return [];
  }
}
