/**
 * apps/dashboard/app/api/sites/[siteId]/link-graph/fix-external/route.ts
 *
 * POST /api/sites/:siteId/link-graph/fix-external
 * Applies an external link fix (remove, update, add nofollow).
 * Requires auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyExternalLinkFix } from '../../../../../../../../tools/link_graph/external_link_fixer.js';
import type { ExternalLinkFix } from '../../../../../../../../tools/link_graph/external_link_fixer.js';

type Ctx = { params: Promise<{ siteId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const headers = { 'Cache-Control': 'no-store' };

  try {
    const { siteId } = await ctx.params;
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400, headers });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Auth check
    const { data: { user } } = await (db as any).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    // Site ownership
    const { data: site } = await (db as any)
      .from('sites')
      .select('site_id, platform')
      .eq('site_id', siteId)
      .maybeSingle();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404, headers });
    }

    const body = await req.json().catch(() => null);
    const fix: ExternalLinkFix | null = body?.fix ?? null;

    if (!fix || !fix.fix_type || !fix.source_url) {
      return NextResponse.json({ error: 'Invalid fix payload' }, { status: 400, headers });
    }

    const platform: 'shopify' | 'wordpress' = site.platform ?? 'shopify';
    const success = await applyExternalLinkFix(fix, siteId, platform);

    return NextResponse.json({ success }, { headers });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500, headers });
  }
}
