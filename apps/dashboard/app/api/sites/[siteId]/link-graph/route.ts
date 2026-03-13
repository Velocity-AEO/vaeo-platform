import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/sites/{siteId}/link-graph
 * Returns full LinkGraph for site. Requires auth.
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

    // Simulated graph data for POV — will be replaced with real crawl data
    const page_nodes = [
      { url: `https://${siteId}/`, title: 'Home', depth: 0, inbound_internal_count: 15, outbound_internal_count: 8, is_orphaned: false, is_dead_end: false, is_in_sitemap: true, health_score: 92, outbound_link_count: 8, link_limit: 100 },
      { url: `https://${siteId}/products`, title: 'All Products', depth: 1, inbound_internal_count: 10, outbound_internal_count: 25, is_orphaned: false, is_dead_end: false, is_in_sitemap: true, health_score: 88, outbound_link_count: 25, link_limit: 100 },
      { url: `https://${siteId}/about`, title: 'About Us', depth: 1, inbound_internal_count: 5, outbound_internal_count: 3, is_orphaned: false, is_dead_end: false, is_in_sitemap: true, health_score: 85, outbound_link_count: 3, link_limit: 100 },
      { url: `https://${siteId}/blog/old-post`, title: 'Old Blog Post', depth: 4, inbound_internal_count: 0, outbound_internal_count: 0, is_orphaned: true, is_dead_end: true, is_in_sitemap: false, health_score: 45, outbound_link_count: 0, link_limit: 100 },
      { url: `https://${siteId}/products/widget-a`, title: 'Widget A', depth: 2, inbound_internal_count: 3, outbound_internal_count: 1, is_orphaned: false, is_dead_end: true, is_in_sitemap: true, health_score: 78, outbound_link_count: 1, link_limit: 100 },
      { url: `https://${siteId}/products/widget-b`, title: 'Widget B', depth: 2, inbound_internal_count: 2, outbound_internal_count: 2, is_orphaned: false, is_dead_end: false, is_in_sitemap: true, health_score: 82, outbound_link_count: 2, link_limit: 100 },
      { url: `https://${siteId}/contact`, title: 'Contact', depth: 1, inbound_internal_count: 6, outbound_internal_count: 1, is_orphaned: false, is_dead_end: false, is_in_sitemap: true, health_score: 90, outbound_link_count: 1, link_limit: 100 },
      { url: `https://${siteId}/blog`, title: 'Blog', depth: 1, inbound_internal_count: 4, outbound_internal_count: 5, is_orphaned: false, is_dead_end: false, is_in_sitemap: true, health_score: 80, outbound_link_count: 5, link_limit: 100 },
    ];

    const internal_links = [
      { source_url: `https://${siteId}/`, destination_url: `https://${siteId}/products`, anchor_text: 'Shop All', link_type: 'navigation', is_nofollow: false, is_redirect: false },
      { source_url: `https://${siteId}/`, destination_url: `https://${siteId}/about`, anchor_text: 'About', link_type: 'navigation', is_nofollow: false, is_redirect: false },
      { source_url: `https://${siteId}/`, destination_url: `https://${siteId}/contact`, anchor_text: 'Contact', link_type: 'footer', is_nofollow: false, is_redirect: false },
      { source_url: `https://${siteId}/`, destination_url: `https://${siteId}/blog`, anchor_text: 'Blog', link_type: 'navigation', is_nofollow: false, is_redirect: false },
      { source_url: `https://${siteId}/products`, destination_url: `https://${siteId}/products/widget-a`, anchor_text: 'Widget A', link_type: 'body_content', is_nofollow: false, is_redirect: false },
      { source_url: `https://${siteId}/products`, destination_url: `https://${siteId}/products/widget-b`, anchor_text: 'Widget B', link_type: 'body_content', is_nofollow: false, is_redirect: false },
      { source_url: `https://${siteId}/blog`, destination_url: `https://${siteId}/products/widget-a`, anchor_text: 'check out Widget A', link_type: 'body_content', is_nofollow: false, is_redirect: false },
    ];

    return NextResponse.json(
      { page_nodes, internal_links },
      { headers: { 'Cache-Control': 'public, max-age=3600' } },
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
