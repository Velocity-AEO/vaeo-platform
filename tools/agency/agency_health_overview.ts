/**
 * tools/agency/agency_health_overview.ts
 *
 * Aggregates health data across all client sites in an agency roster.
 * Pure logic + injectable deps. Never throws.
 */

import type { Grade } from '../scoring/health_score.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientSiteHealth {
  site_id:      string;
  domain:       string;
  score:        number;   // 0–100
  grade:        Grade;
  total_issues: number;
  last_scan_at: string | null;
}

export interface AgencyHealthOverview {
  agency_id:        string;
  total_sites:      number;
  avg_score:        number;
  avg_grade:        Grade;
  sites_by_grade:   Record<Grade, number>;
  worst_performers: ClientSiteHealth[];
  best_performers:  ClientSiteHealth[];
  sites:            ClientSiteHealth[];
  computed_at:      string;
}

export interface AgencyHealthDeps {
  loadRosterHealth: (agency_id: string) => Promise<ClientSiteHealth[]>;
}

// ── scoreToGrade ─────────────────────────────────────────────────────────────

export function scoreToGrade(score: number): Grade {
  try {
    const s = score ?? 0;
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    return 'F';
  } catch {
    return 'F';
  }
}

// ── computeAverageScore ──────────────────────────────────────────────────────

export function computeAverageScore(sites: ClientSiteHealth[]): number {
  try {
    if (!Array.isArray(sites) || sites.length === 0) return 0;
    const sum = sites.reduce((acc, s) => acc + (s.score ?? 0), 0);
    return Math.round(sum / sites.length);
  } catch {
    return 0;
  }
}

// ── countByGrade ─────────────────────────────────────────────────────────────

export function countByGrade(sites: ClientSiteHealth[]): Record<Grade, number> {
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  try {
    if (!Array.isArray(sites)) return counts;
    for (const s of sites) {
      const g = s.grade ?? 'F';
      counts[g] = (counts[g] ?? 0) + 1;
    }
    return counts;
  } catch {
    return counts;
  }
}

// ── getWorstPerformers ───────────────────────────────────────────────────────

export function getWorstPerformers(sites: ClientSiteHealth[], limit = 5): ClientSiteHealth[] {
  try {
    if (!Array.isArray(sites)) return [];
    return [...sites]
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ── getBestPerformers ────────────────────────────────────────────────────────

export function getBestPerformers(sites: ClientSiteHealth[], limit = 5): ClientSiteHealth[] {
  try {
    if (!Array.isArray(sites)) return [];
    return [...sites]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ── buildAgencyHealthOverview ────────────────────────────────────────────────

export function buildAgencyHealthOverview(
  agency_id: string,
  sites: ClientSiteHealth[],
): AgencyHealthOverview {
  try {
    const safeSites = Array.isArray(sites) ? sites : [];
    const avg = computeAverageScore(safeSites);
    return {
      agency_id:        agency_id ?? '',
      total_sites:      safeSites.length,
      avg_score:        avg,
      avg_grade:        scoreToGrade(avg),
      sites_by_grade:   countByGrade(safeSites),
      worst_performers: getWorstPerformers(safeSites),
      best_performers:  getBestPerformers(safeSites),
      sites:            safeSites,
      computed_at:      new Date().toISOString(),
    };
  } catch {
    return {
      agency_id:        agency_id ?? '',
      total_sites:      0,
      avg_score:        0,
      avg_grade:        'F',
      sites_by_grade:   { A: 0, B: 0, C: 0, D: 0, F: 0 },
      worst_performers: [],
      best_performers:  [],
      sites:            [],
      computed_at:      new Date().toISOString(),
    };
  }
}

// ── fetchAgencyHealthOverview ────────────────────────────────────────────────

export async function fetchAgencyHealthOverview(
  agency_id: string,
  deps?: Partial<AgencyHealthDeps>,
): Promise<AgencyHealthOverview> {
  try {
    const loadFn = deps?.loadRosterHealth ?? (async () => []);
    const sites = await loadFn(agency_id);
    return buildAgencyHealthOverview(agency_id, sites);
  } catch {
    return buildAgencyHealthOverview(agency_id, []);
  }
}
