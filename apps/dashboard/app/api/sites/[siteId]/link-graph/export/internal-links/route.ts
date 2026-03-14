/**
 * apps/dashboard/app/api/sites/[siteId]/link-graph/export/internal-links/route.ts
 *
 * GET /api/sites/:siteId/link-graph/export/internal-links
 * Returns internal links as CSV download. Requires auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportInternalLinks } from '@tools/link_graph/link_graph_exporter.js';
import type { InternalLink } from '@tools/link_graph/link_graph_types.js';

type Ctx = { params: Promise<{ siteId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { siteId } = await ctx.params;
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    const { data: { user } } = await (db as any).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: site } = await (db as any)
      .from('sites')
      .select('site_id, domain')
      .eq('site_id', siteId)
      .maybeSingle();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { data: linkData } = await (db as any)
      .from('internal_links')
      .select('*')
      .eq('site_id', siteId)
      .limit(50000);

    const links: InternalLink[] = Array.isArray(linkData) ? linkData : [];
    const result = exportInternalLinks(links);

    const domain   = site.domain ?? siteId;
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `vaeo-internal-links-${domain}-${date}.csv`;

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
