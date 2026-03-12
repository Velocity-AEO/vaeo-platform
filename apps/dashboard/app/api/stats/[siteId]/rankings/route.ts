import { NextRequest, NextResponse } from 'next/server';
import { simulateRankings, simulateRankingHistory } from '@/../tools/rankings/ranking_simulator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId }  = await params;
    const domain      = `${siteId}.myshopify.com`;
    const daysParam   = req.nextUrl.searchParams.get('days');
    const days        = daysParam ? parseInt(daysParam, 10) : undefined;

    if (days !== undefined && !isNaN(days)) {
      const history = simulateRankingHistory(siteId, domain, days);
      return NextResponse.json(history, { headers: { 'Cache-Control': 'no-store' } });
    }

    const snapshot = simulateRankings(siteId, domain);
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
