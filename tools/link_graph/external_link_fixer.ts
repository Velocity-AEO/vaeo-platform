/**
 * tools/link_graph/external_link_fixer.ts
 *
 * Builds and applies fixes for broken, redirected, or low-value external links.
 * Never throws.
 */

import type { ExternalLinkCheckResult } from './external_link_checker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExternalLinkFix {
  source_url:       string;
  original_href:    string;
  fix_type:         'add_nofollow' | 'remove_link' | 'update_to_final_url';
  replacement_href: string | null;
  reason:           string;
}

// ── buildExternalLinkFix ──────────────────────────────────────────────────────

export function buildExternalLinkFix(
  check:       ExternalLinkCheckResult,
  _source_html: string,
): ExternalLinkFix | null {
  try {
    if (!check) return null;

    const { url: source_url, destination_url, status_code, is_broken, is_redirect, final_url, redirect_hops, domain_reputation, is_nofollow } = check;

    // 1. Broken link → remove
    if (is_broken) {
      const statusLabel = status_code !== null ? `${status_code}` : 'network error';
      return {
        source_url,
        original_href:    destination_url,
        fix_type:         'remove_link',
        replacement_href: null,
        reason:           `External link returns ${statusLabel}`,
      };
    }

    // 2. Redirect with final URL → update href
    if (is_redirect && final_url) {
      return {
        source_url,
        original_href:    destination_url,
        fix_type:         'update_to_final_url',
        replacement_href: final_url,
        reason:           `Update to skip ${redirect_hops} redirect hop${redirect_hops !== 1 ? 's' : ''}`,
      };
    }

    // 3. Low-value domain without nofollow → add nofollow
    if (domain_reputation === 'low_value' && !is_nofollow) {
      return {
        source_url,
        original_href:    destination_url,
        fix_type:         'add_nofollow',
        replacement_href: destination_url,
        reason:           'Add nofollow to low-value domain',
      };
    }

    // No fix needed
    return null;
  } catch {
    return null;
  }
}

// ── applyExternalLinkFix ──────────────────────────────────────────────────────

export async function applyExternalLinkFix(
  fix:      ExternalLinkFix,
  site_id:  string,
  platform: 'shopify' | 'wordpress',
  deps?: {
    shopifyFn?: (fix: ExternalLinkFix, site_id: string) => Promise<boolean>;
    wpFn?:      (fix: ExternalLinkFix, site_id: string) => Promise<boolean>;
  },
): Promise<boolean> {
  try {
    if (!fix || !site_id) return false;

    if (platform === 'shopify' && deps?.shopifyFn) {
      return await deps.shopifyFn(fix, site_id);
    }
    if (platform === 'wordpress' && deps?.wpFn) {
      return await deps.wpFn(fix, site_id);
    }

    // No platform handler available — log and return false
    process.stderr.write(
      `[EXTERNAL_FIXER] no handler for platform=${platform} fix_type=${fix.fix_type} ` +
      `source=${fix.source_url}\n`,
    );
    return false;
  } catch {
    return false;
  }
}
