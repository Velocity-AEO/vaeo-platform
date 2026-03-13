import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/sites/{siteId}/link-graph/canonical-conflicts
 * Returns canonical conflict scan results. Requires auth.
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

    // Simulated canonical conflict data for POV
    const result = {
      conflicts: [
        {
          source_url: `https://${siteId}/blog/guide`,
          linked_url: `https://${siteId}/products?sort=price`,
          canonical_url: `https://${siteId}/products`,
          conflict_type: 'links_to_non_canonical',
          equity_impact: 'high',
          fix_action: 'update_link_to_canonical',
          fix_href: `https://${siteId}/products`,
          description: 'Internal link points to non-canonical filtered URL',
        },
        {
          source_url: `https://${siteId}/`,
          linked_url: `https://${siteId}/old-page`,
          canonical_url: `https://${siteId}/new-page`,
          conflict_type: 'self_canonical_mismatch',
          equity_impact: 'medium',
          fix_action: 'update_link_to_canonical',
          fix_href: `https://${siteId}/new-page`,
          description: 'Page declares different canonical on same domain',
        },
      ],
      total_conflicts: 2,
      high_impact_count: 1,
      fixable_count: 2,
      summary_by_type: {
        links_to_non_canonical: 1,
        canonical_chain: 0,
        self_canonical_mismatch: 1,
        missing_canonical_on_target: 0,
      },
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
