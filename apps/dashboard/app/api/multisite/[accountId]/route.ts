/**
 * apps/dashboard/app/api/multisite/[accountId]/route.ts
 *
 * GET /api/multisite/:accountId — returns multi-site summary for the account
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAccountSites,
  shouldShowMultisiteDashboard,
} from '../../../../../../tools/multisite/multisite_account_resolver.js';
import { buildMultisiteSummary }  from '../../../../../../tools/multisite/multisite_aggregator.js';
import {
  buildMultisiteResponse,
  buildEmptyMultisiteResponse,
  getMultisiteCacheHeader,
  parseAccountIdParam,
} from '../../../../../../tools/multisite/multisite_api_logic.js';

type Ctx = { params: Promise<{ accountId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { accountId } = await ctx.params;
    const account_id    = parseAccountIdParam(accountId);

    if (!account_id) {
      return NextResponse.json({ error: 'accountId is required' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Resolve which sites belong to this account
    const account = await resolveAccountSites(account_id, {
      detectAccountTypeFn: async (id) => {
        const { data } = await (db as any)
          .from('agency_accounts')
          .select('agency_id')
          .eq('agency_id', id)
          .eq('active', true)
          .maybeSingle();
        return data ? 'agency' : 'direct';
      },
      loadDirectSitesFn: async (id) => {
        const { data } = await (db as any)
          .from('sites')
          .select('site_id')
          .eq('account_id', id)
          .eq('active', true);
        return (data ?? []).map((r: { site_id: string }) => r.site_id);
      },
      loadAgencySitesFn: async (id) => {
        const { data } = await (db as any)
          .from('agency_client_sites')
          .select('site_id')
          .eq('agency_id', id)
          .eq('active', true);
        return (data ?? []).map((r: { site_id: string }) => r.site_id);
      },
    });

    if (!shouldShowMultisiteDashboard(account)) {
      return NextResponse.json(buildEmptyMultisiteResponse(account_id), {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Build summary with live snapshots from DB
    const summary = await buildMultisiteSummary(account_id, account.site_ids, {
      loadSnapshotFn: async (site_id) => {
        const { data } = await (db as any)
          .from('site_health_snapshots')
          .select('*')
          .eq('site_id', site_id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) throw new Error('no snapshot');
        return data;
      },
    });

    const response = buildMultisiteResponse(account, summary);
    const cache    = getMultisiteCacheHeader(account.account_type);

    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': cache },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
