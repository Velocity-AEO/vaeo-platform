/**
 * tools/pipeline/nightly_run.ts
 *
 * Nightly fix pipeline runner.
 * Processes active sites, skipping suspended ones and auto-resuming
 * where the suspension window has expired.
 *
 * Injectable deps — never throws.
 */

import { checkAndAutoResume } from './suspension_store.js';
import { recordFixFailure, recordFixSuccess } from './failure_tracker.js';
import type { SuspendDeps, ResumeDeps, AutoResumeDeps } from './suspension_store.js';
import type { FailureTrackerDeps, SuccessTrackerDeps } from './failure_tracker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SiteRecord {
  site_id:                  string;
  site_url:                 string;
  pipeline_suspended?:      boolean;
  pipeline_resume_at?:      string | null;
  consecutive_failures?:    number;
  pipeline_suspension_reason?: string | null;
}

export interface NightlyRunResult {
  total_sites:             number;
  processed:               number;
  succeeded:               number;
  failed:                  number;
  suspended_skipped:       number;
  auto_resumed:            number;
  errors:                  Array<{ site_id: string; error: string }>;
}

export interface NightlyRunDeps {
  /** Load all active sites to process */
  loadSitesFn?:  () => Promise<SiteRecord[]>;
  /** Process one site — returns ok + optional error */
  processSiteFn?: (site: SiteRecord) => Promise<{ ok: boolean; error?: string }>;
  /** Auto-resume deps (injectable) */
  autoResumeDeps?: AutoResumeDeps;
  /** Failure tracker deps per-site */
  failureDeps?:   FailureTrackerDeps;
  /** Success tracker deps per-site */
  successDeps?:   SuccessTrackerDeps;
  /** Optional log writer */
  logFn?:         (msg: string) => void;
}

// ── runNightlyPipeline ────────────────────────────────────────────────────────

export async function runNightlyPipeline(
  deps?: NightlyRunDeps,
): Promise<NightlyRunResult> {
  const result: NightlyRunResult = {
    total_sites:       0,
    processed:         0,
    succeeded:         0,
    failed:            0,
    suspended_skipped: 0,
    auto_resumed:      0,
    errors:            [],
  };

  const log = deps?.logFn ?? (() => {});

  try {
    // Auto-resume expired suspensions before processing
    const { resumed } = await checkAndAutoResume(deps?.autoResumeDeps).catch(() => ({ resumed: [] as string[] }));
    result.auto_resumed = resumed.length;
    if (resumed.length > 0) {
      log(`Auto-resumed this run: ${resumed.length} (${resumed.join(', ')})`);
    }

    // Load sites
    const sites = deps?.loadSitesFn
      ? await deps.loadSitesFn().catch(() => [] as SiteRecord[])
      : [];

    result.total_sites = sites.length;

    for (const site of sites) {
      try {
        const now = new Date();

        // Check suspension
        if (site.pipeline_suspended) {
          const resumeAt = site.pipeline_resume_at ? new Date(site.pipeline_resume_at) : null;

          if (!resumeAt || resumeAt > now) {
            // Still suspended — skip
            result.suspended_skipped++;
            log(`Site ${site.site_id} suspended until ${site.pipeline_resume_at ?? 'indefinitely'} — skipping`);
            continue;
          }

          // Suspension window expired — resume and proceed
          log(`Site ${site.site_id} suspension expired — auto-resuming`);
          if (deps?.autoResumeDeps?.resumeFn) {
            await deps.autoResumeDeps.resumeFn(site.site_id).catch(() => {});
          }
          result.auto_resumed++;
        }

        // Process the site
        if (!deps?.processSiteFn) {
          result.processed++;
          result.succeeded++;
          continue;
        }

        const processResult = await deps.processSiteFn(site).catch((err: unknown) => ({
          ok:    false as const,
          error: err instanceof Error ? err.message : String(err),
        }));

        result.processed++;

        if (processResult.ok) {
          result.succeeded++;
          await recordFixSuccess(site.site_id, deps?.successDeps).catch(() => {});
        } else {
          result.failed++;
          const errMsg = processResult.error ?? 'unknown error';
          result.errors.push({ site_id: site.site_id, error: errMsg });
          log(`Site ${site.site_id} failed: ${errMsg}`);

          await recordFixFailure(site.site_id, errMsg, deps?.failureDeps).catch(() => {});
        }
      } catch (siteErr) {
        result.processed++;
        result.failed++;
        const errMsg = siteErr instanceof Error ? siteErr.message : String(siteErr);
        result.errors.push({ site_id: site.site_id, error: errMsg });
      }
    }

    log(`Nightly run complete — processed: ${result.processed}, succeeded: ${result.succeeded}, failed: ${result.failed}, suspended_skipped: ${result.suspended_skipped}, auto_resumed: ${result.auto_resumed}`);
    log(`Suspended sites skipped: ${result.suspended_skipped}`);
    log(`Auto-resumed this run: ${result.auto_resumed}`);

    return result;
  } catch (err) {
    result.errors.push({ site_id: '', error: err instanceof Error ? err.message : String(err) });
    return result;
  }
}
