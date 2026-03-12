/**
 * tools/suggestions/rule_engine.ts
 *
 * Rule-based suggestion engine. Evaluates site stats, rankings,
 * and fix history against a library of rules. Never throws.
 */

import type { RankingSnapshot } from '../rankings/ranking_entry.js';
import {
  buildSuggestion,
  buildSuggestionSet,
  type Suggestion,
  type SuggestionSet,
} from './suggestion.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SuggestionSiteStats {
  domain:              string;
  health_score:        number;
  health_score_delta:  number;
  schema_coverage_pct: number;
  issues_pending:      number;
  fixes_this_week:     number;
  fixes_this_month:    number;
  fixes_applied:       number;
  issues_resolved:     number;
}

export interface FixHistoryEntry {
  fix_type:   string;
  applied_at: string;
  page_url:   string;
  success:    boolean;
}

export interface FixHistoryPage {
  site_id: string;
  entries: FixHistoryEntry[];
  total:   number;
  page:    number;
}

export interface SuggestionRule {
  rule_id:     string;
  name:        string;
  description: string;
  evaluate: (
    stats:    SuggestionSiteStats,
    rankings: RankingSnapshot,
    history:  FixHistoryPage,
  ) => Suggestion | null;
}

// ── Priority ordering ─────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ── Rules ─────────────────────────────────────────────────────────────────────

