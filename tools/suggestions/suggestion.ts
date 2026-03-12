/**
 * tools/suggestions/suggestion.ts
 *
 * Suggestion data model for the VAEO Suggestion Engine.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low';

export type SuggestionSource = 'rule_engine' | 'ai_engine' | 'gsc_signal' | 'manual';

export interface Suggestion {
  suggestion_id:    string;
  site_id:          string;
  title:            string;
  description:      string;
  rationale:        string;
  fix_type:         string;
  priority:         SuggestionPriority;
  estimated_impact: string;
  effort:           'low' | 'medium' | 'high';
  affected_pages:   string[];
  affected_count:   number;
  can_auto_fix:     boolean;
  source:           SuggestionSource;
  confidence:       number;
  tags:             string[];
  created_at:       string;
  expires_at?:      string;
}

export interface SuggestionSet {
  set_id:             string;
  site_id:            string;
  suggestions:        Suggestion[];
  critical_count:     number;
  high_count:         number;
  total_count:        number;
  auto_fixable_count: number;
  generated_by:       SuggestionSource;
  generated_at:       string;
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildSuggestion(
  site_id: string,
  fields: Omit<Suggestion, 'suggestion_id' | 'site_id' | 'created_at'>,
): Suggestion {
  try {
    return {
      suggestion_id: randomUUID(),
      site_id,
      created_at: new Date().toISOString(),
      ...fields,
    };
  } catch {
    return {
      suggestion_id: randomUUID(),
      site_id: site_id ?? '',
      title: '',
      description: '',
      rationale: '',
      fix_type: '',
      priority: 'low',
      estimated_impact: '',
      effort: 'low',
      affected_pages: [],
      affected_count: 0,
      can_auto_fix: false,
      source: 'rule_engine',
      confidence: 0,
      tags: [],
      created_at: new Date().toISOString(),
    };
  }
}

export function buildSuggestionSet(
  site_id: string,
  suggestions: Suggestion[],
  source: SuggestionSource,
): SuggestionSet {
  try {
    const safe = suggestions ?? [];
    return {
      set_id:             randomUUID(),
      site_id,
      suggestions:        safe,
      critical_count:     safe.filter((s) => s.priority === 'critical').length,
      high_count:         safe.filter((s) => s.priority === 'high').length,
      total_count:        safe.length,
      auto_fixable_count: safe.filter((s) => s.can_auto_fix).length,
      generated_by:       source,
      generated_at:       new Date().toISOString(),
    };
  } catch {
    return {
      set_id:             randomUUID(),
      site_id:            site_id ?? '',
      suggestions:        [],
      critical_count:     0,
      high_count:         0,
      total_count:        0,
      auto_fixable_count: 0,
      generated_by:       source ?? 'rule_engine',
      generated_at:       new Date().toISOString(),
    };
  }
}
