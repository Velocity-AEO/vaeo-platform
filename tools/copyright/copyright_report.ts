/**
 * tools/copyright/copyright_report.ts
 *
 * Aggregates scrape matches into a copyright protection report.
 * Top infringing domains, traffic impact estimates, severity breakdown.
 *
 * Never throws.
 */

import { randomUUID } from 'node:crypto';
import type { ScrapeMatch, ScrapeSeverity } from './scrape_detector.js';
import { simulateScrapeMatches } from './scrape_detector.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InfringingDomain {
  domain:       string;
  match_count:  number;
  max_severity: ScrapeSeverity;
  avg_similarity: number;
}

export interface CopyrightReport {
  report_id:           string;
  site_id:             string;
  domain:              string;
  total_matches:       number;
  severity_breakdown:  Record<ScrapeSeverity, number>;
  top_infringing:      InfringingDomain[];
  estimated_traffic_impact: number;
  pages_affected:      number;
  generated_at:        string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TRAFFIC_IMPACT: Record<ScrapeSeverity, number> = {
  critical: 500,
  high:     200,
  medium:   50,
  low:      10,
};

const SEVERITY_RANK: Record<ScrapeSeverity, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

function maxSeverity(a: ScrapeSeverity, b: ScrapeSeverity): ScrapeSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ── generateCopyrightReport ──────────────────────────────────────────────────

export function generateCopyrightReport(
  site_id: string,
  domain: string,
  matches: ScrapeMatch[],
): CopyrightReport {
  try {
    const breakdown: Record<ScrapeSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const domainMap = new Map<string, { count: number; maxSev: ScrapeSeverity; totalSim: number }>();
    const affectedUrls = new Set<string>();

    for (const m of matches) {
      breakdown[m.severity]++;
      affectedUrls.add(m.original_url);

      const existing = domainMap.get(m.scraped_domain);
      if (existing) {
        existing.count++;
        existing.maxSev = maxSeverity(existing.maxSev, m.severity);
        existing.totalSim += m.similarity;
      } else {
        domainMap.set(m.scraped_domain, { count: 1, maxSev: m.severity, totalSim: m.similarity });
      }
    }

    const infringing: InfringingDomain[] = Array.from(domainMap.entries())
      .map(([d, v]) => ({
        domain: d,
        match_count: v.count,
        max_severity: v.maxSev,
        avg_similarity: v.count > 0 ? v.totalSim / v.count : 0,
      }))
      .sort((a, b) => SEVERITY_RANK[b.max_severity] - SEVERITY_RANK[a.max_severity] || b.match_count - a.match_count)
      .slice(0, 3);

    let traffic = 0;
    for (const m of matches) {
      traffic += TRAFFIC_IMPACT[m.severity];
    }

    return {
      report_id: randomUUID(),
      site_id,
      domain,
      total_matches: matches.length,
      severity_breakdown: breakdown,
      top_infringing: infringing,
      estimated_traffic_impact: traffic,
      pages_affected: affectedUrls.size,
      generated_at: new Date().toISOString(),
    };
  } catch {
    return {
      report_id: randomUUID(),
      site_id,
      domain,
      total_matches: 0,
      severity_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
      top_infringing: [],
      estimated_traffic_impact: 0,
      pages_affected: 0,
      generated_at: new Date().toISOString(),
    };
  }
}

// ── simulateCopyrightReport ──────────────────────────────────────────────────

export function simulateCopyrightReport(site_id: string, domain: string): CopyrightReport {
  try {
    const matches = simulateScrapeMatches(site_id, domain, 12);
    return generateCopyrightReport(site_id, domain, matches);
  } catch {
    return generateCopyrightReport(site_id, domain, []);
  }
}
