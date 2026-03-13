import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/link-graph/health
 * Returns platform-wide link health aggregation. Admin only.
 * Cache-Control: max-age=900 (15 min)
 */
export async function GET(
  _req: NextRequest,
) {
  try {
    // TODO: check admin session — return 403 if not admin

    // Simulated platform health for POV
    const result = {
      generated_at: new Date().toISOString(),
      total_sites: 3,
      sites_with_graph: 2,
      sites_without_graph: 1,
      total_pages_mapped: 231,
      total_orphaned_pages: 11,
      total_dead_ends: 17,
      total_deep_pages: 4,
      total_broken_external: 8,
      total_canonical_conflicts: 11,
      total_link_opportunities: 14,
      total_velocity_alerts: 2,
      avg_orphaned_per_site: 5.5,
      avg_authority_score: 0.42,
      sites_needing_attention: [
        {
          site_id: 'site_2',
          domain: 'demo-store.myshopify.com',
          orphaned_count: 8,
          broken_external_count: 6,
          velocity_alerts: 2,
          last_graph_built: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
          attention_reasons: [
            '6 broken external links',
            '2 link velocity alerts',
            'Link graph not rebuilt in 25+ hours',
          ],
        },
      ],
      graph_build_status: [
        {
          site_id: 'site_3',
          domain: 'new-site.com',
          last_built: null,
          pages_mapped: 0,
          build_age_hours: null,
          is_stale: true,
        },
        {
          site_id: 'site_2',
          domain: 'demo-store.myshopify.com',
          last_built: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
          pages_mapped: 89,
          build_age_hours: 30,
          is_stale: true,
        },
        {
          site_id: 'site_1',
          domain: 'cococabanalife.com',
          last_built: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          pages_mapped: 142,
          build_age_hours: 3,
          is_stale: false,
        },
      ],
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=900' },
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
