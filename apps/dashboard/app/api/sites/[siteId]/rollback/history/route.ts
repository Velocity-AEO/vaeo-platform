/**
 * apps/dashboard/app/api/sites/[siteId]/rollback/history/route.ts
 *
 * GET /api/sites/{siteId}/rollback/history
 *   Returns the last 20 RollbackRecords for the site, ordered by
 *   rolled_back_at desc.
 */

import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { siteId } = await ctx.params;

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    const { data, error } = await (db as any)
      .from('rollback_history')
      .select('*')
      .eq('site_id', siteId)
      .order('rolled_back_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json(data ?? [], {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
