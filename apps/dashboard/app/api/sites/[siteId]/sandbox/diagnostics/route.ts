/**
 * GET /api/sites/[siteId]/sandbox/diagnostics
 *
 * Returns response classification diagnostics for a site's sandbox runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadSiteDiagnostics } from '@tools/sandbox/sandbox_diagnostics.js';

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

    const report = await loadSiteDiagnostics(siteId, safePeriod);

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    });
  } catch {
    return NextResponse.json({ error: 'failed to load sandbox diagnostics' }, { status: 500 });
  }
}
