import { NextRequest, NextResponse } from 'next/server';

// ── Simulated data ──────────────────────────────────────────────────────────

function simulateStats(siteId: string) {
  return {
    domain: `${siteId}.myshopify.com`,
    health_score: 68,
    health_score_delta: 4,
    schema_coverage_pct: 42,
    issues_pending: 12,
    fixes_this_week: 0,
    fixes_this_month: 7,
    fixes_applied: 35,
    issues_resolved: 23,
  };
}

function simulateRankings() {
  return {
    site_id: 'sim',
    snapshot_id: 'snap-sim',
    entries: [],
    total_keywords: 45,
    avg_position: 22.4,
    keywords_in_top_3: 2,
    keywords_in_top_10: 8,
    keywords_improved: 6,
    keywords_dropped: 5,
    keywords_new: 3,
    snapshot_date: new Date().toISOString(),
  };
}

function simulateHistory() {
  return {
    site_id: 'sim',
    entries: [
      { fix_type: 'schema_missing', applied_at: new Date().toISOString(), page_url: '/products/widget', success: true },
      { fix_type: 'title_missing', applied_at: new Date().toISOString(), page_url: '/collections/all', success: true },
      { fix_type: 'image_alt_missing', applied_at: new Date().toISOString(), page_url: '/pages/about', success: true },
    ],
    total: 3,
    page: 1,
  };
}

// ── Inline rule engine (avoids import issues with Next.js bundler) ──────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface SimpleSuggestion {
  suggestion_id: string;
  site_id: string;
  title: string;
  description: string;
  rationale: string;
  fix_type: string;
  priority: string;
  estimated_impact: string;
  effort: string;
  affected_pages: string[];
  affected_count: number;
  can_auto_fix: boolean;
  source: string;
  confidence: number;
  tags: string[];
  created_at: string;
}