export const SUGGESTION_RULES: SuggestionRule[] = [
  // 1. low_schema_coverage
  {
    rule_id: 'low_schema_coverage',
    name: 'Low Schema Coverage',
    description: 'Flags sites with less than 50% schema coverage',
    evaluate: (stats, _rankings, _history) => {
      if (stats.schema_coverage_pct >= 50) return null;
      return buildSuggestion(stats.domain, {
        title: 'Expand Schema Coverage',
        description: `Only ${stats.schema_coverage_pct}% of pages have schema markup. Schema is required for rich results.`,
        rationale: 'Schema markup is the primary signal for rich result eligibility. Low coverage means missed SERP real estate.',
        fix_type: 'schema_missing',
        priority: 'critical',
        estimated_impact: '+20% rich result impressions',
        effort: 'low',
        affected_pages: [],
        affected_count: Math.round((100 - stats.schema_coverage_pct) / 10),
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.95,
        tags: ['schema', 'rich-results', 'coverage'],
      });
    },
  },

  // 2. poor_health_score
  {
    rule_id: 'poor_health_score',
    name: 'Poor Health Score',
    description: 'Flags sites with health score below 60',
    evaluate: (stats) => {
      if (stats.health_score >= 60) return null;
      return buildSuggestion(stats.domain, {
        title: 'Critical SEO Issues Detected',
        description: `Health score is ${stats.health_score}/100. Multiple SEO issues need attention.`,
        rationale: 'A low health score indicates systemic SEO problems that suppress organic visibility.',
        fix_type: 'health_score',
        priority: 'critical',
        estimated_impact: 'Foundation for all SEO improvements',
        effort: 'medium',
        affected_pages: [],
        affected_count: stats.issues_pending,
        can_auto_fix: false,
        source: 'rule_engine',
        confidence: 0.9,
        tags: ['health', 'critical', 'audit'],
      });
    },
  },

  // 3. missing_titles
  {
    rule_id: 'missing_titles',
    name: 'Missing Titles',
    description: 'Flags when title fixes are needed and history shows recent title issues',
    evaluate: (stats, _rankings, history) => {
      if (stats.issues_pending <= 0) return null;
      const hasTitleFixes = history.entries.some((e) => e.fix_type === 'title_missing');
      if (!hasTitleFixes) return null;
      return buildSuggestion(stats.domain, {
        title: 'Title Tags Still Missing',
        description: 'Some pages still lack proper title tags despite recent fixes.',
        rationale: 'Title tags are the strongest on-page ranking signal. Missing titles mean zero SERP presence for those pages.',
        fix_type: 'title_missing',
        priority: 'high',
        estimated_impact: '+5-10% organic traffic',
        effort: 'low',
        affected_pages: [],
        affected_count: stats.issues_pending,
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.88,
        tags: ['title', 'on-page'],
      });
    },
  },

  // 4. avg_position_opportunity
  {
    rule_id: 'avg_position_opportunity',
    name: 'Average Position Opportunity',
    description: 'Flags when average position is outside top 20',
    evaluate: (stats, rankings) => {
      if (rankings.avg_position <= 20) return null;
      return buildSuggestion(stats.domain, {
        title: 'Keywords Outside Top 20',
        description: `Your average ranking is ${rankings.avg_position.toFixed(1)}. Pages ranking 11-20 are prime candidates for content and schema improvements.`,
        rationale: 'Keywords in positions 11-20 are on the cusp of page 1. Small improvements here yield the biggest traffic gains.',
        fix_type: 'schema_missing',
        priority: 'high',
        estimated_impact: '+15% organic traffic',
        effort: 'low',
        affected_pages: [],
        affected_count: rankings.total_keywords,
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.82,
        tags: ['rankings', 'opportunity', 'schema'],
      });
    },
  },

  // 5. top_10_expansion
  {
    rule_id: 'top_10_expansion',
    name: 'Top 10 Expansion',
    description: 'Flags when fewer than 30% of keywords are in top 10',
    evaluate: (stats, rankings) => {
      if (rankings.total_keywords === 0) return null;
      if (rankings.keywords_in_top_10 >= rankings.total_keywords * 0.3) return null;
      const pct = Math.round((rankings.keywords_in_top_10 / rankings.total_keywords) * 100);
      return buildSuggestion(stats.domain, {
        title: 'Fewer Than 30% of Keywords in Top 10',
        description: `Only ${pct}% of tracked keywords rank in the top 10. Title and schema improvements can push more keywords onto page 1.`,
        rationale: 'Page 1 rankings receive 90%+ of all clicks. Expanding top-10 coverage is the highest-ROI SEO work.',
        fix_type: 'title_missing',
        priority: 'high',
        estimated_impact: '+20% organic clicks',
        effort: 'medium',
        affected_pages: [],
        affected_count: rankings.total_keywords - rankings.keywords_in_top_10,
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.85,
        tags: ['rankings', 'top-10', 'expansion'],
      });
    },
  },

  // 6. meta_description_gap
  {
    rule_id: 'meta_description_gap',
    name: 'Meta Description Gap',
    description: 'Flags when meta descriptions are likely incomplete',
    evaluate: (stats) => {
      if (stats.schema_coverage_pct >= 70) return null;
      return buildSuggestion(stats.domain, {
        title: 'Meta Descriptions Incomplete',
        description: 'Many pages are missing optimized meta descriptions, reducing click-through rates from search results.',
        rationale: 'Meta descriptions directly influence CTR. Google may auto-generate poor descriptions when they are missing.',
        fix_type: 'meta_description_missing',
        priority: 'medium',
        estimated_impact: '+8% CTR improvement',
        effort: 'low',
        affected_pages: [],
        affected_count: Math.round((100 - stats.schema_coverage_pct) / 5),
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.75,
        tags: ['meta', 'ctr', 'on-page'],
      });
    },
  },

  // 7. no_recent_fixes
  {
    rule_id: 'no_recent_fixes',
    name: 'No Recent Fixes',
    description: 'Flags when no fixes have been applied this week',
    evaluate: (stats) => {
      if (stats.fixes_this_week > 0) return null;
      return buildSuggestion(stats.domain, {
        title: 'No Fixes Applied This Week',
        description: "VAEO hasn't run this week. Schedule a run to keep improvements flowing.",
        rationale: 'Consistent SEO maintenance prevents ranking decay and captures new opportunities.',
        fix_type: 'schedule',
        priority: 'medium',
        estimated_impact: 'Prevents ranking decay',
        effort: 'low',
        affected_pages: [],
        affected_count: 0,
        can_auto_fix: false,
        source: 'rule_engine',
        confidence: 0.9,
        tags: ['schedule', 'maintenance'],
      });
    },
  },

  // 8. image_alt_opportunity
  {
    rule_id: 'image_alt_opportunity',
    name: 'Image Alt Text Audit',
    description: 'Always suggests an image alt text audit',
    evaluate: (stats) => {
      return buildSuggestion(stats.domain, {
        title: 'Image Alt Text Audit',
        description: 'Image alt text improves accessibility and image search rankings.',
        rationale: 'Alt text is required for accessibility compliance and helps Google understand image content for image search.',
        fix_type: 'image_alt_missing',
        priority: 'low',
        estimated_impact: '+3% image search traffic',
        effort: 'low',
        affected_pages: [],
        affected_count: 0,
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.7,
        tags: ['images', 'accessibility', 'alt-text'],
      });
    },
  },

  // 9. canonical_audit
  {
    rule_id: 'canonical_audit',
    name: 'Canonical URL Audit',
    description: 'Always suggests a canonical URL audit',
    evaluate: (stats) => {
      return buildSuggestion(stats.domain, {
        title: 'Canonical URL Audit',
        description: 'Ensure all pages have proper canonical URLs to prevent duplicate content issues.',
        rationale: 'Missing or incorrect canonical tags cause crawl budget waste and can dilute page authority.',
        fix_type: 'canonical_missing',
        priority: 'low',
        estimated_impact: 'Prevents duplicate content penalties',
        effort: 'low',
        affected_pages: [],
        affected_count: 0,
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.7,
        tags: ['canonical', 'technical', 'duplicate-content'],
      });
    },
  },

  // 10. high_fix_velocity_praise
  {
    rule_id: 'high_fix_velocity_praise',
    name: 'High Fix Velocity Praise',
    description: 'Praises sites with 10+ fixes this month',
    evaluate: (stats) => {
      if (stats.fixes_this_month < 10) return null;
      return buildSuggestion(stats.domain, {
        title: 'Excellent Fix Velocity — Keep It Up',
        description: `You've applied ${stats.fixes_this_month} fixes this month. Consider running a full audit to find remaining opportunities.`,
        rationale: 'Consistent fix velocity compounds over time. A full audit can reveal the next wave of improvements.',
        fix_type: 'schedule',
        priority: 'low',
        estimated_impact: 'Sustain momentum',
        effort: 'low',
        affected_pages: [],
        affected_count: 0,
        can_auto_fix: false,
        source: 'rule_engine',
        confidence: 0.95,
        tags: ['velocity', 'positive', 'audit'],
      });
    },
  },

  // 11. keywords_dropped
  {
    rule_id: 'keywords_dropped',
    name: 'Keywords Dropped',
    description: 'Flags when more than 3 keywords dropped in position',
    evaluate: (stats, rankings) => {
      if (rankings.keywords_dropped <= 3) return null;
      return buildSuggestion(stats.domain, {
        title: 'Keyword Rankings Dropped',
        description: `${rankings.keywords_dropped} keywords dropped in position this period. Schema and title improvements can help recover.`,
        rationale: 'Ranking drops indicate competitive pressure or content staleness. Quick action can prevent further decline.',
        fix_type: 'schema_missing',
        priority: 'high',
        estimated_impact: 'Recover lost rankings',
        effort: 'medium',
        affected_pages: [],
        affected_count: rankings.keywords_dropped,
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.8,
        tags: ['rankings', 'recovery', 'schema'],
      });
    },
  },

  // 12. schema_rich_results
  {
    rule_id: 'schema_rich_results',
    name: 'Schema Rich Results Expansion',
    description: 'Suggests expanding schema types when coverage is 50-79%',
    evaluate: (stats) => {
      if (stats.schema_coverage_pct < 50 || stats.schema_coverage_pct >= 80) return null;
      return buildSuggestion(stats.domain, {
        title: 'Expand to Rich Result Schema Types',
        description: 'You have basic schema. Adding FAQ, HowTo, or Product schema unlocks rich results.',
        rationale: 'Rich results increase CTR by 20-30%. Expanding schema types maximizes SERP real estate.',
        fix_type: 'schema_missing',
        priority: 'medium',
        estimated_impact: '+15% CTR from rich results',
        effort: 'medium',
        affected_pages: [],
        affected_count: Math.round((80 - stats.schema_coverage_pct) / 5),
        can_auto_fix: true,
        source: 'rule_engine',
        confidence: 0.8,
        tags: ['schema', 'rich-results', 'faq', 'howto'],
      });
    },
  },
];

// ── Engine ────────────────────────────────────────────────────────────────────

export async function runRuleEngine(
  site_id: string,
  stats: SuggestionSiteStats,
  rankings: RankingSnapshot,
  history: FixHistoryPage,
  rules?: SuggestionRule[],
): Promise<SuggestionSet> {
  try {
    const rulesToRun = rules ?? SUGGESTION_RULES;
    const suggestions: Suggestion[] = [];

    for (const rule of rulesToRun) {
      try {
        const result = rule.evaluate(stats, rankings, history);
        if (result) {
          suggestions.push({ ...result, site_id });
        }
      } catch {
        // Individual rule failure is non-fatal
      }
    }

    // Sort by priority: critical first
    suggestions.sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    );

    return buildSuggestionSet(site_id, suggestions, 'rule_engine');
  } catch {
    return buildSuggestionSet(site_id, [], 'rule_engine');
  }
}
