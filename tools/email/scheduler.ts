/**
 * tools/email/scheduler.ts
 *
 * Orchestrates weekly digest generation + sending for all active tenants.
 * Designed to be called by a cron job (Vercel cron or similar).
 *
 * All DB and email calls injectable via SchedulerDeps.
 * Never throws — returns SchedulerResult.
 */

import { generateDigest, type DigestDeps } from './digest.js';
import { sendDigest, type SendDeps } from './send.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TenantSite {
  tenant_id:    string;
  site_id:      string;
  owner_email:  string;
}

export interface SchedulerResult {
  sent:     number;
  failed:   number;
  skipped:  number;
  errors:   Array<{ site_id: string; error: string }>;
}

export interface SchedulerDeps {
  /** Load all active tenant+site pairs with owner emails. */
  getActiveTenantSites: () => Promise<TenantSite[]>;
  /** DigestDeps factory — creates deps for a specific site. */
  buildDigestDeps:      (siteId: string, tenantId: string) => DigestDeps;
  /** SendDeps factory (optional — defaults to real Resend). */
  buildSendDeps?:       () => Partial<SendDeps>;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function scheduleWeeklyDigests(
  deps: SchedulerDeps,
): Promise<SchedulerResult> {
  const result: SchedulerResult = {
    sent:    0,
    failed:  0,
    skipped: 0,
    errors:  [],
  };

  let sites: TenantSite[];
  try {
    sites = await deps.getActiveTenantSites();
  } catch (err) {
    result.errors.push({
      site_id: '*',
      error:   err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  for (const site of sites) {
    // ── Generate digest ────────────────────────────────────────────────────
    const digestDeps = deps.buildDigestDeps(site.site_id, site.tenant_id);
    const report = await generateDigest(site.site_id, site.tenant_id, digestDeps);

    if (report.error) {
      result.failed++;
      result.errors.push({ site_id: site.site_id, error: report.error });
      continue;
    }

    // ── Skip if no activity ────────────────────────────────────────────────
    if (report.fixes_applied === 0 && report.issues_resolved === 0 &&
        report.health_before === report.health_after) {
      result.skipped++;
      continue;
    }

    // ── Send email ─────────────────────────────────────────────────────────
    const sendDeps = deps.buildSendDeps?.() ?? {};
    const sendResult = await sendDigest(site.owner_email, report, sendDeps);

    if (sendResult.ok) {
      result.sent++;
    } else {
      result.failed++;
      result.errors.push({ site_id: site.site_id, error: sendResult.error ?? 'Unknown send error' });
    }
  }

  return result;
}