function makeSuggestion(site_id: string, fields: Omit<SimpleSuggestion, 'suggestion_id' | 'site_id' | 'created_at'>): SimpleSuggestion {
  return {
    suggestion_id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    site_id,
    created_at: new Date().toISOString(),
    ...fields,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runSimulatedRules(site_id: string, stats: any, rankings: any, _history: any): SimpleSuggestion[] {
  const suggestions: SimpleSuggestion[] = [];

  if (stats.schema_coverage_pct < 50) {
    suggestions.push(makeSuggestion(site_id, {
      title: 'Expand Schema Coverage',
      description: `Only ${stats.schema_coverage_pct}% of pages have schema markup. Schema is required for rich results.`,
      rationale: 'Schema markup is the primary signal for rich result eligibility.',
      fix_type: 'schema_missing', priority: 'critical', estimated_impact: '+20% rich result impressions',
      effort: 'low', affected_pages: [], affected_count: 5, can_auto_fix: true,
      source: 'rule_engine', confidence: 0.95, tags: ['schema', 'rich-results'],
    }));
  }

  if (stats.health_score < 60) {
    suggestions.push(makeSuggestion(site_id, {
      title: 'Critical SEO Issues Detected',
      description: `Health score is ${stats.health_score}/100. Multiple SEO issues need attention.`,
      rationale: 'A low health score suppresses organic visibility.',
      fix_type: 'health_score', priority: 'critical', estimated_impact: 'Foundation for all improvements',
      effort: 'medium', affected_pages: [], affected_count: stats.issues_pending, can_auto_fix: false,
      source: 'rule_engine', confidence: 0.9, tags: ['health', 'critical'],
    }));
  }

  if (rankings.keywords_dropped > 3) {
    suggestions.push(makeSuggestion(site_id, {
      title: 'Keyword Rankings Dropped',
      description: `${rankings.keywords_dropped} keywords dropped in position this period.`,
      rationale: 'Ranking drops indicate competitive pressure.',
      fix_type: 'schema_missing', priority: 'high', estimated_impact: 'Recover lost rankings',
      effort: 'medium', affected_pages: [], affected_count: rankings.keywords_dropped, can_auto_fix: true,
      source: 'rule_engine', confidence: 0.8, tags: ['rankings', 'recovery'],
    }));
  }

  if (rankings.avg_position > 20) {
    suggestions.push(makeSuggestion(site_id, {
      title: 'Keywords Outside Top 20',
      description: `Average ranking is ${rankings.avg_position}. Pages ranking 11-20 are prime candidates.`,
      rationale: 'Keywords in positions 11-20 are on the cusp of page 1.',
      fix_type: 'title_missing', priority: 'high', estimated_impact: '+15% organic traffic',
      effort: 'low', affected_pages: [], affected_count: rankings.total_keywords, can_auto_fix: true,
      source: 'rule_engine', confidence: 0.82, tags: ['rankings', 'opportunity'],
    }));
  }

  if (stats.fixes_this_week === 0) {
    suggestions.push(makeSuggestion(site_id, {
      title: 'No Fixes Applied This Week',
      description: "VAEO hasn't run this week. Schedule a run to keep improvements flowing.",
      rationale: 'Consistent maintenance prevents ranking decay.',
      fix_type: 'schedule', priority: 'medium', estimated_impact: 'Prevents ranking decay',
      effort: 'low', affected_pages: [], affected_count: 0, can_auto_fix: false,
      source: 'rule_engine', confidence: 0.9, tags: ['schedule', 'maintenance'],
    }));
  }

  suggestions.push(makeSuggestion(site_id, {
    title: 'Image Alt Text Audit',
    description: 'Image alt text improves accessibility and image search rankings.',
    rationale: 'Alt text helps Google understand image content.',
    fix_type: 'image_alt_missing', priority: 'low', estimated_impact: '+3% image search traffic',
    effort: 'low', affected_pages: [], affected_count: 0, can_auto_fix: true,
    source: 'rule_engine', confidence: 0.7, tags: ['images', 'accessibility'],
  }));

  suggestions.push(makeSuggestion(site_id, {
    title: 'Canonical URL Audit',
    description: 'Ensure all pages have proper canonical URLs.',
    rationale: 'Missing canonical tags cause crawl budget waste.',
    fix_type: 'canonical_missing', priority: 'low', estimated_impact: 'Prevents duplicate content',
    effort: 'low', affected_pages: [], affected_count: 0, can_auto_fix: true,
    source: 'rule_engine', confidence: 0.7, tags: ['canonical', 'technical'],
  }));

  suggestions.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  return suggestions;
}

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const mode = req.nextUrl.searchParams.get('mode') ?? 'rule';

    const stats = simulateStats(siteId);
    const rankings = simulateRankings();
    const history = simulateHistory();

    const ruleSuggestions = (mode === 'rule' || mode === 'both')
      ? runSimulatedRules(siteId, stats, rankings, history)
      : null;

    const aiSuggestions = (mode === 'ai' || mode === 'both')
      ? [
          makeSuggestion(siteId, {
            title: 'Add FAQ Schema to Product Pages',
            description: 'Adding FAQ schema to your top product pages can unlock rich results in search.',
            rationale: 'FAQ schema increases CTR by 20-30% in competitive niches.',
            fix_type: 'schema_missing', priority: 'high', estimated_impact: '+18% CTR',
            effort: 'low', affected_pages: ['/products/widget-pro', '/products/widget-basic'],
            affected_count: 2, can_auto_fix: true,
            source: 'ai_engine', confidence: 0.92, tags: ['schema', 'faq', 'ai-powered'],
          }),
          makeSuggestion(siteId, {
            title: 'Optimize Collection Page Titles',
            description: 'Collection page titles are generic. Adding keyword-rich titles will improve rankings.',
            rationale: 'Title optimization is the highest-ROI on-page change.',
            fix_type: 'title_missing', priority: 'high', estimated_impact: '+12% organic traffic',
            effort: 'medium', affected_pages: ['/collections/all', '/collections/sale'],
            affected_count: 4, can_auto_fix: true,
            source: 'ai_engine', confidence: 0.88, tags: ['title', 'collections', 'ai-powered'],
          }),
          makeSuggestion(siteId, {
            title: 'Implement HowTo Schema for Blog Posts',
            description: 'Your blog posts contain step-by-step content that qualifies for HowTo schema.',
            rationale: 'HowTo rich results stand out in SERPs and drive high-intent traffic.',
            fix_type: 'schema_missing', priority: 'medium', estimated_impact: '+8% blog traffic',
            effort: 'medium', affected_pages: ['/blogs/tips/how-to-choose'],
            affected_count: 3, can_auto_fix: true,
            source: 'ai_engine', confidence: 0.85, tags: ['schema', 'howto', 'blog', 'ai-powered'],
          }),
        ]
      : null;

    // Combine and deduplicate for 'both' mode
    let combined = [...(ruleSuggestions ?? []), ...(aiSuggestions ?? [])];
    if (mode === 'both') {
      const byFixType = new Map<string, SimpleSuggestion>();
      for (const s of combined) {
        const existing = byFixType.get(s.fix_type);
        if (!existing || (PRIORITY_ORDER[s.priority] ?? 9) < (PRIORITY_ORDER[existing.priority] ?? 9)) {
          byFixType.set(s.fix_type, s);
        }
      }
      combined = [...byFixType.values()];
      combined.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
    }

    const criticalCount = combined.filter((s) => s.priority === 'critical').length;
    const highCount = combined.filter((s) => s.priority === 'high').length;
    const autoFixableCount = combined.filter((s) => s.can_auto_fix).length;

    return NextResponse.json({
      rule_suggestions: ruleSuggestions ? {
        suggestions: ruleSuggestions,
        total_count: ruleSuggestions.length,
        critical_count: ruleSuggestions.filter((s) => s.priority === 'critical').length,
        generated_by: 'rule_engine',
      } : null,
      ai_suggestions: aiSuggestions ? {
        suggestions: aiSuggestions,
        total_count: aiSuggestions.length,
        critical_count: aiSuggestions.filter((s) => s.priority === 'critical').length,
        generated_by: 'ai_engine',
      } : null,
      combined,
      mode,
      summary: {
        critical_count: criticalCount,
        high_count: highCount,
        total_count: combined.length,
        auto_fixable_count: autoFixableCount,
      },
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate suggestions' },
      { status: 500 },
    );
  }
}
