/**
 * GET /api/sites/[siteId]/sandbox/health
 *
 * Returns sandbox health metrics for a site.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateSiteHealth } from '@tools/sandbox/sandbox_health_aggregator.js';

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { siteId } = await context.params;

    if (!siteId) {
      return NextResponse.json({ error: 'missing site_id' }, { status: 400 });
    }

    const period = parseInt(request.nextUrl.searchParams.get('period') ?? '7', 10);
    const safePeriod = isNaN(period) || period < 1 ? 7 : Math.min(period, 90);

    const metrics = await calculateSiteHealth(siteId, safePeriod);

    return NextResponse.json(metrics, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'failed to load sandbox health' }, { status: 500 });
  }
}
