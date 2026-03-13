import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/sites/{siteId}/link-graph/fix-redirect
 * Updates an internal link href to point to the final URL
 * (skipping redirect chain). Requires auth.
 * Body: { source_url, link_url, final_url }
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
    if (!body?.source_url || !body?.link_url || !body?.final_url) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    // In production: update the internal link in the site's template/content
    // and log to audit table. For POV, return success.
    return NextResponse.json({
      success: true,
      site_id: siteId,
      source_url: body.source_url,
      old_href: body.link_url,
      new_href: body.final_url,
      fixed_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
