/**
 * apps/dashboard/lib/agency_portal_logic.ts
 *
 * Pure logic for agency portal layout. Never throws.
 */

import type { AgencyPlan } from '@tools/agency/agency_account.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgencyClientSite {
  site_id:     string;
  domain:      string;
  platform:    string;
  client_name: string;
  active:      boolean;
}

// ── getAgencyPlanBadgeColor ──────────────────────────────────────────────────

export function getAgencyPlanBadgeColor(plan: AgencyPlan): string {
  try {
    switch (plan) {
      case 'starter':    return 'bg-gray-100 text-gray-700';
      case 'growth':     return 'bg-blue-100 text-blue-700';
      case 'enterprise': return 'bg-purple-100 text-purple-700';
      default:           return 'bg-gray-100 text-gray-700';
    }
  } catch {
    return 'bg-gray-100 text-gray-700';
  }
}

// ── getCapacityBarWidth ──────────────────────────────────────────────────────

export function getCapacityBarWidth(active: number, max: number): number {
  try {
    if (!max || max <= 0) return 0;
    const pct = ((active ?? 0) / max) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  } catch {
    return 0;
  }
}

// ── getCapacityBarColor ──────────────────────────────────────────────────────

export function getCapacityBarColor(percent: number): string {
  try {
    const p = percent ?? 0;
    if (p >= 90) return 'bg-red-500';
    if (p >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  } catch {
    return 'bg-green-500';
  }
}

// ── sortRosterByDomain ───────────────────────────────────────────────────────

export function sortRosterByDomain(roster: AgencyClientSite[]): AgencyClientSite[] {
  try {
    if (!Array.isArray(roster)) return [];
    return [...roster].sort((a, b) =>
      (a.domain ?? '').localeCompare(b.domain ?? ''),
    );
  } catch {
    return [];
  }
}

// ── getRosterTableRows ───────────────────────────────────────────────────────

export function getRosterTableRows(
  roster: AgencyClientSite[],
): Array<{
  domain:      string;
  platform:    string;
  site_id:     string;
  client_name: string;
  active:      boolean;
}> {
  try {
    if (!Array.isArray(roster)) return [];
    return roster.map(s => ({
      domain:      s.domain ?? '',
      platform:    s.platform ?? '',
      site_id:     s.site_id ?? '',
      client_name: s.client_name ?? '',
      active:      s.active ?? false,
    }));
  } catch {
    return [];
  }
}
