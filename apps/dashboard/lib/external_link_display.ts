/**
 * apps/dashboard/lib/external_link_display.ts
 *
 * Display helpers for the external link auditor.
 * Never throws.
 */

import type { DomainReputation } from '@tools/link_graph/external_link_checker.js';

// ── getReputationBadge ────────────────────────────────────────────────────────

export function getReputationBadge(
  reputation: DomainReputation,
): { label: string; color: string } {
  try {
    switch (reputation) {
      case 'trusted':   return { label: 'Trusted',   color: 'green'  };
      case 'low_value': return { label: 'Low Value', color: 'orange' };
      case 'spammy':    return { label: 'Spammy',    color: 'red'    };
      case 'unknown':   return { label: 'Unknown',   color: 'grey'   };
      case 'unchecked': return { label: 'Unchecked', color: 'grey'   };
      default:          return { label: 'Unknown',   color: 'grey'   };
    }
  } catch {
    return { label: 'Unknown', color: 'grey' };
  }
}

// ── getBrokenLinkSeverity ─────────────────────────────────────────────────────

export function getBrokenLinkSeverity(
  status_code: number | null,
): 'critical' | 'high' | 'medium' {
  try {
    if (status_code === null) return 'critical';
    if (status_code === 404)  return 'high';
    if (status_code >= 500)   return 'medium';
    if (status_code >= 400)   return 'medium';
    return 'medium';
  } catch {
    return 'critical';
  }
}

// ── formatResponseTime ────────────────────────────────────────────────────────

export function formatResponseTime(ms: number | null): string {
  try {
    if (ms === null || ms === undefined) return '—';
    const n = Math.round(ms);
    if (n < 500)  return `${n}ms (fast)`;
    if (n < 2000) return `${n}ms`;
    return `${n}ms (slow)`;
  } catch {
    return '—';
  }
}
