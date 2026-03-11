/**
 * tools/gsc/gsc_client.ts
 *
 * Google Search Console API client.
 * Injectable fetch for tests. Non-fatal: errors return empty arrays or null.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GSCProperty {
  siteUrl:         string;
  permissionLevel: string;
}

export interface GSCSearchQuery {
  startDate:              string;
  endDate:                string;
  dimensions:             string[];
  rowLimit?:              number;
  dimensionFilterGroups?: unknown[];
}

export interface GSCRow {
  keys:        string[];
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

export interface GSCClient {
  listProperties(): Promise<GSCProperty[]>;
  query(siteUrl: string, req: GSCSearchQuery): Promise<GSCRow[]>;
  getTopPages(siteUrl: string, days?: number, limit?: number): Promise<GSCRow[]>;
  getPageMetrics(siteUrl: string, url: string, days?: number): Promise<GSCRow | null>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.googleapis.com/webmasters/v3';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function encodeSiteUrl(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGSCClient(
  accessToken: string,
  options?: { fetch?: typeof fetch },
): GSCClient {
  const f = options?.fetch ?? globalThis.fetch;

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type':  'application/json',
  };

  return {
    async listProperties(): Promise<GSCProperty[]> {
      try {
        const res = await f(`${BASE_URL}/sites`, { headers });
        if (!res.ok) return [];
        const data = await res.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
        return (data.siteEntry ?? []).map((e) => ({
          siteUrl:         e.siteUrl,
          permissionLevel: e.permissionLevel,
        }));
      } catch {
        return [];
      }
    },

    async query(siteUrl: string, req: GSCSearchQuery): Promise<GSCRow[]> {
      try {
        const url = `${BASE_URL}/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`;
        const res = await f(url, {
          method:  'POST',
          headers,
          body:    JSON.stringify(req),
        });
        if (!res.ok) return [];
        const data = await res.json() as { rows?: GSCRow[] };
        return data.rows ?? [];
      } catch {
        return [];
      }
    },

    async getTopPages(siteUrl: string, days = 28, limit = 100): Promise<GSCRow[]> {
      const req: GSCSearchQuery = {
        startDate:  daysAgo(days),
        endDate:    daysAgo(1),
        dimensions: ['page'],
        rowLimit:   limit,
      };
      const rows = await this.query(siteUrl, req);
      rows.sort((a, b) => b.clicks - a.clicks);
      return rows;
    },

    async getPageMetrics(siteUrl: string, url: string, days = 28): Promise<GSCRow | null> {
      const req: GSCSearchQuery = {
        startDate:  daysAgo(days),
        endDate:    daysAgo(1),
        dimensions: ['page'],
        rowLimit:   1,
        dimensionFilterGroups: [{
          filters: [{ dimension: 'page', expression: url }],
        }],
      };
      const rows = await this.query(siteUrl, req);
      return rows[0] ?? null;
    },
  };
}
