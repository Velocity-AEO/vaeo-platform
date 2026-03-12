/**
 * tools/email/digest_aggregator.ts
 *
 * Aggregates real platform data (action_queue, health scores, sites)
 * into a TenantDigestData structure used by the email digest pipeline.
 *
 * Pure injectable-DB pattern — never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestPeriod {
  from:  string;   // ISO timestamp — start of period (inclusive)
  to:    string;   // ISO timestamp — end of period (inclusive)
  days:  number;
}

export interface SiteDigestData {
  site_id:                  string;
  domain:                   string;
  health_score_current:     number;
  health_score_previous:    number;
  health_score_delta:       number;
  fixes_applied:            number;
  fixes_pending:            number;
  top_fixes:                { issue_type: string; url: string; applied_at: string }[];
  regressions_detected:     number;
  aeo_items_added:          number;
  timestamp_fixes_applied:  number;
  gsc_clicks_delta:         number;
  gsc_impressions_delta:    number;
}

export interface TenantDigestData {
  tenant_id:           string;
  period:              DigestPeriod;
  sites:               SiteDigestData[];
  total_fixes_applied: number;
  total_sites:         number;
  sites_improved:      number;
  sites_regressed:     number;
  generated_at:        string;
}

// ── Internal DB types ─────────────────────────────────────────────────────────

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  neq(col: string, val: unknown): DbQ<T>;
  gte(col: string, val: unknown): DbQ<T>;
  lte(col: string, val: unknown): DbQ<T>;
  in(col: string, vals: unknown[]): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface AggDb {
  from(table: string): DbQ<unknown[]>;
}

// ── AEO / Timestamp issue type sets ──────────────────────────────────────────

const AEO_TYPES = new Set([
  'SPEAKABLE_MISSING', 'AEO_SCHEMA_INCOMPLETE',
  'FAQ_OPPORTUNITY', 'ANSWER_BLOCK_OPPORTUNITY',
]);

const TIMESTAMP_TYPES = new Set([
  'TIMESTAMP_MISSING', 'TIMESTAMP_STALE',
  'DATE_MODIFIED_MISSING', 'DATE_MODIFIED_STALE',
]);

const PENDING_STATUSES = new Set(['queued', 'pending_approval', 'pending', 'failed']);
const DEPLOYED_STATUSES = new Set(['deployed', 'verified']);

// ── buildTenantDigest ─────────────────────────────────────────────────────────

export async function buildTenantDigest(
  tenant_id: string,
  period:    DigestPeriod,
  db:        unknown,
): Promise<TenantDigestData> {
  const adb = db as AggDb;
  const generated_at = new Date().toISOString();

  try {
    // 1. Load all sites for this tenant
    const { data: sitesRaw, error: sitesErr } = await (adb.from('sites') as DbQ<Record<string, unknown>[]>)
      .select('site_id, domain, site_url')
      .eq('tenant_id', tenant_id);

    if (sitesErr || !sitesRaw?.length) {
      return emptyDigest(tenant_id, period, generated_at);
    }

    const siteRows = sitesRaw as Array<{ site_id: string; domain?: string; site_url?: string }>;

    // 2. Load all action_queue rows deployed in period
    const { data: actionsRaw } = await (adb.from('action_queue') as DbQ<Record<string, unknown>[]>)
      .select('site_id, issue_type, url, execution_status, updated_at')
      .eq('tenant_id', tenant_id)
      .gte('updated_at', period.from)
      .lte('updated_at', period.to);

    const allActions = (actionsRaw ?? []) as Array<{
      site_id: string; issue_type: string; url: string;
      execution_status: string; updated_at: string;
    }>;

    // 3. Load pending actions (across all time, for fixes_pending count)
    const { data: pendingRaw } = await (adb.from('action_queue') as DbQ<Record<string, unknown>[]>)
      .select('site_id, execution_status')
      .eq('tenant_id', tenant_id)
      .in('execution_status', [...PENDING_STATUSES]);

    const allPending = (pendingRaw ?? []) as Array<{ site_id: string; execution_status: string }>;

    // 4. Load health scores (current + previous)
    const { data: scoresRaw } = await (adb.from('site_health_scores') as DbQ<Record<string, unknown>[]>)
      .select('site_id, score, recorded_at')
      .eq('tenant_id', tenant_id)
      .order('recorded_at', { ascending: false });

    const allScores = (scoresRaw ?? []) as Array<{ site_id: string; score: number; recorded_at: string }>;

    // 5. Load GSC metrics delta if available
    const { data: gscRaw } = await (adb.from('gsc_metrics_delta') as DbQ<Record<string, unknown>[]>)
      .select('site_id, clicks_delta, impressions_delta')
      .eq('tenant_id', tenant_id)
      .gte('recorded_at', period.from)
      .lte('recorded_at', period.to);

    const allGsc = (gscRaw ?? []) as Array<{ site_id: string; clicks_delta: number; impressions_delta: number }>;

    // 6. Build per-site data
    const sites: SiteDigestData[] = siteRows.map((row) => {
      const siteId = row.site_id;
      const domain = row.domain ?? row.site_url ?? siteId;

      // Actions for this site in period
      const siteActions = allActions.filter((a) => a.site_id === siteId);
      const deployed = siteActions.filter((a) => DEPLOYED_STATUSES.has(a.execution_status));

      const fixes_applied = deployed.length;
      const fixes_pending = allPending.filter((a) => a.site_id === siteId).length;

      // top_fixes: top 3 by applied_at desc
      const sortedDeployed = [...deployed].sort(
        (a, b) => b.updated_at.localeCompare(a.updated_at),
      );
      const top_fixes = sortedDeployed.slice(0, 3).map((a) => ({
        issue_type: a.issue_type,
        url:        a.url,
        applied_at: a.updated_at,
      }));

      // AEO / timestamp subcounts
      const aeo_items_added = deployed.filter((a) => AEO_TYPES.has(a.issue_type)).length;
      const timestamp_fixes_applied = deployed.filter((a) => TIMESTAMP_TYPES.has(a.issue_type)).length;

      // Health scores: current = most recent, previous = latest before period.from
      const siteScores = allScores.filter((s) => s.site_id === siteId);
      const current = siteScores[0];
      const previous = siteScores.find((s) => s.recorded_at < period.from) ?? siteScores[siteScores.length - 1];
      const health_score_current  = current?.score  ?? 0;
      const health_score_previous = previous?.score ?? 0;
      const health_score_delta    = health_score_current - health_score_previous;

      // Regressions: action_queue rows that went from deployed → failed in period
      const regressions_detected = siteActions.filter((a) => a.execution_status === 'regression_detected').length;

      // GSC delta
      const gscEntry = allGsc.find((g) => g.site_id === siteId);
      const gsc_clicks_delta      = gscEntry?.clicks_delta      ?? 0;
      const gsc_impressions_delta = gscEntry?.impressions_delta ?? 0;

      return {
        site_id: siteId,
        domain,
        health_score_current,
        health_score_previous,
        health_score_delta,
        fixes_applied,
        fixes_pending,
        top_fixes,
        regressions_detected,
        aeo_items_added,
        timestamp_fixes_applied,
        gsc_clicks_delta,
        gsc_impressions_delta,
      };
    });

    const total_fixes_applied = sites.reduce((s, x) => s + x.fixes_applied, 0);
    const sites_improved  = sites.filter((x) => x.health_score_delta > 0).length;
    const sites_regressed = sites.filter((x) => x.health_score_delta < 0).length;

    return {
      tenant_id,
      period,
      sites,
      total_fixes_applied,
      total_sites: sites.length,
      sites_improved,
      sites_regressed,
      generated_at,
    };
  } catch {
    return emptyDigest(tenant_id, period, generated_at);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyDigest(tenant_id: string, period: DigestPeriod, generated_at: string): TenantDigestData {
  return {
    tenant_id,
    period,
    sites:               [],
    total_fixes_applied: 0,
    total_sites:         0,
    sites_improved:      0,
    sites_regressed:     0,
    generated_at,
  };
}
