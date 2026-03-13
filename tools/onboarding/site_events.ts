/**
 * tools/onboarding/site_events.ts
 *
 * Records and queries site lifecycle events.
 * Used by onboarding progress to determine step completion.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type SiteEventType =
  | 'issues_viewed'
  | 'first_fix_applied'
  | 'gsc_connected'
  | 'onboarding_dismissed'
  | 'first_crawl_complete'
  | 'store_connected'
  | 'setup_complete';

export interface SiteEvent {
  event_id:   string;
  site_id:    string;
  event_type: SiteEventType;
  metadata:   Record<string, unknown>;
  created_at: string;
}

export interface SiteEventDeps {
  insertFn?: (site_id: string, event_type: string, metadata: Record<string, unknown>) => Promise<boolean>;
  queryFn?:  (site_id: string, event_type: string) => Promise<SiteEvent | null>;
  listFn?:   (site_id: string) => Promise<SiteEvent[]>;
}

// ── recordSiteEvent ──────────────────────────────────────────────────────────

export async function recordSiteEvent(
  site_id: string,
  event_type: SiteEventType,
  metadata: Record<string, unknown> = {},
  deps?: SiteEventDeps,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!site_id || !event_type) {
      return { ok: false, error: 'missing site_id or event_type' };
    }

    const insert = deps?.insertFn ?? defaultInsert;
    const success = await insert(site_id, event_type, metadata);

    return { ok: success };
  } catch {
    return { ok: false, error: 'failed to record event' };
  }
}

// ── hasSiteEvent ─────────────────────────────────────────────────────────────

export async function hasSiteEvent(
  site_id: string,
  event_type: SiteEventType,
  deps?: SiteEventDeps,
): Promise<boolean> {
  try {
    if (!site_id || !event_type) return false;
    const query = deps?.queryFn ?? defaultQuery;
    const event = await query(site_id, event_type);
    return event !== null;
  } catch {
    return false;
  }
}

// ── getSiteEvent ─────────────────────────────────────────────────────────────

export async function getSiteEvent(
  site_id: string,
  event_type: SiteEventType,
  deps?: SiteEventDeps,
): Promise<SiteEvent | null> {
  try {
    if (!site_id || !event_type) return null;
    const query = deps?.queryFn ?? defaultQuery;
    return await query(site_id, event_type);
  } catch {
    return null;
  }
}

// ── listSiteEvents ───────────────────────────────────────────────────────────

export async function listSiteEvents(
  site_id: string,
  deps?: SiteEventDeps,
): Promise<SiteEvent[]> {
  try {
    if (!site_id) return [];
    const list = deps?.listFn ?? defaultList;
    return await list(site_id);
  } catch {
    return [];
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultInsert(_id: string, _type: string, _meta: Record<string, unknown>) { return false; }
async function defaultQuery(_id: string, _type: string): Promise<SiteEvent | null> { return null; }
async function defaultList(_id: string): Promise<SiteEvent[]> { return []; }
