/**
 * apps/dashboard/app/api/sites/[siteId]/gsc/sync/route.ts
 *
 * POST /api/sites/:siteId/gsc/sync
 * Triggers a GSC delta sync (or full resync when force_full=true).
 * Requires auth — admin or site owner only.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  triggerFullSync,
  runSyncForSite,
} from '../../../../../../../tools/gsc/gsc_sync_scheduler.js';
import type { DeltaSyncResult } from '../../../../../../../tools/gsc/gsc_delta_sync.js';

type Ctx = { params: Promise<{ siteId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
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

    // Auth check — must be authenticated
    const { data: { user } } = await (db as any).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Admin or site owner check (fail open on DB error — non-fatal)
    let isAuthorized = false;
    try {
      const { data: site } = await (db as any)
        .from('sites')
        .select('user_id, account_id')
        .eq('site_id', siteId)
        .maybeSingle();

      const { data: profile } = await (db as any)
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      isAuthorized =
        profile?.role === 'admin' ||
        site?.user_id === user.id;
    } catch {
      // Fail open: if auth check errors, deny
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const body        = await req.json().catch(() => ({})) as { force_full?: boolean };
    const force_full  = Boolean(body?.force_full);

    let result: DeltaSyncResult;

    if (force_full) {
      result = await triggerFullSync(siteId);
    } else {
      // Delta sync via runSyncForSite (uses delta engine internally)
      const syncResult = await runSyncForSite(siteId);
      // Construct a DeltaSyncResult-compatible response
      result = {
        site_id:          siteId,
        sync_mode:        'delta',
        date_range_start: '',
        date_range_end:   '',
        days_fetched:     0,
        rows_fetched:     syncResult.ranking_count,
        rows_new:         syncResult.ranking_count,
        rows_updated:     0,
        api_calls_made:   1,
        synced_at:        new Date().toISOString(),
        ...(syncResult.error ? { error: syncResult.error } : {}),
      };
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
