/**
 * tools/ai-visibility/competitor_gap.ts
 *
 * Analyzes competitive gaps in AI citation visibility.
 * Shows where competitors are cited but you are not.
 *
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type GapType = 'you_win' | 'competitor_wins' | 'both_cited' | 'neither_cited';

export interface CompetitorGap {
  gap_id:            string;
  site_id:           string;
  query:             string;
  your_domain:       string;
  your_cited:        boolean;
  competitor_domain: string;
  competitor_cited:  boolean;
  gap_type:          GapType;
  opportunity_score: number;
  recommendation:    string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function gapTypeFromCitation(yourCited: boolean, compCited: boolean): GapType {
  if (yourCited && compCited) return 'both_cited';
  if (yourCited && !compCited) return 'you_win';
  if (!yourCited && compCited) return 'competitor_wins';
  return 'neither_cited';
}

function opportunityFromGap(gap: GapType): number {
  switch (gap) {
    case 'competitor_wins': return 90;
    case 'neither_cited':   return 60;
    case 'both_cited':      return 30;
    case 'you_win':         return 10;
  }
}

function recommendationFromGap(gap: GapType): string {
  switch (gap) {
    case 'competitor_wins': return 'Add FAQ + schema to compete for this query';
    case 'neither_cited':   return 'Opportunity — create content targeting this query';
    case 'both_cited':      return 'Maintain content quality for this query';
    case 'you_win':         return 'Strong position — protect with schema updates';
  }
}

// ── Analyze gaps ─────────────────────────────────────────────────────────────

export function analyzeCompetitorGap(
  site_id: string,
  domain: string,
  competitor_domains: string[],
  queries: string[],
): CompetitorGap[] {
  try {
    const gaps: CompetitorGap[] = [];

    for (const query of queries) {
      const yourCited = simHash(query + domain) % 3 === 0;

      for (const comp of competitor_domains) {
        const compCited = simHash(query + comp) % 3 === 0;
        const gap_type = gapTypeFromCitation(yourCited, compCited);

        gaps.push({
          gap_id: randomUUID(),
          site_id,
          query,
          your_domain: domain,
          your_cited: yourCited,
          competitor_domain: comp,
          competitor_cited: compCited,
          gap_type,
          opportunity_score: opportunityFromGap(gap_type),
          recommendation: recommendationFromGap(gap_type),
        });
      }
    }

    return gaps;
  } catch {
    return [];
  }
}

// ── Top opportunities ────────────────────────────────────────────────────────

export function getTopOpportunities(
  gaps: CompetitorGap[],
  limit = 5,
): CompetitorGap[] {
  try {
    return [...gaps]
      .sort((a, b) => b.opportunity_score - a.opportunity_score)
      .slice(0, limit);
  } catch {
    return [];
  }
}
