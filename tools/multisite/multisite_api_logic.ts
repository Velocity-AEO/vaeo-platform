/**
 * tools/multisite/multisite_api_logic.ts
 *
 * Pure helpers for the multisite dashboard API layer.
 * Never throws.
 */

import type { MultisiteSummary } from './multisite_aggregator.js';
import type { AccountSites }     from './multisite_account_resolver.js';

// ── buildMultisiteResponse ────────────────────────────────────────────────────

export interface MultisiteResponse {
  account_id:   string;
  account_type: string;
  summary:      MultisiteSummary;
  show_multisite_dashboard: boolean;
}

export function buildMultisiteResponse(
  account:  AccountSites,
  summary:  MultisiteSummary,
): MultisiteResponse {
  try {
    return {
      account_id:               account?.account_id   ?? '',
      account_type:             account?.account_type ?? 'direct',
      summary,
      show_multisite_dashboard: (account?.account_type === 'agency') || (account?.site_count ?? 0) > 1,
    };
  } catch {
    return {
      account_id:               '',
      account_type:             'direct',
      summary,
      show_multisite_dashboard: false,
    };
  }
}

// ── getMultisiteCacheHeader ───────────────────────────────────────────────────

export function getMultisiteCacheHeader(account_type: string): string {
  try {
    // Agency dashboards get a short TTL; direct accounts get no-store
    return account_type === 'agency' ? 'public, max-age=60, stale-while-revalidate=120' : 'no-store';
  } catch {
    return 'no-store';
  }
}

// ── parseAccountIdParam ───────────────────────────────────────────────────────

export function parseAccountIdParam(raw: unknown): string | null {
  try {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
    return raw.trim();
  } catch {
    return null;
  }
}

// ── buildEmptyMultisiteResponse ───────────────────────────────────────────────

export function buildEmptyMultisiteResponse(account_id: string): MultisiteResponse {
  try {
    const generated_at = new Date().toISOString();
    const emptySummary: MultisiteSummary = {
      account_id,
      total_sites:            0,
      healthy_sites:          0,
      needs_attention_sites:  0,
      critical_sites:         0,
      no_data_sites:          0,
      total_fixes_applied_7d: 0,
      total_open_issues:      0,
      average_health_score:   null,
      snapshots:              [],
      generated_at,
    };
    return {
      account_id,
      account_type:             'direct',
      summary:                  emptySummary,
      show_multisite_dashboard: false,
    };
  } catch {
    return {
      account_id:   account_id ?? '',
      account_type: 'direct',
      summary:      {} as MultisiteSummary,
      show_multisite_dashboard: false,
    };
  }
}
