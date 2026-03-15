import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/link-graph/status
 * Returns platform-wide link graph health metrics. Admin only.
 * Cache-Control: max-age=300 (5 min)
 */
export async function GET(
  _req: NextRequest,
) {
  try {
    // TODO: check admin session — return 403 if not admin

    // Simulated platform-wide status
    const result = {
      sites: [
        {
          site_id: 'site_1',
          domain: 'cococabanalife.com',
          page_count: 142,
          internal_link_count: 1834,
          external_link_count: 87,
          orphaned_count: 3,
          dead_end_count: 5,
          redirect_chain_count: 2,
          canonical_conflict_count: 4,
          link_limit_violation_count: 1,
          equity_leak_count: 6,
          last_built_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          build_age_hours: 3,
          health_grade: 'B',
        },
        {
          site_id: 'site_2',
          domain: 'example-client.myshopify.com',
          page_count: 89,
          internal_link_count: 654,
          external_link_count: 42,
          orphaned_count: 8,
          dead_end_count: 12,
          redirect_chain_count: 5,
          canonical_conflict_count: 7,
          link_limit_violation_count: 2,
          equity_leak_count: 9,
          last_built_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
          build_age_hours: 30,
          health_grade: 'D',
        },
      ],
      total_sites: 2,
      sites_with_graph: 2,
      sites_needing_rebuild: 1,
      total_pages: 231,
      total_internal_links: 2488,
      total_orphaned: 11,
      total_canonical_conflicts: 11,
      total_link_limit_violations: 3,
      avg_health_grade: 'C',
      worst_sites: [{
        site_id: 'site_2',
        domain: 'example-client.myshopify.com',
        health_grade: 'D',
        orphaned_count: 8,
        canonical_conflict_count: 7,
        link_limit_violation_count: 2,
      }],
      stale_sites: [{
        site_id: 'site_2',
        domain: 'example-client.myshopify.com',
        build_age_hours: 30,
      }],
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
