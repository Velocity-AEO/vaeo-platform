/**
 * GET /api/sites/[siteId]/link-graph/velocity
 *
 * Returns link velocity summary and trends for a site.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteVelocitySummary } from '@tools/link_graph/link_velocity_tracker.js';

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

    const summary = await getSiteVelocitySummary(siteId);

    return NextResponse.json({ summary, trends: [...summary.top_losing, ...summary.top_gaining] }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'failed to load velocity data' }, { status: 500 });
  }
}
