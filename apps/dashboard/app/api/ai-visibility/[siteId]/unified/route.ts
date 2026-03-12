import { NextResponse } from 'next/server';
import { generateUnifiedReport } from '../../../../../../../../tools/ai-visibility/unified_signal.js';
import {
  simulateVisibilityHistory,
  computeVisibilityTrend,
} from '../../../../../../../../tools/ai-visibility/visibility_history.js';
import { analyzeCompetitorGap, getTopOpportunities } from '../../../../../../../../tools/ai-visibility/competitor_gap.js';
import { simulateSchemaOpportunities } from '../../../../../../../../tools/ai-visibility/schema_opportunity.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveBrandName(domain: string): string {
  const base = (domain ?? '').replace(/\.(com|net|org|io|co|shop|store).*$/, '');
  return base.split(/[-_.]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const DEFAULT_COMPETITORS = ['allbirds.com', 'everlane.com', 'patagonia.com'];
const DEFAULT_QUERIES = [
  'best organic cotton t-shirts',
  'sustainable fashion brands',
  'eco friendly clothing online',
  'ethical fashion 2025',
  'bamboo fabric dress',
];

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const domain = `${siteId}.myshopify.com`;
    const brand = deriveBrandName(siteId);

    // 1. Unified signal (perplexity + google AIO)
    const unified = await generateUnifiedReport(siteId, domain, brand);

    // 2. Visibility history (30 days)
    const history = simulateVisibilityHistory(siteId, domain, 30);
    const trend = computeVisibilityTrend(history);

    // 3. Competitor gap analysis
    const gaps = analyzeCompetitorGap(siteId, domain, DEFAULT_COMPETITORS, DEFAULT_QUERIES);
    const topOpportunities = getTopOpportunities(gaps, 10);

    // 4. Schema opportunities
    const schemaOpps = simulateSchemaOpportunities(siteId, domain);

    return NextResponse.json({
      site_id: siteId,
      domain,
      signal: unified.signal,
      summary: unified.summary,
      perplexity_citations: unified.perplexity_citations,
      google_citations: unified.google_citations,
      all_citations: unified.all_citations,
      history: history.map(h => ({
        date: h.date,
        score: h.combined_score,
        perplexity_rate: h.perplexity_rate,
        google_aio_rate: h.google_aio_rate,
      })),
      trend,
      competitor_gaps: topOpportunities,
      schema_opportunities: schemaOpps,
      generated_at: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate unified AI visibility report' },
      { status: 500 },
    );
  }
}
