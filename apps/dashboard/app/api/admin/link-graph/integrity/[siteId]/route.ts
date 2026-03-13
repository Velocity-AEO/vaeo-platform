import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/link-graph/integrity/{siteId}
 * Returns graph data integrity check results. Admin only.
 * Cache-Control: no-store
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    // TODO: check admin session — return 403 if not admin

    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'missing_site_id' }, { status: 400 });
    }

    // Simulated integrity check for POV
    const result = {
      site_id: siteId,
      checked_at: new Date().toISOString(),
      is_valid: false,
      issues: [
        {
          type: 'orphaned_link_references',
          description: '4 link(s) reference URLs not in page nodes',
          affected_count: 4,
          severity: 'warning',
        },
        {
          type: 'disconnected_graph_components',
          description: 'Graph has 2 disconnected components (ideal: 1)',
          affected_count: 2,
          severity: 'info',
        },
      ],
      page_count: 142,
      internal_link_count: 1834,
      external_link_count: 87,
      orphaned_count: 3,
      duplicate_nodes: 0,
      missing_homepage: false,
      disconnected_components: 2,
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
