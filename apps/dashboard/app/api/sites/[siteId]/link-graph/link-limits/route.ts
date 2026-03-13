import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/sites/{siteId}/link-graph/link-limits
 * Returns link limit violation scan results. Requires auth.
 * Cache-Control: max-age=3600
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'missing_site_id' }, { status: 400 });
    }

    // Simulated link limit data for POV
    const result = {
      violations: [
        {
          url: `https://${siteId}/`,
          title: 'Home',
          total_links: 145,
          internal_links: 120,
          external_links: 25,
          navigation_links: 65,
          footer_links: 35,
          body_content_links: 20,
          over_limit_by: 45,
          severity: 'high',
          recommendations: [
            'Review navigation structure — 65 nav links may indicate mega menu issue',
            'Simplify footer links — 35 footer links dilutes equity',
            'Add nofollow to external links to reduce equity leakage',
          ],
        },
      ],
      critical_count: 0,
      high_count: 1,
      medium_count: 0,
      worst_page: `https://${siteId}/`,
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
