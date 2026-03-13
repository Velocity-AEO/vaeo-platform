/**
 * GET /api/sites/[siteId]/rankings/trends?period=week|month
 *
 * Returns keyword movement trending data for the given site.
 */

import { NextRequest, NextResponse } from 'next/server';

// Inline types to avoid bundler import issues
interface KeywordTrend {
  keyword:            string;
  url:                string;
  current_position:   number;
  previous_position:  number | null;
  position_change:    number;
  direction:          'improved' | 'declined' | 'stable' | 'new';
  period:             'week' | 'month';
  current_clicks:     number;
  current_impressions: number;
  current_ctr:        number;
}

interface TrendSummary {
  site_id:            string;
  period:             'week' | 'month';
  total_keywords:     number;
  improved_count:     number;
  declined_count:     number;
  stable_count:       number;
  new_count:          number;
  avg_position_change: number;
  top_movers:         KeywordTrend[];
  top_losers:         KeywordTrend[];
  trends:             KeywordTrend[];
  calculated_at:      string;
}

// Stub simulator for demo
function buildStubTrend(keyword: string, pos: number, prevPos: number | null, period: 'week' | 'month'): KeywordTrend {
  const change = prevPos !== null ? prevPos - pos : 0;
  let direction: KeywordTrend['direction'] = 'stable';
  if (prevPos === null) direction = 'new';
  else if (change > 0) direction = 'improved';
  else if (change < 0) direction = 'declined';

  const impressions = Math.max(10, Math.round(800 / pos));
  const ctr = pos <= 3 ? 0.15 : pos <= 10 ? 0.04 : 0.01;
  return {
    keyword,
    url: `https://example.com/page-${Math.abs(keyword.charCodeAt(0) % 10) + 1}`,
    current_position: pos,
    previous_position: prevPos,
    position_change: change,
    direction,
    period,
    current_clicks: Math.round(impressions * ctr),
    current_impressions: impressions,
    current_ctr: ctr,
  };
}

function buildStubSummary(siteId: string, period: 'week' | 'month'): TrendSummary {
  const keywords = [
    { kw: 'beach decor', pos: 3, prev: 8 },
    { kw: 'coastal home accessories', pos: 5, prev: 5 },
    { kw: 'boho beach decor', pos: 7, prev: 12 },
    { kw: 'rattan furniture', pos: 2, prev: 4 },
    { kw: 'wicker baskets', pos: 14, prev: 9 },
    { kw: 'coastal living decor', pos: 6, prev: 6 },
    { kw: 'beach house furniture', pos: 11, prev: 18 },
    { kw: 'tropical home decor', pos: 1, prev: 3 },
    { kw: 'seashell decor', pos: 22, prev: null },
    { kw: 'driftwood decor', pos: 9, prev: 15 },
  ];

  // For monthly, amplify changes
  const mult = period === 'month' ? 1.5 : 1;

  const trends = keywords.map(k => {
    const prev = k.prev !== null ? Math.round(k.pos + (k.prev - k.pos) * mult) : null;
    return buildStubTrend(k.kw, k.pos, prev, period);
  });

  const improved = trends.filter(t => t.direction === 'improved');
  const declined = trends.filter(t => t.direction === 'declined');
  const stable   = trends.filter(t => t.direction === 'stable');
  const newKw    = trends.filter(t => t.direction === 'new');

  const totalChange = trends.reduce((s, t) => s + t.position_change, 0);

  return {
    site_id: siteId,
    period,
    total_keywords: trends.length,
    improved_count: improved.length,
    declined_count: declined.length,
    stable_count: stable.length,
    new_count: newKw.length,
    avg_position_change: Math.round((totalChange / trends.length) * 10) / 10,
    top_movers: [...improved].sort((a, b) => b.position_change - a.position_change).slice(0, 5),
    top_losers: [...declined].sort((a, b) => a.position_change - b.position_change).slice(0, 5),
    trends,
    calculated_at: new Date().toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') === 'month' ? 'month' : 'week';

    const summary = buildStubSummary(siteId, period as 'week' | 'month');

    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
