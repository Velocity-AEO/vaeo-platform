/**
 * tools/learning/confidence_scorer.ts
 *
 * Scores fix confidence using historical approval rates from the learnings table.
 * Injectable DB — never throws.
 */

import { queryPatterns, getBestFix, type PatternDb } from './pattern_engine.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfidenceScore {
  score:        number;
  tier:         'high' | 'medium' | 'low' | 'insufficient';
  samples:      number;
  success_rate: number;
  reasoning:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTier(score: number, samples: number): ConfidenceScore['tier'] {
  if (samples < 3)  return 'insufficient';
  if (score > 0.8)  return 'high';
  if (score >= 0.5) return 'medium';
  if (score >= 0.2) return 'low';
  return 'insufficient';
}

// ── scoreConfidence ───────────────────────────────────────────────────────────

/**
 * Queries historical success data and computes a confidence score for applying
 * a fix of the given issue_type.
 *
 * Score formula:
 *   base           = success_rate (0–1)
 *   samples bonus  = +0.1 if >10 samples, +0.05 if >5
 *   recency bonus  = +0.05 if last 3 approved (not implemented without raw rows)
 *
 * Tiers: high >0.8, medium 0.5–0.8, low 0.2–0.5, insufficient <0.2 or <3 samples
 */
export async function scoreConfidence(
  issue_type:   string,
  _proposed_fix: string,
  db:           PatternDb,
): Promise<ConfidenceScore> {
  try {
    const patterns = await queryPatterns({ issue_type, db, min_samples: 1 });

    // Aggregate across all page types for this issue_type
    let totalSamples = 0;
    let totalPassed  = 0;
    let totalDecided = 0;

    for (const p of patterns) {
      totalSamples += p.total;
      totalPassed  += p.passed;
      totalDecided += p.passed + p.failed;
    }

    if (totalSamples < 3) {
      return {
        score:        0,
        tier:         'insufficient',
        samples:      totalSamples,
        success_rate: 0,
        reasoning:    `Insufficient data: only ${totalSamples} sample(s) for ${issue_type}`,
      };
    }

    const success_rate = totalDecided > 0 ? totalPassed / totalDecided : 0;

    let score = success_rate;

    // Samples bonus
    if (totalSamples > 10) score += 0.1;
    else if (totalSamples > 5) score += 0.05;

    // Cap at 1
    score = Math.min(score, 1);

    const tier = toTier(score, totalSamples);

    const reasoning =
      `Based on ${totalSamples} sample(s) for ${issue_type}: ` +
      `${totalPassed}/${totalDecided} decided approved (${Math.round(success_rate * 100)}%). ` +
      (totalSamples > 10 ? '+0.10 samples bonus. ' : totalSamples > 5 ? '+0.05 samples bonus. ' : '') +
      `Tier: ${tier}.`;

    return { score, tier, samples: totalSamples, success_rate, reasoning };
  } catch (err) {
    return {
      score:        0,
      tier:         'insufficient',
      samples:      0,
      success_rate: 0,
      reasoning:    `Error scoring confidence: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── applyConfidenceToFix ──────────────────────────────────────────────────────

/**
 * Decorates a fix object with confidence metadata.
 * auto_approvable = true only when tier=high AND score>0.85
 */
export function applyConfidenceToFix(
  fix:   { proposed_fix: string; issue_type: string },
  score: ConfidenceScore,
): {
  proposed_fix:      string;
  issue_type:        string;
  confidence:        number;
  confidence_tier:   string;
  auto_approvable:   boolean;
} {
  return {
    ...fix,
    confidence:      score.score,
    confidence_tier: score.tier,
    auto_approvable: score.tier === 'high' && score.score > 0.85,
  };
}
