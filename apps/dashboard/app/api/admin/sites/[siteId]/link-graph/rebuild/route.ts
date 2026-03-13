import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/sites/{siteId}/link-graph/rebuild
 * Triggers immediate graph rebuild for a site. Admin only.
 * Large sites (> 500 pages) return 202 with queued status.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    // TODO: check admin session — return 403 if not admin

    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'missing_site_id' }, { status: 400 });
    }

    const start = Date.now();

    // Simulated page count check for POV
    const pageCount = 142; // In production: query actual page count

    if (pageCount > 500) {
      return NextResponse.json(
        {
          queued: true,
          message: 'Large site — graph rebuild queued for next nightly run',
        },
        { status: 202 },
      );
    }

    // In production: call buildLinkGraph, runDepthAnalysis, scoreAllPages, captureVelocitySnapshot
    const duration_ms = Date.now() - start;

    return NextResponse.json({
      success: true,
      pages_mapped: pageCount,
      duration_ms,
      error: null,
    });
  } catch {
    return NextResponse.json(
      { success: false, pages_mapped: 0, duration_ms: 0, error: 'internal_error' },
      { status: 500 },
    );
  }
}
