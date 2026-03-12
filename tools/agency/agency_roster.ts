/**
 * tools/agency/agency_roster.ts
 *
 * Agency client site roster: build, filter, search, summarize.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgencyClientSite {
  roster_id:    string;
  agency_id:    string;
  site_id:      string;
  domain:       string;
  platform:     'shopify' | 'wordpress';
  added_at:     string;
  active:       boolean;
  client_name:  string | null;
  client_email: string | null;
  notes:        string | null;
}

// ── buildRosterEntry ──────────────────────────────────────────────────────────

export function buildRosterEntry(
  agency_id:    string,
  site_id:      string,
  domain:       string,
  platform:     'shopify' | 'wordpress',
  client_name?: string,
  client_email?: string,
): AgencyClientSite {
  try {
    return {
      roster_id:    `rst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agency_id:    agency_id ?? '',
      site_id:      site_id ?? '',
      domain:       domain ?? '',
      platform,
      added_at:     new Date().toISOString(),
      active:       true,
      client_name:  client_name ?? null,
      client_email: client_email ?? null,
      notes:        null,
    };
  } catch {
    return {
      roster_id:    'rst_err',
      agency_id:    '',
      site_id:      '',
      domain:       '',
      platform:     'shopify',
      added_at:     new Date().toISOString(),
      active:       false,
      client_name:  null,
      client_email: null,
      notes:        null,
    };
  }
}

// ── filterActiveRoster ────────────────────────────────────────────────────────

export function filterActiveRoster(roster: AgencyClientSite[]): AgencyClientSite[] {
  try {
    return Array.isArray(roster) ? roster.filter((e) => e.active) : [];
  } catch {
    return [];
  }
}

// ── getRosterByPlatform ───────────────────────────────────────────────────────

export function getRosterByPlatform(
  roster:   AgencyClientSite[],
  platform: 'shopify' | 'wordpress',
): AgencyClientSite[] {
  try {
    return Array.isArray(roster) ? roster.filter((e) => e.platform === platform) : [];
  } catch {
    return [];
  }
}

// ── searchRoster ──────────────────────────────────────────────────────────────

export function searchRoster(
  roster: AgencyClientSite[],
  query:  string,
): AgencyClientSite[] {
  try {
    if (!query) return Array.isArray(roster) ? roster : [];
    const q = query.toLowerCase();
    return (Array.isArray(roster) ? roster : []).filter((e) => {
      const domainMatch = (e.domain ?? '').toLowerCase().includes(q);
      const nameMatch   = (e.client_name ?? '').toLowerCase().includes(q);
      return domainMatch || nameMatch;
    });
  } catch {
    return [];
  }
}

// ── getRosterSummary ──────────────────────────────────────────────────────────

export function getRosterSummary(roster: AgencyClientSite[]): {
  total:     number;
  active:    number;
  shopify:   number;
  wordpress: number;
} {
  try {
    const arr = Array.isArray(roster) ? roster : [];
    return {
      total:     arr.length,
      active:    arr.filter((e) => e.active).length,
      shopify:   arr.filter((e) => e.platform === 'shopify').length,
      wordpress: arr.filter((e) => e.platform === 'wordpress').length,
    };
  } catch {
    return { total: 0, active: 0, shopify: 0, wordpress: 0 };
  }
}

// ── loadAgencyRoster ──────────────────────────────────────────────────────────

export async function loadAgencyRoster(
  agency_id: string,
  deps?:     { loadFn?: (agency_id: string) => Promise<AgencyClientSite[]> },
): Promise<AgencyClientSite[]> {
  try {
    const loadFn = deps?.loadFn ?? defaultLoad;
    return await loadFn(agency_id);
  } catch {
    return [];
  }
}

async function defaultLoad(_agency_id: string): Promise<AgencyClientSite[]> {
  return [];
}
