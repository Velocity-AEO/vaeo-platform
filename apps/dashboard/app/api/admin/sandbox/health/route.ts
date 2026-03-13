/**
 * GET /api/admin/sandbox/health
 *
 * Returns platform-wide sandbox health metrics. Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculatePlatformHealth } from '../../../../../../tools/sandbox/sandbox_health_aggregator.js';

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const period = parseInt(request.nextUrl.searchParams.get('period') ?? '7', 10);
    const safePeriod = isNaN(period) || period < 1 ? 7 : Math.min(period, 90);

    const health = await calculatePlatformHealth(safePeriod);

    return NextResponse.json(health, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    });
  } catch {
    return NextResponse.json({ error: 'failed to load platform sandbox health' }, { status: 500 });
  }
}
