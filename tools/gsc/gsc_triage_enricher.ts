/**
 * tools/gsc/gsc_triage_enricher.ts
 *
 * Enriches triage items with GSC traffic data.
 * Maps GSC rows to URL-keyed traffic data for priority scoring.
 */

import type { GSCClient, GSCRow } from './gsc_client.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrafficTier = 'high' | 'medium' | 'low' | 'none';

export interface PageTrafficData {
  url:          string;
  clicks:       number;
  impressions:  number;
  position:     number;
  ctr:          number;
  traffic_tier: TrafficTier;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trafficTier(clicks: number): TrafficTier {
  if (clicks > 100) return 'high';
  if (clicks > 10)  return 'medium';
  if (clicks > 0)   return 'low';
  return 'none';
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '');
  }
}

// ── Enrich triage with GSC ────────────────────────────────────────────────────

export async function enrichTriageWithGSC(
  siteId:    string,
  urls:      string[],
  gscClient: GSCClient,
  options?: { days?: number },
): Promise<Map<string, PageTrafficData>> {
  const result = new Map<string, PageTrafficData>();
  const days   = options?.days ?? 28;

  // Determine site URL from first URL
  let siteUrl: string;
  try {
    const u = new URL(urls[0] ?? '');
    siteUrl = u.origin;
  } catch {
    return result;
  }

  // Fetch top pages from GSC
  const rows = await gscClient.getTopPages(siteUrl, days, 500);

  // Index GSC rows by normalized URL
  const gscIndex = new Map<string, GSCRow>();
  for (const row of rows) {
    const key = normalizeUrl(row.keys[0] ?? '');
    gscIndex.set(key, row);
  }

  // Match provided URLs to GSC data
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    const gscRow     = gscIndex.get(normalized);

    if (gscRow) {
      result.set(url, {
        url,
        clicks:       gscRow.clicks,
        impressions:  gscRow.impressions,
        position:     gscRow.position,
        ctr:          gscRow.ctr,
        traffic_tier: trafficTier(gscRow.clicks),
      });
    } else {
      result.set(url, {
        url,
        clicks:       0,
        impressions:  0,
        position:     0,
        ctr:          0,
        traffic_tier: 'none',
      });
    }
  }

  return result;
}

// ── Build priority map ────────────────────────────────────────────────────────

export async function buildPriorityMap(
  siteId:    string,
  issues:    Array<{ url: string; issue_type: string }>,
  gscClient: GSCClient,
): Promise<Map<string, { gsc_clicks: number; gsc_impressions: number }>> {
  const urls       = [...new Set(issues.map((i) => i.url))];
  const trafficMap = await enrichTriageWithGSC(siteId, urls, gscClient);
  const result     = new Map<string, { gsc_clicks: number; gsc_impressions: number }>();

  for (const issue of issues) {
    const key     = `${issue.url}::${issue.issue_type}`;
    const traffic = trafficMap.get(issue.url);
    result.set(key, {
      gsc_clicks:      traffic?.clicks ?? 0,
      gsc_impressions: traffic?.impressions ?? 0,
    });
  }

  return result;
}
