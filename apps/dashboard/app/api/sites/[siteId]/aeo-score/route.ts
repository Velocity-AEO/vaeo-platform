import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/sites/[siteId]/aeo-score ────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    // Simulated AEO score summary
    const result = {
      average_score:      65,
      grade:              'C',
      max_score:          100,
      top_recommendation: 'Add speakable schema to mark content for voice search',
      signals: [
        { signal_name: 'speakable_schema',    present: false, weight: 25, label: 'Speakable Schema',          recommendation: 'Add speakable schema to mark content for voice search' },
        { signal_name: 'faq_schema',          present: true,  weight: 20, label: 'FAQ Schema',                recommendation: null },
        { signal_name: 'how_to_schema',       present: false, weight: 15, label: 'HowTo Schema',              recommendation: 'Add HowTo schema for step-by-step content' },
        { signal_name: 'article_schema',      present: true,  weight: 15, label: 'Article Schema',            recommendation: null },
        { signal_name: 'breadcrumb_schema',   present: true,  weight: 10, label: 'Breadcrumb Schema',         recommendation: null },
        { signal_name: 'meta_description',    present: true,  weight: 10, label: 'Meta Description',          recommendation: null },
        { signal_name: 'structured_headings', present: true,  weight: 5,  label: 'Structured Headings (H1-H3)', recommendation: null },
      ],
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
