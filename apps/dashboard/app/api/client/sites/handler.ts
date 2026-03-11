/**
 * app/api/client/sites/handler.ts
 *
 * Returns all sites for a tenant with health scores and fix counts.
 * Pure logic — all I/O goes through injectable deps.
 * Never throws — returns result objects with error fields on failure.
 */

import { calculateHealthScore } from '../../../../lib/scoring.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteRow {
  site_id:        string;
  site_url:       string;
  cms_type:       string;
  created_at:     string;
  /** Persisted by the onboard/audit command — null until first run. */
  health_score:   number | null;
  health_grade:   string | null;
  last_scored_at: string | null;
}

export interface IssueRow {
  site_id:          string;
  issue_type:       string;
  execution_status: string;
}

export interface ClientSite {
  site_id:        string;
  site_url:       string;
  domain:         string;
  cms_type:       string;
  health_score:   number;
  health_grade:   string;
  grade:          string;   // alias for health_grade — kept for backwards compat
  issues_found:   number;
  issues_fixed:   number;
  last_scan:      string | null;
  last_scored_at: string | null;
  created_at:     string;
}

export interface ClientSitesResult {
  ok:     boolean;
  sites?: ClientSite[];
  error?: string;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface ClientSitesDeps {
  /** Load all sites for a tenant. */
  loadSites:        (tenantId: string) => Promise<SiteRow[]>;
  /** Load all action_queue rows for a tenant (all statuses). */
  loadAllIssues:    (tenantId: string) => Promise<IssueRow[]>;
  /** Load most recent scan timestamp per site. */
  loadLastScans:    (tenantId: string) => Promise<Map<string, string>>;
}

// ── Statuses ─────────────────────────────────────────────────────────────────

const OPEN_STATUSES   = new Set(['queued', 'pending_approval', 'failed']);
const FIXED_STATUSES  = new Set(['deployed', 'completed', 'approved']);

// ── Handler ──────────────────────────────────────────────────────────────────

export async function getClientSites(
  tenantId: string,
  deps:     ClientSitesDeps,
): Promise<ClientSitesResult> {
  if (!tenantId) {
    return { ok: false, error: 'tenant_id is required' };
  }

  try {
    const [sites, issues, lastScans] = await Promise.all([
      deps.loadSites(tenantId),
      deps.loadAllIssues(tenantId),
      deps.loadLastScans(tenantId),
    ]);

    // Group issues by site_id
    const issueBySite = new Map<string, IssueRow[]>();
    for (const issue of issues) {
      const arr = issueBySite.get(issue.site_id) ?? [];
      arr.push(issue);
      issueBySite.set(issue.site_id, arr);
    }

    const clientSites: ClientSite[] = sites.map((site) => {
      const siteIssues = issueBySite.get(site.site_id) ?? [];
      const openIssues = siteIssues.filter((i) => OPEN_STATUSES.has(i.execution_status));
      const fixedIssues = siteIssues.filter((i) => FIXED_STATUSES.has(i.execution_status));

      // Prefer persisted score (written by onboard/audit); fall back to live calculation.
      const computed    = calculateHealthScore(openIssues);
      const healthScore = site.health_score ?? computed.total;
      const healthGrade = site.health_grade ?? computed.grade;

      return {
        site_id:        site.site_id,
        site_url:       site.site_url,
        domain:         site.site_url.replace(/^https?:\/\//, ''),
        cms_type:       site.cms_type,
        health_score:   healthScore,
        health_grade:   healthGrade,
        grade:          healthGrade,
        issues_found:   siteIssues.length,
        issues_fixed:   fixedIssues.length,
        last_scan:      lastScans.get(site.site_id) ?? null,
        last_scored_at: site.last_scored_at ?? null,
        created_at:     site.created_at,
      };
    });

    return { ok: true, sites: clientSites };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
