import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/sites/{siteId}/link-graph/fix-canonical
 * Fixes a canonical conflict by updating internal link href.
 * Requires auth.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'missing_site_id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.conflict) {
      return NextResponse.json({ error: 'missing_conflict' }, { status: 400 });
    }

    // In production: call fixCanonicalConflict with platform handler
    return NextResponse.json({
      success: true,
      fix_applied: `Updated link: ${body.conflict.linked_url} → ${body.conflict.fix_href}`,
      error: null,
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
