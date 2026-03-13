/**
 * tools/link_graph/canonical_conflict_fixer.ts
 *
 * Fixes canonical conflicts by updating internal link hrefs
 * to point to canonical URLs. Never throws.
 */

import type { CanonicalConflict } from './canonical_conflict_detector.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FixResult {
  success:     boolean;
  fix_applied: string;
  error:       string | null;
}

export interface BulkFixResult {
  fixed:   number;
  failed:  number;
  skipped: number;
  results: Array<{ conflict: CanonicalConflict; success: boolean }>;
}

export interface FixDeps {
  shopifyFn?: (source_url: string, old_href: string, new_href: string) => Promise<boolean>;
  wpFn?:      (source_url: string, old_href: string, new_href: string) => Promise<boolean>;
}

export interface BulkFixDeps {
  fixFn?: (conflict: CanonicalConflict, site_id: string, platform: string) => Promise<FixResult>;
}

// ── fixCanonicalConflict ─────────────────────────────────────────────────────

export async function fixCanonicalConflict(
  conflict: CanonicalConflict,
  site_id: string,
  platform: 'shopify' | 'wordpress',
  deps?: FixDeps,
): Promise<FixResult> {
  try {
    if (!conflict || !site_id) {
      return { success: false, fix_applied: '', error: 'missing_input' };
    }

    if (conflict.fix_action !== 'update_link_to_canonical') {
      return {
        success: false,
        fix_applied: '',
        error: `cannot_auto_fix: ${conflict.fix_action} requires manual review`,
      };
    }

    if (!conflict.fix_href) {
      return { success: false, fix_applied: '', error: 'no_fix_href' };
    }

    if (platform === 'shopify' && deps?.shopifyFn) {
      const ok = await deps.shopifyFn(conflict.source_url, conflict.linked_url, conflict.fix_href);
      return {
        success: ok,
        fix_applied: ok ? `Updated link on ${conflict.source_url}: ${conflict.linked_url} → ${conflict.fix_href}` : '',
        error: ok ? null : 'shopify_fix_failed',
      };
    }

    if (platform === 'wordpress' && deps?.wpFn) {
      const ok = await deps.wpFn(conflict.source_url, conflict.linked_url, conflict.fix_href);
      return {
        success: ok,
        fix_applied: ok ? `Updated link on ${conflict.source_url}: ${conflict.linked_url} → ${conflict.fix_href}` : '',
        error: ok ? null : 'wordpress_fix_failed',
      };
    }

    return { success: false, fix_applied: '', error: 'no_platform_handler' };
  } catch {
    return { success: false, fix_applied: '', error: 'unexpected_error' };
  }
}

// ── bulkFixCanonicalConflicts ────────────────────────────────────────────────

export async function bulkFixCanonicalConflicts(
  conflicts: CanonicalConflict[],
  site_id: string,
  platform: 'shopify' | 'wordpress',
  deps?: BulkFixDeps,
): Promise<BulkFixResult> {
  const empty: BulkFixResult = { fixed: 0, failed: 0, skipped: 0, results: [] };
  try {
    if (!Array.isArray(conflicts) || !site_id) return empty;

    const fixFn = deps?.fixFn ?? (async (c: CanonicalConflict, s: string, p: string) =>
      fixCanonicalConflict(c, s, p as 'shopify' | 'wordpress'));

    let fixed = 0;
    let failed = 0;
    let skipped = 0;
    const results: BulkFixResult['results'] = [];

    for (const conflict of conflicts) {
      if (!conflict) continue;

      if (conflict.fix_action !== 'update_link_to_canonical') {
        skipped++;
        results.push({ conflict, success: false });
        continue;
      }

      try {
        const result = await fixFn(conflict, site_id, platform);
        if (result.success) {
          fixed++;
          results.push({ conflict, success: true });
        } else {
          failed++;
          results.push({ conflict, success: false });
        }
      } catch {
        failed++;
        results.push({ conflict, success: false });
      }
    }

    return { fixed, failed, skipped, results };
  } catch {
    return empty;
  }
}
