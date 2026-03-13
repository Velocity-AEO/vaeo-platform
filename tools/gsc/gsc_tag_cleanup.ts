/**
 * tools/gsc/gsc_tag_cleanup.ts
 *
 * Cleanup job for orphaned GSC verification meta tags.
 * Finds tags injected but never verified (or verification failed/timed out)
 * and removes them. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrphanedTagRecord {
  site_id:                string;
  domain:                 string;
  tag_injected_at:        string;
  verification_status:    string;
  hours_since_injection:  number;
}

export interface TagCleanupResult {
  cleaned:  number;
  failed:   number;
  records:  OrphanedTagRecord[];
}

export interface FindOrphanedDeps {
  loadSitesFn?: () => Promise<Array<{
    site_id:                       string;
    domain:                        string;
    gsc_verification_tag_injected: boolean;
    verification_status:           string;
    tag_injected_at:               string;
  }>>;
}

export interface RemoveTagDeps {
  removeFn?: (site_id: string, domain: string) => Promise<boolean>;
}

export interface CleanupJobDeps {
  findFn?:   (max_age_hours: number) => Promise<OrphanedTagRecord[]>;
  removeFn?: (site_id: string, domain: string) => Promise<boolean>;
  logFn?:    (message: string) => void;
}

// ── findOrphanedVerificationTags ─────────────────────────────────────────────

export async function findOrphanedVerificationTags(
  max_age_hours: number,
  deps?: FindOrphanedDeps,
): Promise<OrphanedTagRecord[]> {
  try {
    const loadSites = deps?.loadSitesFn ?? (async () => []);
    const sites = await loadSites();
    if (!Array.isArray(sites)) return [];

    const now = Date.now();
    const maxAgeMs = (max_age_hours ?? 24) * 60 * 60 * 1000;

    return sites
      .filter(s => {
        if (!s.gsc_verification_tag_injected) return false;
        if (s.verification_status === 'verified') return false;
        if (!s.tag_injected_at) return false;
        const injectedAt = new Date(s.tag_injected_at).getTime();
        return (now - injectedAt) > maxAgeMs;
      })
      .map(s => ({
        site_id:               s.site_id,
        domain:                s.domain ?? '',
        tag_injected_at:       s.tag_injected_at,
        verification_status:   s.verification_status ?? 'unknown',
        hours_since_injection: Math.round((now - new Date(s.tag_injected_at).getTime()) / (60 * 60 * 1000)),
      }));
  } catch {
    return [];
  }
}

// ── removeOrphanedTag ────────────────────────────────────────────────────────

export async function removeOrphanedTag(
  site_id: string,
  domain:  string,
  deps?:   RemoveTagDeps,
): Promise<boolean> {
  try {
    const removeFn = deps?.removeFn ?? (async () => false);
    return await removeFn(site_id, domain);
  } catch {
    return false;
  }
}

// ── runTagCleanupJob ─────────────────────────────────────────────────────────

export async function runTagCleanupJob(
  max_age_hours?: number,
  deps?: CleanupJobDeps,
): Promise<TagCleanupResult> {
  try {
    const maxAge = max_age_hours ?? 24;
    const findFn   = deps?.findFn   ?? ((h: number) => findOrphanedVerificationTags(h));
    const removeFn = deps?.removeFn ?? (async () => false);
    const logFn    = deps?.logFn    ?? (() => {});

    const orphans = await findFn(maxAge);
    let cleaned = 0;
    let failed = 0;

    for (const record of orphans) {
      try {
        const success = await removeFn(record.site_id, record.domain);
        if (success) {
          cleaned++;
          logFn(`✓ Removed orphaned tag from ${record.domain}`);
        } else {
          failed++;
          logFn(`✗ Failed to remove tag from ${record.domain}`);
        }
      } catch {
        failed++;
        logFn(`✗ Failed to remove tag from ${record.domain}`);
      }
    }

    return { cleaned, failed, records: orphans };
  } catch {
    return { cleaned: 0, failed: 0, records: [] };
  }
}
