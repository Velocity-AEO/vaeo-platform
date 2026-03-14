/**
 * apps/dashboard/app/api/sites/[siteId]/link-graph/export/opportunities/route.ts
 *
 * GET /api/sites/:siteId/link-graph/export/opportunities
 * Returns link suggestions as CSV download. Requires auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportLinkOpportunities } from '@tools/link_graph/link_graph_exporter.js';
import type { LinkSuggestion } from '@tools/link_graph/link_suggester.js';

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

    const { data: suggData } = await (db as any)
      .from('link_suggestions')
      .select('*')
      .eq('site_id', siteId)
      .limit(5000);

    const suggestions: LinkSuggestion[] = Array.isArray(suggData) ? suggData : [];
    const result = exportLinkOpportunities(suggestions);

    const domain   = site.domain ?? siteId;
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `vaeo-opportunities-${domain}-${date}.csv`;

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
