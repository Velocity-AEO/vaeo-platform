import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/link-graph/integrity?site_id=xxx
 * Returns graph data integrity check results. Admin only.
 * Cache-Control: max-age=600
 */
export async function GET(
  req: NextRequest,
) {
  try {
    // TODO: check admin session — return 403 if not admin

    const siteId = req.nextUrl.searchParams.get('site_id');
    if (!siteId) {
      return NextResponse.json({ error: 'missing_site_id' }, { status: 400 });
    }

    // Simulated integrity check for POV
    const result = {
      site_id: siteId,
      checked_at: new Date().toISOString(),
      is_healthy: false,
      total_issues: 3,
      critical_count: 0,
      warning_count: 2,
      info_count: 1,
      issues: [
        {
          type: 'dangling_link',
          severity: 'warning',
          description: '4 link(s) point to URLs not found in page nodes',
          affected_urls: [
            `https://${siteId}/removed-page`,
            `https://${siteId}/old-product`,
            `https://${siteId}/draft-post`,
            `https://${siteId}/temp-landing`,
          ],
          count: 4,
        },
        {
          type: 'orphaned_node',
          severity: 'warning',
          description: '2 page(s) have no inbound or outbound links',
          affected_urls: [
            `https://${siteId}/hidden-page`,
            `https://${siteId}/unlinked-collection`,
          ],
          count: 2,
        },
        {
          type: 'duplicate_edge',
          severity: 'info',
          description: '3 duplicate edge(s) found',
          affected_urls: [],
          count: 3,
        },
      ],
      pages_checked: 142,
      links_checked: 1834,
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=600' },
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
