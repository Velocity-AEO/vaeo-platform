/**
 * apps/dashboard/app/api/sites/[siteId]/orphaned/route.ts
 *
 * GET /api/sites/:siteId/orphaned
 * Returns orphaned page issues for a site (no inbound internal links).
 * Requires auth — site must belong to the session user.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { OrphanedPageIssue } from '../../../../../../../tools/orphaned/orphaned_page_issue_builder.js';

type Ctx = { params: Promise<{ siteId: string }> };

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { siteId } = await ctx.params;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Auth check
    const { data: { user } } = await (db as any).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Site ownership check
    let isAuthorized = false;
    try {
      const { data: site } = await (db as any)
        .from('sites')
        .select('user_id, site_id')
        .eq('site_id', siteId)
        .maybeSingle();

      if (!site) {
        return NextResponse.json({ error: 'Site not found' }, {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      const { data: profile } = await (db as any)
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      isAuthorized =
        profile?.role === 'admin' ||
        site?.user_id === user.id;
    } catch {
      // Fail closed on auth error
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Parse query params
    const url    = new URL(req.url);
    const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

    // Load orphaned page issues from DB
    let pages: OrphanedPageIssue[] = [];
    let total = 0;
    let last_detected_at: string | null = null;

    try {
      const { data, error, count } = await (db as any)
        .from('orphaned_page_issues')
        .select('*', { count: 'exact' })
        .eq('site_id', siteId)
        .order('detected_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error && Array.isArray(data)) {
        pages = data as OrphanedPageIssue[];
        total = count ?? data.length;
        last_detected_at = pages[0]?.detected_at ?? null;
      }
    } catch {
      // Return empty on DB error — non-fatal
    }

    return NextResponse.json(
      { total, pages, last_detected_at },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
