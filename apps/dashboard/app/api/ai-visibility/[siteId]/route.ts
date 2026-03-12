import { NextResponse } from 'next/server';
import { computeAIVisibilityScore, computeScoreHistory, type AICitationSummary } from '../../../../../../../tools/ai-visibility/visibility_score.js';
import { analyzeCompetitorGap, getTopOpportunities } from '../../../../../../../tools/ai-visibility/competitor_gap.js';
import { simulateSchemaOpportunities } from '../../../../../../../tools/ai-visibility/schema_opportunity.js';

// ── Mock queries ─────────────────────────────────────────────────────────────

const QUERIES = [
  'best organic cotton t-shirts',
  'sustainable fashion brands',
  'eco friendly clothing online',
  'hemp t-shirt review',
  'recycled polyester jacket',
  'ethical fashion 2025',
  'bamboo fabric dress',
  'vegan leather bag brands',
  'organic cotton vs conventional',
  'sustainable wardrobe essentials',
  'best eco friendly gifts',
  'fair trade clothing stores',
  'zero waste fashion',
  'biodegradable clothing materials',
  'capsule wardrobe sustainable',
];

const COMPETITORS = ['allbirds.com', 'everlane.com', 'patagonia.com'];

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const domain = `${siteId}.myshopify.com`;

  // Current score
  const summary: AICitationSummary = {
    site_id: siteId,
    domain,
    total_queries: QUERIES.length,
    total_citations: 6,
    citation_rate: 0.4,
  };

  const currentScore = computeAIVisibilityScore(summary, {
    branded_rate: 0.7,
    product_rate: 0.35,
    informational_rate: 0.2,
  });

  // Score history
  const history = computeScoreHistory(siteId, domain, 30);

  // Competitor gaps
  const gaps = analyzeCompetitorGap(siteId, domain, COMPETITORS, QUERIES);
  const topOpportunities = getTopOpportunities(gaps, 10);

  // Cited queries (where your_cited is true)
  const citedQueries = gaps
    .filter((g) => g.your_cited)
    .map((g) => ({
      query: g.query,
      source: 'Perplexity',
      position: 1 + (g.gap_id.charCodeAt(0) % 3),
      confidence: 0.7 + (g.gap_id.charCodeAt(1) % 30) / 100,
    }));
  const uniqueCited = citedQueries.filter((q, i, arr) =>
    arr.findIndex((a) => a.query === q.query) === i,
  );

  // Missed opportunities (competitor cited, you not)
  const missed = gaps.filter((g) => g.gap_type === 'competitor_wins');

  // Schema opportunities
  const schemaOpportunities = simulateSchemaOpportunities(siteId, domain);

  // Recommendations
  const recommendations = [
    missed.length > 0 ? `Add FAQ schema to ${missed.length} pages where competitors are cited but you are not` : null,
    schemaOpportunities.filter((o) => o.priority === 'critical').length > 0 ? `Fix ${schemaOpportunities.filter((o) => o.priority === 'critical').length} critical schema gaps to improve AI citation rate` : null,
    'Add Speakable markup to your top blog posts for voice assistant visibility',
    'Create FAQ sections on product pages — AI tools cite structured Q&A 3x more often',
    'Add HowTo schema to how-to content for step-by-step AI citations',
  ].filter(Boolean);

  return NextResponse.json({
    score: currentScore,
    history: history.map((h) => ({ date: h.computed_at, score: h.score })),
    citedQueries: uniqueCited,
    missedOpportunities: missed.slice(0, 10),
    schemaOpportunities,
    recommendations,
    breakdown: {
      branded: { rate: 0.7, checked: 10, cited: 7 },
      product: { rate: 0.35, checked: 20, cited: 7 },
      informational: { rate: 0.2, checked: 15, cited: 3 },
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
