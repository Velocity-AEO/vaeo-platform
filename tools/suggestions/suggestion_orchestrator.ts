/**
 * tools/suggestions/suggestion_orchestrator.ts
 *
 * Orchestrates rule-based and AI suggestion engines.
 * Supports running either or both concurrently.
 * Never throws.
 */

import type { RankingSnapshot } from '../rankings/ranking_entry.js';
import type { SuggestionSiteStats, FixHistoryPage } from './rule_engine.js';
import type { Suggestion, SuggestionSet, SuggestionPriority } from './suggestion.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionMode = 'rule' | 'ai' | 'both';

export interface OrchestratorResult {
  rule_suggestions: SuggestionSet | null;
  ai_suggestions:   SuggestionSet | null;
  combined:         Suggestion[];
  mode:             SuggestionMode;
}

// ── Priority ordering ─────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateByFixType(suggestions: Suggestion[]): Suggestion[] {
  const byFixType = new Map<string, Suggestion>();
  for (const s of suggestions) {
    const existing = byFixType.get(s.fix_type);
    if (!existing || (PRIORITY_ORDER[s.priority] ?? 9) < (PRIORITY_ORDER[existing.priority] ?? 9)) {
      byFixType.set(s.fix_type, s);
    }
  }
  return [...byFixType.values()];
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function generateSuggestions(
  site_id: string,
  stats: SuggestionSiteStats,
  rankings: RankingSnapshot,
  history: FixHistoryPage,
  mode: SuggestionMode,
  deps?: {
    runRuleEngine?: (
      site_id: string,
      stats: SuggestionSiteStats,
      rankings: RankingSnapshot,
      history: FixHistoryPage,
    ) => Promise<SuggestionSet>;
    runAIEngine?: (
      site_id: string,
      stats: SuggestionSiteStats,
      rankings: RankingSnapshot,
      history: FixHistoryPage,
    ) => Promise<SuggestionSet>;
  },
): Promise<OrchestratorResult> {
  try {
    let ruleResult: SuggestionSet | null = null;
    let aiResult: SuggestionSet | null = null;

    if (mode === 'rule') {
      if (deps?.runRuleEngine) {
        ruleResult = await deps.runRuleEngine(site_id, stats, rankings, history);
      }
    } else if (mode === 'ai') {
      if (deps?.runAIEngine) {
        aiResult = await deps.runAIEngine(site_id, stats, rankings, history);
      }
    } else {
      // mode === 'both': run concurrently
      const [ruleRes, aiRes] = await Promise.all([
        deps?.runRuleEngine
          ? deps.runRuleEngine(site_id, stats, rankings, history)
          : Promise.resolve(null),
        deps?.runAIEngine
          ? deps.runAIEngine(site_id, stats, rankings, history)
          : Promise.resolve(null),
      ]);
      ruleResult = ruleRes;
      aiResult = aiRes;
    }

    // Merge and deduplicate
    const all: Suggestion[] = [
      ...(ruleResult?.suggestions ?? []),
      ...(aiResult?.suggestions ?? []),
    ];

    const combined = deduplicateByFixType(all);
    combined.sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    );

    return { rule_suggestions: ruleResult, ai_suggestions: aiResult, combined, mode };
  } catch {
    return { rule_suggestions: null, ai_suggestions: null, combined: [], mode };
  }
}
