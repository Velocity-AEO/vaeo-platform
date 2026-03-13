import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/sites/[siteId]/lighthouse/trends ────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    // Simulated site trend analysis result
    const result = {
      url_trends: [
        {
          url: 'https://example.com/',
          requires_attention: false,
          trends: [
            { url: 'https://example.com/', metric: 'performance', trend_type: 'stable', current_score: 87, change_7d: 1, projected_score_30d: null, alert_required: false, alert_reason: null },
            { url: 'https://example.com/', metric: 'seo', trend_type: 'stable', current_score: 92, change_7d: 0, projected_score_30d: null, alert_required: false, alert_reason: null },
          ],
        },
        {
          url: 'https://example.com/products/item-1',
          requires_attention: true,
          trends: [
            { url: 'https://example.com/products/item-1', metric: 'performance', trend_type: 'degrading_gradual', current_score: 72, change_7d: -3, projected_score_30d: 60, alert_required: true, alert_reason: 'Gradual degradation — projected to reach 60 in 30 days' },
            { url: 'https://example.com/products/item-1', metric: 'seo', trend_type: 'stable', current_score: 88, change_7d: 0, projected_score_30d: null, alert_required: false, alert_reason: null },
          ],
        },
      ],
      sites_requiring_attention: 1,
      total_alerts: 1,
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
