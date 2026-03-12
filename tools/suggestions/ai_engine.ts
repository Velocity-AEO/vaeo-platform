/**
 * tools/suggestions/ai_engine.ts
 *
 * AI-powered suggestion engine. Sends site context to Claude
 * and gets back prioritized, intelligent suggestions with explanations.
 * Never throws at outer level.
 */

import type { RankingSnapshot } from '../rankings/ranking_entry.js';
import type { SuggestionSiteStats, FixHistoryPage } from './rule_engine.js';
import {
  buildSuggestion,
  buildSuggestionSet,
  type Suggestion,
  type SuggestionSet,
  type SuggestionPriority,
} from './suggestion.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIEngineConfig {
  model:         string;
  max_tokens:    number;
  temperature:   number;
  system_prompt: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are VAEO, an automated SEO platform.
Given a site's current SEO stats, keyword rankings,
and recent fix history, generate 5-8 prioritized
SEO suggestions for the site owner.

For each suggestion, return a JSON array of objects:
[
  {
    "title": "short action title",
    "description": "1-2 sentence explanation",
    "rationale": "why this matters for rankings/revenue",
    "fix_type": "one of: title_missing, meta_description_missing, schema_missing, image_alt_missing, canonical_missing, lang_missing, content, technical, schema_missing",
    "priority": "critical|high|medium|low",
    "estimated_impact": "e.g. +15% organic traffic",
    "effort": "low|medium|high",
    "can_auto_fix": true or false,
    "confidence": 0.0-1.0,
    "tags": ["array", "of", "tags"]
  }
]

Return ONLY the JSON array. No preamble or explanation.`;

export function defaultAIConfig(): AIEngineConfig {
  try {
    return {
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      temperature: 0,
      system_prompt: SYSTEM_PROMPT,
    };
  } catch {
    return {
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      temperature: 0,
      system_prompt: SYSTEM_PROMPT,
    };
  }
}

// ── Site context prompt builder ───────────────────────────────────────────────

export function buildSiteContextPrompt(
  stats: SuggestionSiteStats,
  rankings: RankingSnapshot,
  history: FixHistoryPage,
): string {
  try {
    const fixTypes = [...new Set(history.entries.map((e) => e.fix_type))];
    return [
      `Site: ${stats.domain}`,
      `Health Score: ${stats.health_score}/100 (delta: ${stats.health_score_delta > 0 ? '+' : ''}${stats.health_score_delta} this month)`,
      `Keywords Tracked: ${rankings.total_keywords}, Avg Position: ${rankings.avg_position}`,
      `Keywords in Top 10: ${rankings.keywords_in_top_10}, Improved This Period: ${rankings.keywords_improved}`,
      `Fixes Applied This Month: ${stats.fixes_this_month} total, ${stats.fixes_this_week} this week`,
      `Issues Pending: ${stats.issues_pending}`,
      `Schema Coverage: ${stats.schema_coverage_pct}%`,
      `Recent Fix Types: [${fixTypes.join(', ')}]`,
    ].join('\n');
  } catch {
    return 'Site context unavailable.';
  }
}

// ── AI Engine ─────────────────────────────────────────────────────────────────

interface RawAISuggestion {
  title?:            string;
  description?:      string;
  rationale?:        string;
  fix_type?:         string;
  priority?:         string;
  estimated_impact?: string;
  effort?:           string;
  can_auto_fix?:     boolean;
  confidence?:       number;
  tags?:             string[];
}

function isValidPriority(p: string): p is SuggestionPriority {
  return ['critical', 'high', 'medium', 'low'].includes(p);
}

function isValidEffort(e: string): e is 'low' | 'medium' | 'high' {
  return ['low', 'medium', 'high'].includes(e);
}

export async function runAIEngine(
  site_id: string,
  stats: SuggestionSiteStats,
  rankings: RankingSnapshot,
  history: FixHistoryPage,
  config?: Partial<AIEngineConfig>,
  deps?: {
    callClaude?: (
      prompt: string,
      system: string,
      config: AIEngineConfig,
    ) => Promise<string>;
  },
): Promise<SuggestionSet> {
  try {
    const fullConfig: AIEngineConfig = { ...defaultAIConfig(), ...config };
    const prompt = buildSiteContextPrompt(stats, rankings, history);

    let responseText: string;

    if (deps?.callClaude) {
      responseText = await deps.callClaude(prompt, fullConfig.system_prompt, fullConfig);
    } else {
      // Real Anthropic API call
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error('[ai_engine] ANTHROPIC_API_KEY not set');
        return buildSuggestionSet(site_id, [], 'ai_engine');
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: fullConfig.model,
          max_tokens: fullConfig.max_tokens,
          system: fullConfig.system_prompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        console.error(`[ai_engine] API error: ${res.status}`);
        return buildSuggestionSet(site_id, [], 'ai_engine');
      }

      const body = await res.json();
      responseText = body?.content?.[0]?.text ?? '';
    }

    // Parse JSON response
    let rawSuggestions: RawAISuggestion[];
    try {
      rawSuggestions = JSON.parse(responseText);
      if (!Array.isArray(rawSuggestions)) {
        return buildSuggestionSet(site_id, [], 'ai_engine');
      }
    } catch {
      console.error('[ai_engine] Failed to parse AI response as JSON');
      return buildSuggestionSet(site_id, [], 'ai_engine');
    }

    // Build Suggestion objects
    const suggestions: Suggestion[] = rawSuggestions
      .filter((r) => r.title && r.fix_type)
      .map((r) =>
        buildSuggestion(site_id, {
          title:            r.title ?? '',
          description:      r.description ?? '',
          rationale:        r.rationale ?? '',
          fix_type:         r.fix_type ?? '',
          priority:         isValidPriority(r.priority ?? '') ? r.priority as SuggestionPriority : 'medium',
          estimated_impact: r.estimated_impact ?? '',
          effort:           isValidEffort(r.effort ?? '') ? r.effort as 'low' | 'medium' | 'high' : 'medium',
          affected_pages:   [],
          affected_count:   0,
          can_auto_fix:     r.can_auto_fix ?? false,
          source:           'ai_engine',
          confidence:       typeof r.confidence === 'number' ? r.confidence : 0.7,
          tags:             Array.isArray(r.tags) ? r.tags : [],
        }),
      );

    return buildSuggestionSet(site_id, suggestions, 'ai_engine');
  } catch (err) {
    console.error('[ai_engine] Unexpected error:', err);
    return buildSuggestionSet(site_id, [], 'ai_engine');
  }
}
