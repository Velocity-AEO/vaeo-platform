import { NextRequest, NextResponse } from 'next/server';
import { buildSiteStats } from '@/../tools/stats/site_stats';
import { simulateRankings } from '@/../tools/rankings/ranking_simulator';
import { simulateFixHistory } from '@/../tools/stats/fix_history';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const domain = `${siteId}.myshopify.com`;

    const stats       = buildSiteStats(siteId, domain);
    const rankings    = simulateRankings(siteId, domain);
    const fix_history = simulateFixHistory(siteId, domain, 30);

    return NextResponse.json(
      { stats, rankings, fix_history },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
